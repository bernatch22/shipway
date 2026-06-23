import { getProcessManager } from '../process-managers/index.js';
import { ExitCode } from '../errors/index.js';
import type { Command, CommandContext } from './types.js';

class LogsCommand implements Command {
  readonly name = 'logs';
  readonly description = 'Tail remote service logs';
  readonly usage = 'shipway logs [service|strategy] [--lines N] [--follow] [--grep PATTERN]';

  async execute(ctx: CommandContext): Promise<number> {
    if (!ctx.config) {
      ctx.logger.error('No shipway config found.');
      return ExitCode.CONFIG;
    }

    const serviceArg = ctx.args[0];
    const ssh = await ctx.createSSH();

    const lines = typeof ctx.flags.lines === 'string' ? parseInt(ctx.flags.lines, 10) : 50;
    const follow = ctx.flags.follow === true || ctx.flags.f === true;
    const grep = typeof ctx.flags.grep === 'string' ? ctx.flags.grep : undefined;
    const since = typeof ctx.flags.since === 'string' ? ctx.flags.since : undefined;

    // Named log strategy (shipway.yml `logs:`) — tail a raw remote file/cmd
    // directly over SSH, bypassing the process manager (no pm2 buffering/lag).
    // Checked before services so a strategy name always wins.
    if (serviceArg && ctx.config.logs?.[serviceArg]) {
      const strat = ctx.config.logs[serviceArg];
      const backlog = typeof ctx.flags.lines === 'string' ? lines : strat.lines ?? lines;
      const remoteCmd = strat.cmd ?? (strat.file ? buildTailCommand(strat.file, backlog, follow, grep) : null);
      if (!remoteCmd) {
        ctx.logger.error(`Log strategy "${serviceArg}" needs a "file" or "cmd".`);
        return ExitCode.CONFIG;
      }
      if (follow) {
        // Stream live with a forced PTY so output isn't block-buffered.
        await ssh.exec(remoteCmd, { allowFail: true, tty: true });
        return ExitCode.OK;
      }
      const output = await ssh.execSilent(remoteCmd, { allowFail: true });
      if (output) ctx.logger.raw(`${output}\n`);
      return ExitCode.OK;
    }

    // Multi-service: if a service is specified, show its logs
    if (serviceArg && ctx.config.services?.[serviceArg]) {
      const svc = ctx.config.services[serviceArg];
      const pm = getProcessManager(svc.restart.method);
      const name = svc.restart.name ?? `${ctx.config.name}-${serviceArg}`;
      const output = await pm.logs(ssh, name, { lines, follow, grep, since });
      if (output) ctx.logger.raw(`${output}\n`);
      return ExitCode.OK;
    }

    // Multi-service: no service specified → show all
    if (ctx.config.services && Object.keys(ctx.config.services).length > 0) {
      if (!serviceArg) {
        // Show logs for all services
        for (const [svcName, svc] of Object.entries(ctx.config.services)) {
          const pm = getProcessManager(svc.restart.method);
          const name = svc.restart.name ?? `${ctx.config.name}-${svcName}`;
          ctx.logger.raw(`━━━ ${svcName} ━━━\n`);
          const output = await pm.logs(ssh, name, { lines, follow, grep, since });
          if (output) ctx.logger.raw(`${output}\n`);
          ctx.logger.blank();
        }
        return ExitCode.OK;
      }

      // Service not found
      const available = Object.keys(ctx.config.services).join(', ');
      ctx.logger.error(`Service "${serviceArg}" not found. Available: ${available}`);
      return ExitCode.CONFIG;
    }

    // Single-service
    if (ctx.config.restart.method === 'none') {
      ctx.logger.info('No process manager configured. No logs available.');
      return ExitCode.OK;
    }

    const pm = getProcessManager(ctx.config.restart.method);
    const name = ctx.config.restart.name ?? ctx.config.name;
    const output = await pm.logs(ssh, name, { lines, follow, grep, since });
    if (output) ctx.logger.raw(`${output}\n`);

    return ExitCode.OK;
  }
}

/** Build a `tail` command for a remote log file. */
function buildTailCommand(file: string, lines: number, follow: boolean, grep?: string): string {
  // -F keeps following across log rotation/truncation, and waits if the file
  // doesn't exist yet (handy right after a deploy before the first line lands).
  const tail = `tail -n ${lines}${follow ? ' -F' : ''} ${file} 2>/dev/null`;
  if (!grep) return tail;
  // --line-buffered so matches flush immediately when streaming under a PTY.
  return `${tail} | grep --line-buffered -i ${shQuote(grep)}`;
}

/** Single-quote a string for safe use inside a remote shell command. */
function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export default new LogsCommand();
