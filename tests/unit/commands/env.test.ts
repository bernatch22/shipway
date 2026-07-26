import { describe, expect, it } from 'vitest';
import { pushMode } from '../../../src/commands/env.ts';
import { parseArgv } from '../../../src/utils/argv.ts';

const flagsOf = (...args: string[]) => parseArgv(['node', 'shipway', 'env', ...args]).flags;

describe('env push — when it may write', () => {
  it('needs --yes: a bare push is a preview', () => {
    expect(pushMode(flagsOf('push'))).toBe('unconfirmed');
  });

  it('writes with --yes', () => {
    expect(pushMode(flagsOf('push', '--yes'))).toBe('write');
  });

  it('does NOT write when --dry-run is passed with --yes', () => {
    // The bug this pins: `help` advertises --dry-run under global Flags ("preview
    // commands without executing"), but push only gated on --yes — so asking for
    // a preview OVERWROTE the production .env. A flag a destructive command
    // silently ignores is worse than one it rejects.
    expect(pushMode(flagsOf('push', '--dry-run', '--yes'))).toBe('dry-run');
  });

  it('treats -n as --dry-run, the same as deploy does', () => {
    expect(pushMode(flagsOf('push', '-n', '--yes'))).toBe('dry-run');
  });

  it('is a preview with --dry-run alone', () => {
    expect(pushMode(flagsOf('push', '--dry-run'))).toBe('dry-run');
  });

  it('ignores a --dry-run that is a VALUE rather than a switch', () => {
    // `--dry-run=false` parses to the string "false", and a string is not a
    // request for a dry run — reading it as truthy would make the flag
    // impossible to turn off.
    expect(pushMode({ 'dry-run': 'false', yes: true })).toBe('write');
  });
});
