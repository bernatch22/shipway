import type { SSHClient } from '../ssh/client.js';
import type { LogsOpts, ProcessManager, ProcessStatus, StartOpts } from './types.js';

/**
 * pm2 process manager adapter.
 */
export class Pm2Manager implements ProcessManager {
  readonly kind = 'pm2' as const;

  async start(ssh: SSHClient, opts: StartOpts): Promise<void> {
    // Check if process exists
    const check = await ssh.execSilent(`pm2 id ${opts.name} 2>/dev/null || echo NOTFOUND`, {
      allowFail: true,
    });

    const wanted = opts.killTimeout;
    if (check.includes('NOTFOUND') || check.includes('[]')) {
      // First time — start with pm2
      await ssh.exec(this.startLine(opts));
    } else if (wanted !== undefined && (await this.killTimeoutOf(ssh, opts.name)) !== wanted) {
      // `pm2 restart --kill-timeout` does not change a process's kill_timeout: only a start does. So
      // a changed one recreates the process — and this one stop still uses the timeout it had.
      await ssh.exec(`pm2 delete ${opts.name}`, { silent: true });
      await ssh.exec(this.startLine(opts));
    } else {
      await ssh.exec(`pm2 restart ${opts.name} --update-env`, { silent: true });
    }

    await this.save(ssh);
  }

  private startLine(opts: StartOpts): string {
    const grace = opts.killTimeout === undefined ? '' : ` --kill-timeout ${opts.killTimeout}`;
    return `cd ${opts.cwd} && pm2 start '${opts.command}' --name ${opts.name}${grace}`;
  }

  /** The kill_timeout pm2 holds for this process, or undefined when none was ever set. */
  private async killTimeoutOf(ssh: SSHClient, name: string): Promise<number | undefined> {
    const listed = await ssh.execSilent(`pm2 jlist 2>/dev/null || echo "[]"`, { allowFail: true });
    try {
      const processes: unknown = JSON.parse(listed);
      if (!Array.isArray(processes)) return undefined;
      const proc = processes.find((p: Record<string, unknown>) => p.name === name) as
        | { pm2_env?: { kill_timeout?: unknown } }
        | undefined;
      const held = proc?.pm2_env?.kill_timeout;
      return typeof held === 'number' ? held : undefined;
    } catch {
      return undefined;
    }
  }

  async stop(ssh: SSHClient, name: string): Promise<void> {
    await ssh.exec(`pm2 stop ${name}`, { silent: true, allowFail: true });
  }

  async restart(ssh: SSHClient, name: string, env?: Record<string, string>): Promise<void> {
    const envPrefix = env
      ? `${Object.entries(env)
          .map(([k, v]) => `${k}="${v}"`)
          .join(' ')} `
      : '';
    await ssh.exec(`${envPrefix}pm2 restart ${name} --update-env`, { silent: true });
    await this.save(ssh);
  }

  /**
   * Freeze the current process list to `~/.pm2/dump.pm2`.
   *
   * pm2 only resurrects on boot from that dump (via the `pm2-<user>` systemd unit
   * installed by `pm2 startup`). Without a save after each deploy the box reboots
   * into a stale snapshot — a service added by a later deploy simply never comes
   * back. Best-effort: a box without `pm2 startup` configured still deploys fine.
   */
  private async save(ssh: SSHClient): Promise<void> {
    await ssh.exec('pm2 save', { silent: true, allowFail: true });
  }

  async status(ssh: SSHClient, name: string): Promise<ProcessStatus> {
    const result = await ssh.execSilent(`pm2 jlist 2>/dev/null || echo "[]"`, { allowFail: true });

    try {
      const processes = JSON.parse(result);
      const proc = Array.isArray(processes)
        ? processes.find((p: Record<string, unknown>) => p.name === name)
        : null;

      if (!proc) {
        return { running: false, name, status: 'not found' };
      }

      return {
        running: proc.pm2_env?.status === 'online',
        name,
        pid: proc.pid,
        uptime: proc.pm2_env?.pm_uptime
          ? formatUptime(Date.now() - proc.pm2_env.pm_uptime)
          : undefined,
        memory: proc.monit?.memory ? `${Math.round(proc.monit.memory / 1024 / 1024)}MB` : undefined,
        cpu: proc.monit?.cpu !== undefined ? `${proc.monit.cpu}%` : undefined,
        restarts: proc.pm2_env?.restart_time,
        status: proc.pm2_env?.status ?? 'unknown',
      };
    } catch {
      return { running: false, name, status: 'parse error' };
    }
  }

  async logs(ssh: SSHClient, name: string, opts: LogsOpts): Promise<string> {
    const args = ['pm2', 'logs', name];
    if (!opts.follow) args.push('--nostream');
    if (opts.lines) args.push('--lines', String(opts.lines));
    if (opts.follow) args.push('--raw');

    // Follow mode: stream with forced PTY for real-time output (no block buffering)
    if (opts.follow) {
      await ssh.exec(args.join(' '), { allowFail: true, tty: true });
      return '';
    }

    const result = await ssh.execSilent(args.join(' '), { allowFail: true });

    if (opts.grep) {
      return result
        .split('\n')
        .filter((line) => line.toLowerCase().includes(opts.grep!.toLowerCase()))
        .join('\n');
    }

    return result;
  }
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
