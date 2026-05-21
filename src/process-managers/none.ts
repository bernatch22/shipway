import type { SSHClient } from '../ssh/client.js';
import type { ProcessManager, StartOpts, LogsOpts, ProcessStatus } from './types.js';

/**
 * No-op process manager for static sites without a running process.
 */
export class NoneManager implements ProcessManager {
  readonly kind = 'none' as const;

  async start(_ssh: SSHClient, _opts: StartOpts): Promise<void> {
    // No-op
  }

  async stop(_ssh: SSHClient, _name: string): Promise<void> {
    // No-op
  }

  async restart(_ssh: SSHClient, _name: string): Promise<void> {
    // No-op
  }

  async status(_ssh: SSHClient, name: string): Promise<ProcessStatus> {
    return { running: false, name, status: 'no process manager' };
  }

  async logs(_ssh: SSHClient, _name: string, _opts: LogsOpts): Promise<string> {
    return 'No process manager configured. No logs available.';
  }
}
