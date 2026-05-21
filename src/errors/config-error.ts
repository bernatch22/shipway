import { ShipwayError } from './base.js';
import { ExitCode } from './exit-codes.js';

export class ConfigError extends ShipwayError {
  readonly exitCode = ExitCode.CONFIG;
  readonly category = 'config';

  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(`Invalid config at "${field}": ${message}`);
  }
}
