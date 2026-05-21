import { ShipwayError } from './base.js';
import { ExitCode } from './exit-codes.js';

export class RsyncError extends ShipwayError {
  readonly exitCode = ExitCode.SYNC;
  readonly category = 'rsync';

  constructor(
    message: string,
    public readonly rsyncExitCode?: number,
    cause?: unknown,
  ) {
    super(message, cause);
  }
}
