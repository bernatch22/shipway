import { describe, it, expect } from 'vitest';
import { RsyncArgsBuilder } from '../../../src/rsync/builder.ts';
import { assertSafeRemote, shouldDisableDeleteForMultiLocal } from '../../../src/rsync/safety.ts';

describe('RsyncArgsBuilder', () => {
  it('should build basic args', () => {
    const args = new RsyncArgsBuilder()
      .source('./dist', true)
      .destination('user@host', '/remote/path')
      .build();

    expect(args).toContain('-avz');
    expect(args).toContain('--stats');
    expect(args).toContain('./dist/');
    expect(args).toContain('user@host:/remote/path/');
  });

  it('should add checksum flag', () => {
    const args = new RsyncArgsBuilder().checksum(true).build();
    expect(args).toContain('--checksum');
  });

  it('should not add checksum when false', () => {
    const args = new RsyncArgsBuilder().checksum(false).build();
    expect(args).not.toContain('--checksum');
  });

  it('should add delete flag', () => {
    const args = new RsyncArgsBuilder().delete(true).build();
    expect(args).toContain('--delete');
  });

  it('should add dry-run flag', () => {
    const args = new RsyncArgsBuilder().dryRun(true).build();
    expect(args).toContain('-n');
  });

  it('should add exclude patterns', () => {
    const args = new RsyncArgsBuilder()
      .exclude('.DS_Store')
      .exclude('node_modules')
      .build();

    const dsIdx = args.indexOf('.DS_Store');
    expect(dsIdx).toBeGreaterThan(0);
    expect(args[dsIdx - 1]).toBe('--exclude');
  });

  it('should handle file source (no trailing slash)', () => {
    const args = new RsyncArgsBuilder()
      .source('./package.json', false)
      .build();

    expect(args).toContain('./package.json');
  });
});

describe('Rsync Safety', () => {
  describe('assertSafeRemote', () => {
    it('should accept deep paths', () => {
      expect(() => assertSafeRemote('/home/berna/deutschepolska')).not.toThrow();
      expect(() => assertSafeRemote('~/blossom-landing/build')).not.toThrow();
    });

    it('should reject shallow paths', () => {
      expect(() => assertSafeRemote('/home/berna')).toThrow(/shallow path/);
      expect(() => assertSafeRemote('/var')).toThrow(/shallow path/);
    });
  });

  describe('shouldDisableDeleteForMultiLocal', () => {
    it('should return true for multi-local with delete', () => {
      const result = shouldDisableDeleteForMultiLocal({
        local: ['./a', './b'],
        remote: '/remote',
      });
      expect(result).toBe(true);
    });

    it('should return false for single local', () => {
      const result = shouldDisableDeleteForMultiLocal({
        local: './dist',
        remote: '/remote',
      });
      expect(result).toBe(false);
    });

    it('should return false when delete is explicitly false', () => {
      const result = shouldDisableDeleteForMultiLocal({
        local: ['./a', './b'],
        remote: '/remote',
        delete: false,
      });
      expect(result).toBe(false);
    });
  });
});
