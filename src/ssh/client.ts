import { spawn } from 'node:child_process';
import { SSHError } from '../errors/index.js';
import type { ExecResult } from '../utils/exec.js';
import { buildSshArgs } from './args.js';

export interface SSHExecOptions {
  silent?: boolean;
  allowFail?: boolean;
  timeoutMs?: number;
  /** Force pseudo-TTY (-tt) for real-time streaming. Requires key-based auth. */
  tty?: boolean;
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
    const { silent = false, allowFail = false, timeoutMs, tty = false } = options;
    const sshArgs = buildSshArgs(this.keyPath);
    // -tt forces PTY even without a local terminal → line-buffered output
    if (tty) sshArgs.push('-tt');
    const args = [...sshArgs, this.server, command];

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
          reject(new SSHError(`Remote command failed on ${this.server}`, command, exitCode));
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
   * Execute a remote command, piping `input` to its stdin. stdout/stderr are
   * captured. Used to stream file contents to the remote (see writeRemoteFile).
   */
  async execWithInput(
    command: string,
    input: string | Buffer,
    options: SSHExecOptions = {},
  ): Promise<ExecResult> {
    const { allowFail = false, timeoutMs } = options;
    const args = [...buildSshArgs(this.keyPath), this.server, command];

    return new Promise<ExecResult>((resolve, reject) => {
      const signal = timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined;
      const child = spawn('ssh', args, { stdio: ['pipe', 'pipe', 'pipe'], signal });

      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (d: Buffer) => {
        stdout += d.toString();
      });
      child.stderr?.on('data', (d: Buffer) => {
        stderr += d.toString();
      });

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
          reject(new SSHError(`Remote command failed on ${this.server}`, command, exitCode));
          return;
        }
        resolve({ stdout: stdout.trimEnd(), stderr: stderr.trimEnd(), exitCode });
      });

      child.stdin?.write(input);
      child.stdin?.end();
    });
  }

  /**
   * Read a remote file's raw bytes. Returns null if the file does not exist.
   * Transferred as base64 so binary/whitespace is preserved exactly.
   */
  async readRemoteFile(remotePath: string): Promise<Buffer | null> {
    const NOFILE = '__SHIPWAY_NOFILE__';
    const res = await this.exec(
      `if [ -f ${remotePath} ]; then base64 ${remotePath}; else echo ${NOFILE}; fi`,
      { silent: true, allowFail: true },
    );
    if (res.exitCode !== 0) {
      throw new SSHError(
        `Could not read remote file ${remotePath}`,
        'readRemoteFile',
        res.exitCode,
      );
    }
    const out = res.stdout.trim();
    if (out === NOFILE) return null;
    return Buffer.from(out, 'base64');
  }

  /**
   * Write bytes to a remote file atomically (write temp → mv). When `backup` is
   * set, the existing file is copied to `<path>.bak` first.
   */
  async writeRemoteFile(
    remotePath: string,
    content: Buffer,
    opts: { backup?: boolean } = {},
  ): Promise<void> {
    const tmp = `${remotePath}.shipway-tmp`;
    const backupCmd = opts.backup
      ? `( [ -f ${remotePath} ] && cp ${remotePath} ${remotePath}.bak || true ); `
      : '';
    const cmd = `${backupCmd}base64 -d > ${tmp} && mv ${tmp} ${remotePath}`;
    const res = await this.execWithInput(cmd, content.toString('base64'), { allowFail: true });
    if (res.exitCode !== 0) {
      throw new SSHError(
        `Could not write remote file ${remotePath}: ${res.stderr}`.trim(),
        'writeRemoteFile',
        res.exitCode,
      );
    }
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
      '-L',
      `${localPort}:${remoteHost}:${remotePort}`,
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
