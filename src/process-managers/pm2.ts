import type { SSHClient } from '../ssh/client.js';
import type { ProcessManager, StartOpts, LogsOpts, ProcessStatus } from './types.js';

/**
 * pm2 process manager adapter.
 */
export class Pm2Manager implements ProcessManager {
  readonly kind = 'pm2' as const;

  async start(ssh: SSHClient, opts: StartOpts): Promise<void> {
    // Check if process exists
    const check = await ssh.execSilent(
      `pm2 id ${opts.name} 2>/dev/null || echo NOTFOUND`,
      { allowFail: true },
    );

    if (check.includes('NOTFOUND') || check.includes('[]')) {
      // First time — start with pm2
      await ssh.exec(
        `cd ${opts.cwd} && pm2 start '${opts.command}' --name ${opts.name}`,
      );
    } else {
      await ssh.exec(`pm2 restart ${opts.name} --update-env`, { silent: true });
    }
  }

  async stop(ssh: SSHClient, name: string): Promise<void> {
    await ssh.exec(`pm2 stop ${name}`, { silent: true, allowFail: true });
  }

  async restart(ssh: SSHClient, name: string, env?: Record<string, string>): Promise<void> {
    const envPrefix = env
      ? Object.entries(env).map(([k, v]) => `${k}="${v}"`).join(' ') + ' '
      : '';
    await ssh.exec(`${envPrefix}pm2 restart ${name} --update-env`, { silent: true });
  }

  async status(ssh: SSHClient, name: string): Promise<ProcessStatus> {
    const result = await ssh.execSilent(
      `pm2 jlist 2>/dev/null || echo "[]"`,
      { allowFail: true },
    );

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
        memory: proc.monit?.memory
          ? `${Math.round(proc.monit.memory / 1024 / 1024)}MB`
          : undefined,
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
