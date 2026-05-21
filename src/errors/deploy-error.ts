import { ShipwayError } from './base.js';
import { ExitCode, type ExitCodeValue } from './exit-codes.js';

export class DeployError extends ShipwayError {
  readonly exitCode: ExitCodeValue;
  readonly category = 'deploy';

  constructor(
    public readonly step: string,
    cause?: unknown,
  ) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    super(`Deploy failed at step "${step}": ${msg}`, cause);
    // Inherit exit code from cause if it's a ShipwayError, otherwise use BUILD default
    this.exitCode = cause instanceof ShipwayError ? cause.exitCode : ExitCode.BUILD as ExitCodeValue;
  }
}
