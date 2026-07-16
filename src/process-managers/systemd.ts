import type { SSHClient } from '../ssh/client.js';
import type { LogsOpts, ProcessManager, ProcessStatus, StartOpts } from './types.js';

/**
 * systemd process manager adapter.
 */
export class SystemdManager implements ProcessManager {
  readonly kind = 'systemd' as const;

  async start(ssh: SSHClient, opts: StartOpts): Promise<void> {
    await ssh.exec(`sudo systemctl start ${opts.name}`);
  }

  async stop(ssh: SSHClient, name: string): Promise<void> {
    await ssh.exec(`sudo systemctl stop ${name}`, { allowFail: true });
  }

  async restart(ssh: SSHClient, name: string): Promise<void> {
    await ssh.exec(`sudo systemctl restart ${name}`);
  }

  async status(ssh: SSHClient, name: string): Promise<ProcessStatus> {
    const result = await ssh.execSilent(`systemctl is-active ${name} 2>/dev/null`, {
      allowFail: true,
    });

    const active = result.trim() === 'active';

    return {
      running: active,
      name,
      status: result.trim() || 'unknown',
    };
  }

  async logs(ssh: SSHClient, name: string, opts: LogsOpts): Promise<string> {
    const args = ['journalctl', '-u', name, '--no-pager'];
    if (opts.lines) args.push('-n', String(opts.lines));
    if (opts.follow) args.push('-f');
    if (opts.since) args.push('--since', opts.since);
    if (opts.grep) args.push('-g', opts.grep);

    return ssh.execSilent(args.join(' '), { allowFail: true });
  }
}
