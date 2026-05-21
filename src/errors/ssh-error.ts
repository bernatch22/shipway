import { ShipwayError } from './base.js';
import { ExitCode } from './exit-codes.js';

export class SSHError extends ShipwayError {
  readonly exitCode = ExitCode.SSH;
  readonly category = 'ssh';

  constructor(
    message: string,
    public readonly command?: string,
    public readonly remoteExitCode?: number,
    cause?: unknown,
  ) {
    const parts = [message];
    if (command) parts.push(`Command: ${command}`);
    if (remoteExitCode !== undefined) parts.push(`Exit code: ${remoteExitCode}`);
    super(parts.join('\n  '), cause);
  }
}
