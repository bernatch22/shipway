import { gray, green, red, yellow } from './colors.js';
import { stepEnd, stepStart } from './format.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type OutputMode = 'human' | 'json';

export interface LoggerOptions {
  level: LogLevel;
  mode: OutputMode;
  quiet: boolean;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Logger with human and JSON output modes.
 * Never logs secrets — use redact() for sensitive values.
 */
export class Logger {
  private readonly level: number;
  private readonly mode: OutputMode;
  private readonly quiet: boolean;

  constructor(opts: Partial<LoggerOptions> = {}) {
    this.level = LEVEL_ORDER[opts.level ?? 'info'];
    this.mode = opts.mode ?? 'human';
    this.quiet = opts.quiet ?? false;
  }

  debug(message: string): void {
    this.log('debug', message);
  }

  info(message: string): void {
    this.log('info', message);
  }

  warn(message: string): void {
    this.log('warn', message);
  }

  error(message: string): void {
    this.log('error', message);
  }

  success(message: string): void {
    if (this.quiet) return;
    if (this.mode === 'json') {
      this.jsonLine({ level: 'info', message, status: 'success' });
    } else {
      process.stderr.write(`${green('✓')} ${message}\n`);
    }
  }

  /** Log the start of a pipeline step. */
  startStep(name: string): void {
    if (this.quiet) return;
    if (this.mode === 'json') {
      this.jsonLine({ event: 'step_start', step: name, ts: new Date().toISOString() });
    } else {
      process.stderr.write(`${stepStart(name)}\n`);
    }
  }

  /** Log the end of a pipeline step with timing. */
  endStep(name: string, status: 'success' | 'failure', durationMs: number): void {
    if (this.quiet && status === 'success') return;
    if (this.mode === 'json') {
      this.jsonLine({
        event: 'step_end',
        step: name,
        status,
        durationMs,
        ts: new Date().toISOString(),
      });
    } else {
      process.stderr.write(`${stepEnd(name, status, durationMs)}\n`);
    }
  }

  /** Print a blank line (human mode only). */
  blank(): void {
    if (!this.quiet && this.mode === 'human') {
      process.stderr.write('\n');
    }
  }

  /** Print raw text (no formatting). */
  raw(text: string): void {
    process.stderr.write(text);
  }

  /**
   * Redact sensitive values from a string.
   * Replaces long hex/base64 strings, Bearer tokens, passwords.
   */
  static redact(value: string): string {
    return value
      .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
      .replace(/password=\S+/gi, 'password=[REDACTED]')
      .replace(/\b[A-Fa-f0-9]{32,}\b/g, '[REDACTED]')
      .replace(/\b[A-Za-z0-9+/]{40,}={0,2}\b/g, '[REDACTED]');
  }

  private log(level: LogLevel, message: string): void {
    if (LEVEL_ORDER[level] < this.level) return;
    if (this.quiet && level !== 'error') return;

    if (this.mode === 'json') {
      this.jsonLine({ level, message, ts: new Date().toISOString() });
      return;
    }

    const formatted = this.formatHuman(level, message);
    const stream = level === 'error' || level === 'warn' ? process.stderr : process.stderr;
    stream.write(`${formatted}\n`);
  }

  private formatHuman(level: LogLevel, message: string): string {
    switch (level) {
      case 'debug':
        return gray(`  ${message}`);
      case 'info':
        return `  ${message}`;
      case 'warn':
        return yellow(`⚠ ${message}`);
      case 'error':
        return red(`✗ ${message}`);
    }
  }

  private jsonLine(data: Record<string, unknown>): void {
    process.stderr.write(`${JSON.stringify(data)}\n`);
  }
}
