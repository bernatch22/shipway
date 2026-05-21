import type { ExitCodeValue } from './exit-codes.js';

/**
 * Base error class for all shipway errors.
 * Carries an exit code and category for structured error handling.
 */
export abstract class ShipwayError extends Error {
  abstract readonly exitCode: ExitCodeValue;
  abstract readonly category: string;

  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}
