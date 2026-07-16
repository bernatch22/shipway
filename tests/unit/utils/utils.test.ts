import { homedir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { formatDuration } from '../../../src/logging/format.ts';
import { Logger } from '../../../src/logging/logger.ts';
import { parseArgv } from '../../../src/utils/argv.ts';
import { expandTilde, getConfigDir } from '../../../src/utils/paths.ts';

describe('parseArgv', () => {
  it('should parse command and flags', () => {
    const result = parseArgv(['node', 'script', 'deploy', '--dry-run']);
    expect(result.command).toBe('deploy');
    expect(result.flags['dry-run']).toBe(true);
  });

  it('should parse --key=value', () => {
    const result = parseArgv(['node', 'script', 'logs', '--lines=50']);
    expect(result.flags.lines).toBe('50');
  });

  it('should parse --key value', () => {
    const result = parseArgv(['node', 'script', 'logs', '--grep', 'error']);
    expect(result.flags.grep).toBe('error');
  });

  it('should parse short flags', () => {
    const result = parseArgv(['node', 'script', 'deploy', '-n']);
    expect(result.flags.n).toBe(true);
  });

  it('should handle -- separator', () => {
    const result = parseArgv(['node', 'script', 'exec', '--', 'ls', '-la']);
    expect(result.command).toBe('exec');
    expect(result.args).toEqual(['ls', '-la']);
  });

  it('should handle no args', () => {
    const result = parseArgv(['node', 'script']);
    expect(result.command).toBeUndefined();
    expect(result.args).toEqual([]);
  });
});

describe('expandTilde', () => {
  it('should expand ~ to home dir', () => {
    expect(expandTilde('~')).toBe(homedir());
  });

  it('should expand ~/path', () => {
    expect(expandTilde('~/foo/bar')).toBe(`${homedir()}/foo/bar`);
  });

  it('should leave non-tilde paths alone', () => {
    expect(expandTilde('/usr/local')).toBe('/usr/local');
  });
});

describe('getConfigDir', () => {
  it('should return ~/.shipway', () => {
    expect(getConfigDir()).toBe(`${homedir()}/.shipway`);
  });
});

describe('formatDuration', () => {
  it('should format milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms');
  });

  it('should format seconds', () => {
    expect(formatDuration(3500)).toBe('3.5s');
  });

  it('should format minutes', () => {
    expect(formatDuration(125000)).toBe('2m 5s');
  });
});

describe('Logger', () => {
  it('should redact secrets', () => {
    const redacted = Logger.redact('Bearer abc123def456ghi789jkl012mno345pqr678');
    expect(redacted).not.toContain('abc123');
  });

  it('should redact hex tokens', () => {
    const redacted = Logger.redact('token=abcdef0123456789abcdef0123456789');
    expect(redacted).toContain('[REDACTED]');
  });
});
