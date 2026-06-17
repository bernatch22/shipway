import { existsSync } from 'node:fs';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { NormalizedEnvFile } from '../config/types.js';
import { ExitCode } from '../errors/index.js';
import { HostResolver } from '../host/resolver.js';
import { bold, cyan, dim, green, red, yellow } from '../logging/colors.js';
import type { Command, CommandContext } from './types.js';

type Action = 'pull' | 'push' | 'diff';

/**
 * `shipway env` — manage the remote `.env` without it being clobbered by deploys.
 *
 *   shipway env [diff]          show key-level diff (local vs remote) — read-only
 *   shipway env pull [--out p]  download the remote .env to a local file
 *   shipway env push [path]     upload a local .env to the remote (needs --yes)
 *
 * Values are NEVER printed — diffs show key names only. Pull writes 0600 and
 * refuses to clobber an existing file without --force. Push backs up the remote
 * to `<path>.bak`, writes atomically, and can `--restart` the service after.
 */
class EnvCommand implements Command {
  readonly name = 'env';
  readonly description = 'Pull/push/diff the remote .env file';
  readonly usage = 'shipway env [diff|pull|push] [--out <path>] [--yes] [--force] [--restart]';

  async execute(ctx: CommandContext): Promise<number> {
    if (!ctx.config) {
      ctx.logger.error('No shipway config found.');
      return ExitCode.CONFIG;
    }

    const env = this.resolveEnvFile(ctx);
    if (!env) {
      ctx.logger.error('No env file location resolved. Set `env:` or `remoteDir:` in shipway.yml.');
      return ExitCode.CONFIG;
    }
    const remotePath = (ctx.flags.remote as string) || env.remote;

    const sub = ctx.args[0];
    const action: Action = sub === 'pull' || sub === 'push' ? sub : 'diff';
    // For pull/push the second positional is an optional local path.
    const localArg = sub === 'pull' || sub === 'push' || sub === 'diff' ? ctx.args[1] : ctx.args[0];

    const ssh = await ctx.createSSH();
    const resolver = new HostResolver();
    const host = await resolver.resolve(ctx.config.host);

    if (action === 'pull') return this.pull(ctx, ssh, remotePath, host.ssh, env, localArg);
    if (action === 'push') return this.push(ctx, ssh, remotePath, host.ssh, env, localArg);
    return this.diff(ctx, ssh, remotePath, host.ssh, env, localArg);
  }

  private resolveEnvFile(ctx: CommandContext): NormalizedEnvFile | undefined {
    return ctx.config?.env;
  }

  // ── pull ────────────────────────────────────────────────────────────────
  private async pull(
    ctx: CommandContext,
    ssh: Awaited<ReturnType<CommandContext['createSSH']>>,
    remotePath: string,
    server: string,
    env: NormalizedEnvFile,
    localArg?: string,
  ): Promise<number> {
    const out = resolve(ctx.cwd, (ctx.flags.out as string) || localArg || env.local);
    const force = ctx.flags.force === true || ctx.flags.yes === true;

    if (existsSync(out) && !force) {
      ctx.logger.error(
        `Refusing to overwrite ${rel(ctx.cwd, out)} — pass --force or --out <path>.`,
      );
      return ExitCode.GENERAL;
    }

    const buf = await ssh.readRemoteFile(remotePath);
    if (buf === null) {
      ctx.logger.error(`No remote env file at ${server}:${remotePath}`);
      return ExitCode.GENERAL;
    }

    await writeFile(out, buf);
    await chmod(out, 0o600).catch(() => {
      /* best-effort on non-POSIX */
    });

    const keys = [...parseEnvKeys(buf.toString('utf-8')).keys()];
    ctx.logger.success(
      `Pulled ${dim(`${server}:${remotePath}`)} → ${cyan(rel(ctx.cwd, out))} ${dim(`(${keys.length} keys, 0600)`)}`,
    );
    if (keys.length) ctx.logger.raw(`  ${dim('keys:')} ${keys.join(', ')}\n`);
    return ExitCode.OK;
  }

  // ── push ────────────────────────────────────────────────────────────────
  private async push(
    ctx: CommandContext,
    ssh: Awaited<ReturnType<CommandContext['createSSH']>>,
    remotePath: string,
    server: string,
    env: NormalizedEnvFile,
    localArg?: string,
  ): Promise<number> {
    const src = resolve(ctx.cwd, (ctx.flags.file as string) || localArg || env.local);
    if (!existsSync(src)) {
      ctx.logger.error(`Local env file not found: ${rel(ctx.cwd, src)}`);
      return ExitCode.GENERAL;
    }

    const localBuf = await readFile(src);
    const remoteBuf = await ssh.readRemoteFile(remotePath);
    const localKeys = parseEnvKeys(localBuf.toString('utf-8'));
    const remoteKeys = remoteBuf
      ? parseEnvKeys(remoteBuf.toString('utf-8'))
      : new Map<string, string>();
    const d = diffKeys(localKeys, remoteKeys);

    ctx.logger.raw(this.renderDiff(server, remotePath, rel(ctx.cwd, src), d, remoteBuf === null));

    if (!d.added.length && !d.removed.length && !d.changed.length) {
      ctx.logger.success('Remote already matches local — nothing to push.');
      return ExitCode.OK;
    }

    if (ctx.flags.yes !== true) {
      ctx.logger.warn(
        'Dry run. Re-run with --yes to write the remote .env (a .bak backup is kept).',
      );
      return ExitCode.OK;
    }

    await ssh.writeRemoteFile(remotePath, localBuf, { backup: true });
    ctx.logger.success(
      `Pushed ${cyan(rel(ctx.cwd, src))} → ${dim(`${server}:${remotePath}`)} ${dim(`(backup: ${remotePath}.bak)`)}`,
    );

    if (ctx.flags.restart === true) {
      const code = await this.restart(ctx, ssh);
      if (code !== ExitCode.OK) return code;
    } else {
      ctx.logger.info(dim('Restart the app to apply: shipway restart'));
    }
    return ExitCode.OK;
  }

  // ── diff ────────────────────────────────────────────────────────────────
  private async diff(
    ctx: CommandContext,
    ssh: Awaited<ReturnType<CommandContext['createSSH']>>,
    remotePath: string,
    server: string,
    env: NormalizedEnvFile,
    localArg?: string,
  ): Promise<number> {
    const src = resolve(ctx.cwd, (ctx.flags.file as string) || localArg || env.local);
    const remoteBuf = await ssh.readRemoteFile(remotePath);
    const remoteKeys = remoteBuf
      ? parseEnvKeys(remoteBuf.toString('utf-8'))
      : new Map<string, string>();

    if (!existsSync(src)) {
      ctx.logger.raw(
        `${dim('remote')} ${server}:${remotePath} ${dim(`(${remoteKeys.size} keys)`)}\n`,
      );
      ctx.logger.warn(
        `No local env file at ${rel(ctx.cwd, src)} to compare. Run: shipway env pull`,
      );
      return ExitCode.OK;
    }

    const localKeys = parseEnvKeys((await readFile(src)).toString('utf-8'));
    const d = diffKeys(localKeys, remoteKeys);
    ctx.logger.raw(this.renderDiff(server, remotePath, rel(ctx.cwd, src), d, remoteBuf === null));
    return ExitCode.OK;
  }

  private async restart(
    ctx: CommandContext,
    ssh: Awaited<ReturnType<CommandContext['createSSH']>>,
  ): Promise<number> {
    const r = ctx.config!.restart;
    if (r.method !== 'pm2' || !r.name) {
      ctx.logger.info(dim('No pm2 restart configured — restart manually.'));
      return ExitCode.OK;
    }
    ctx.logger.info(`Restarting pm2 process ${cyan(r.name)}…`);
    const res = await ssh.exec(`pm2 restart ${r.name}`, { allowFail: true });
    if (res.exitCode !== 0) {
      ctx.logger.error(`pm2 restart failed (exit ${res.exitCode}).`);
      return ExitCode.RESTART;
    }
    ctx.logger.success('Restarted.');
    return ExitCode.OK;
  }

  private renderDiff(
    server: string,
    remotePath: string,
    localRel: string,
    d: ReturnType<typeof diffKeys>,
    remoteMissing: boolean,
  ): string {
    const lines: string[] = [];
    lines.push('');
    lines.push(
      `${bold('env diff')}  ${cyan(localRel)} ${dim('(local)')}  →  ${dim(`${server}:${remotePath}`)}${remoteMissing ? ` ${yellow('(remote missing)')}` : ''}`,
    );
    lines.push('');
    if (d.added.length) for (const k of d.added) lines.push(`  ${green('+')} ${k} ${dim('(add)')}`);
    if (d.changed.length)
      for (const k of d.changed) lines.push(`  ${yellow('~')} ${k} ${dim('(change value)')}`);
    if (d.removed.length)
      for (const k of d.removed)
        lines.push(`  ${red('-')} ${k} ${dim('(remove — present on remote, absent locally)')}`);
    if (!d.added.length && !d.changed.length && !d.removed.length) {
      lines.push(`  ${dim(`in sync — ${d.same.length} keys match`)}`);
    } else {
      lines.push('');
      lines.push(
        `  ${dim(`${d.added.length} add · ${d.changed.length} change · ${d.removed.length} remove · ${d.same.length} unchanged`)}`,
      );
    }
    lines.push('');
    return lines.join('\n');
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────

function rel(cwd: string, p: string): string {
  return p.startsWith(cwd) ? `.${p.slice(cwd.length)}` : p;
}

/** Parse `KEY=VALUE` lines into a map. Ignores blanks, comments, malformed lines. */
function parseEnvKeys(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t
      .slice(0, eq)
      .replace(/^export\s+/, '')
      .trim();
    if (key) map.set(key, t.slice(eq + 1));
  }
  return map;
}

/** Key-level diff: what pushing local would do to remote. Values never leak out. */
function diffKeys(local: Map<string, string>, remote: Map<string, string>) {
  const added: string[] = []; // local-only → would be added
  const changed: string[] = []; // value differs
  const removed: string[] = []; // remote-only → would be removed on push
  const same: string[] = [];
  for (const [k, v] of local) {
    if (!remote.has(k)) added.push(k);
    else if (remote.get(k) !== v) changed.push(k);
    else same.push(k);
  }
  for (const k of remote.keys()) if (!local.has(k)) removed.push(k);
  return { added, changed, removed, same };
}

export default new EnvCommand();
