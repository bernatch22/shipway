import { spawn } from 'node:child_process';
import { buildSshArgs } from './args.js';
import { SSHError } from '../errors/index.js';
import type { ExecResult } from '../utils/exec.js';

export interface SSHExecOptions {
  silent?: boolean;
  allowFail?: boolean;
  timeoutMs?: number;
}

/**
 * SSH client for executing commands on a remote host.
 * Injected as a dependency — not a singleton.
 */
export class SSHClient {
  constructor(
    private readonly server: string,
    private readonly keyPath?: string,
  ) {}

  /**
   * Execute a command on the remote host.
   */
  async exec(command: string, options: SSHExecOptions = {}): Promise<ExecResult> {
    const { silent = false, allowFail = false, timeoutMs } = options;
    const args = [...buildSshArgs(this.keyPath), this.server, command];

    return new Promise<ExecResult>((resolve, reject) => {
      const signal = timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined;

      const child = spawn('ssh', args, {
        stdio: silent ? 'pipe' : ['pipe', 'inherit', 'inherit'],
        signal,
      });

      let stdout = '';
      let stderr = '';

      if (silent) {
        child.stdout?.on('data', (data: Buffer) => {
          stdout += data.toString();
        });
        child.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString();
        });
      }

      child.on('error', (err) => {
        if (allowFail) {
          resolve({ stdout: '', stderr: err.message, exitCode: 1 });
          return;
        }
        reject(new SSHError(`SSH connection failed: ${err.message}`, command, undefined, err));
      });

      child.on('close', (code) => {
        const exitCode = code ?? 1;
        if (exitCode !== 0 && !allowFail) {
          reject(
            new SSHError(
              `Remote command failed on ${this.server}`,
              command,
              exitCode,
            ),
          );
          return;
        }
        resolve({ stdout: stdout.trimEnd(), stderr: stderr.trimEnd(), exitCode });
      });
    });
  }

  /**
   * Execute a command silently and return stdout.
   */
  async execSilent(command: string, options: SSHExecOptions = {}): Promise<string> {
    const result = await this.exec(command, { ...options, silent: true });
    return result.stdout;
  }

  /**
   * Open an interactive SSH session (stdio: inherit).
   */
  interactive(): Promise<number> {
    const args = [...buildSshArgs(this.keyPath), this.server];

    return new Promise<number>((resolve, reject) => {
      const child = spawn('ssh', args, { stdio: 'inherit' });
      child.on('error', reject);
      child.on('close', (code) => resolve(code ?? 0));
    });
  }

  /**
   * Open an SSH tunnel: forwards localPort to remoteHost:remotePort.
   * Returns a handle to close the tunnel.
   */
  tunnel(
    localPort: number,
    remoteHost: string,
    remotePort: number,
  ): { close: () => void; process: ReturnType<typeof spawn> } {
    const args = [
      ...buildSshArgs(this.keyPath),
      '-L', `${localPort}:${remoteHost}:${remotePort}`,
      '-N',
      this.server,
    ];

    const child = spawn('ssh', args, { stdio: 'ignore' });

    return {
      close: () => {
        child.kill('SIGTERM');
      },
      process: child,
    };
  }

  /** Get the server connection string. */
  get serverAddress(): string {
    return this.server;
  }
}
