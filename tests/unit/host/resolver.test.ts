import { describe, it, expect } from 'vitest';
import { HostResolver } from '../../../src/host/resolver.ts';

describe('HostResolver', () => {
  const resolver = new HostResolver();

  describe('string host', () => {
    it('should parse user@ip', async () => {
      const host = await resolver.resolve('berna@34.123.241.2');
      expect(host.ssh).toBe('berna@34.123.241.2');
      expect(host.ip).toBe('34.123.241.2');
      expect(host.user).toBe('berna');
      expect(host.home).toBe('/home/berna');
    });

    it('should parse user@hostname', async () => {
      const host = await resolver.resolve('deploy@my-server.com');
      expect(host.ssh).toBe('deploy@my-server.com');
      expect(host.ip).toBe('my-server.com');
      expect(host.user).toBe('deploy');
    });

    it('should reject invalid string', async () => {
      await expect(resolver.resolve('invalid')).rejects.toThrow(/Invalid host string/);
    });
  });

  describe('SSH object host', () => {
    it('should parse { ssh: "user@ip" }', async () => {
      const host = await resolver.resolve({ ssh: 'root@10.0.0.1' });
      expect(host.ssh).toBe('root@10.0.0.1');
      expect(host.user).toBe('root');
      expect(host.ip).toBe('10.0.0.1');
    });

    it('should include key from { ssh, key }', async () => {
      const host = await resolver.resolve({
        ssh: 'deploy@10.0.0.1',
        key: '~/.ssh/my_deploy_key',
      });
      expect(host.ssh).toBe('deploy@10.0.0.1');
      expect(host.key).toBe('~/.ssh/my_deploy_key');
    });
  });

  describe('IP object host', () => {
    it('should parse { ip, user }', async () => {
      const host = await resolver.resolve({ ip: '192.168.1.1', user: 'deploy' });
      expect(host.ssh).toBe('deploy@192.168.1.1');
      expect(host.ip).toBe('192.168.1.1');
      expect(host.user).toBe('deploy');
    });

    it('should include key if provided', async () => {
      const host = await resolver.resolve({
        ip: '192.168.1.1',
        user: 'deploy',
        key: '/path/to/key',
      });
      expect(host.key).toBe('/path/to/key');
    });
  });
});
