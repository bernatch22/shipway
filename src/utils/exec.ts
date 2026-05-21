import { spawn } from 'node:child_process';

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  /** If true, pipe stdio to parent process */
  inherit?: boolean;
  /** If true, use shell (needed for && and || chains) */
  shell?: boolean;
}

/**
 * Spawn a process and collect output.
 * Uses AbortSignal.timeout for timeouts (Node 17.3+).
 */
export async function exec(
  command: string,
  args: string[],
  options: ExecOptions = {},
): Promise<ExecResult> {
  const { cwd, env, timeoutMs, inherit = false, shell = false } = options;

  return new Promise<ExecResult>((resolve, reject) => {
    const signal = timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined;

    const child = spawn(command, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: inherit ? 'inherit' : 'pipe',
      shell,
      signal,
    });

    let stdout = '';
    let stderr = '';

    if (!inherit) {
      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
    }

    child.on('error', (err) => {
      reject(err);
    });

    child.on('close', (code) => {
      resolve({
        stdout: stdout.trimEnd(),
        stderr: stderr.trimEnd(),
        exitCode: code ?? 1,
      });
    });
  });
}

/**
 * Run a command as a shell string (for user-provided build commands with &&, ||).
 */
export async function execShell(
  command: string,
  options: ExecOptions = {},
): Promise<ExecResult> {
  return exec('sh', ['-c', command], { ...options, shell: false });
}
