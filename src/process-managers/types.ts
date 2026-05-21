import type { SSHClient } from '../ssh/client.js';

export interface StartOpts {
  name: string;
  command: string;
  cwd: string;
  env?: Record<string, string>;
}

export interface LogsOpts {
  lines?: number;
  follow?: boolean;
  grep?: string;
  since?: string;
}

export interface ProcessStatus {
  running: boolean;
  name: string;
  pid?: number;
  uptime?: string;
  memory?: string;
  cpu?: string;
  restarts?: number;
  status: string;
}

/**
 * Process manager adapter interface.
 * Implementations: pm2, systemd, none.
 */
export interface ProcessManager {
  readonly kind: 'pm2' | 'systemd' | 'none';
  start(ssh: SSHClient, opts: StartOpts): Promise<void>;
  stop(ssh: SSHClient, name: string): Promise<void>;
  restart(ssh: SSHClient, name: string, env?: Record<string, string>): Promise<void>;
  status(ssh: SSHClient, name: string): Promise<ProcessStatus>;
  logs(ssh: SSHClient, name: string, opts: LogsOpts): Promise<string>;
}
