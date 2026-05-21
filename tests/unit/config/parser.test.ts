import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { loadConfig } from '../../../src/config/parser.ts';

const FIXTURES = resolve(import.meta.dirname, '../../fixtures/configs');

describe('Config Parser', () => {
  describe('deutschepolska.yml', () => {
    it('should parse and normalize correctly', async () => {
      const config = await loadConfig(resolve(FIXTURES, 'deutschepolska.yml'));

      expect(config.name).toBe('deutschepolska');
      expect(config.build).toBe('npm run build && cp server.mjs package.json package-lock.json dist/');
      expect(config.postSync).toBe('cd /home/berna/deutschepolska && npm install --omit=dev');
      expect(config.start).toBe('node server.mjs');
    });

    it('should resolve string host to HostConfig', async () => {
      const config = await loadConfig(resolve(FIXTURES, 'deutschepolska.yml'));
      expect(config.host).toBe('berna@34.123.241.2');
    });

    it('should normalize sync entry', async () => {
      const config = await loadConfig(resolve(FIXTURES, 'deutschepolska.yml'));

      expect(config.sync).toHaveLength(1);
      expect(config.sync[0]).toMatchObject({
        local: './dist',
        remote: '/home/berna/deutschepolska',
        delete: true,
        checksum: false,
      });
      expect(config.sync[0]!.exclude).toContain('data');
    });

    it('should create pm2 restart from start field', async () => {
      const config = await loadConfig(resolve(FIXTURES, 'deutschepolska.yml'));

      expect(config.restart.method).toBe('pm2');
      expect(config.restart.name).toBe('deutschepolska');
      expect(config.restart.start).toBe('node server.mjs');
    });

    it('should create health check from port field', async () => {
      const config = await loadConfig(resolve(FIXTURES, 'deutschepolska.yml'));

      expect(config.health).toBeDefined();
      expect(config.health!.url).toBe('http://localhost:5050/');
      expect(config.health!.expect).toBe(200);
      expect(config.health!.retries).toBe(5);
    });
  });

  describe('blossom.yml', () => {
    it('should parse multi-sync entries', async () => {
      const config = await loadConfig(resolve(FIXTURES, 'blossom.yml'));

      expect(config.name).toBe('blossom-landing');
      expect(config.url).toBe('https://blossom.pe');
      expect(config.sync).toHaveLength(2);
    });

    it('should preserve checksum on first sync entry', async () => {
      const config = await loadConfig(resolve(FIXTURES, 'blossom.yml'));

      expect(config.sync[0]).toMatchObject({
        local: './build',
        remote: '~/blossom-landing/build',
        checksum: true,
      });
    });

    it('should handle multi-local sync with delete:false', async () => {
      const config = await loadConfig(resolve(FIXTURES, 'blossom.yml'));

      const second = config.sync[1]!;
      expect(second.local).toEqual(['./public', './package.json', './package-lock.json']);
      expect(second.remote).toBe('~/blossom-landing');
      expect(second.delete).toBe(false);
    });

    it('should infer health from port', async () => {
      const config = await loadConfig(resolve(FIXTURES, 'blossom.yml'));

      expect(config.health).toBeDefined();
      expect(config.health!.url).toBe('http://localhost:3000/');
    });
  });

  describe('validation errors', () => {
    it('should reject empty name', async () => {
      await expect(
        loadConfig(resolve(FIXTURES, 'invalid/empty-name.yml')),
      ).rejects.toThrow(/Validation failed/);
    });
  });
});
