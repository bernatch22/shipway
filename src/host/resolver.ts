import type { HostConfig } from '../config/schema.js';
import type { ResolvedHost } from '../config/types.js';
import { ConfigError } from '../errors/index.js';

/**
 * Resolve any host config shape into a ResolvedHost.
 *
 * Supported shapes:
 *   - string: "user@host"
 *   - { ssh: "user@host", key?: "/path/to/key" }
 *   - { ip: "1.2.3.4", user: "deploy", key?: "/path/to/key" }
 */
export class HostResolver {
  async resolve(config: HostConfig): Promise<ResolvedHost> {
    if (typeof config === 'string') {
      return this.fromString(config);
    }
    if ('ssh' in config) {
      return this.fromSshObject(config);
    }
    if ('ip' in config) {
      return this.fromIp(config);
    }
    throw new ConfigError('host', 'Unrecognized host shape');
  }

  private fromString(s: string): ResolvedHost {
    const match = /^([^@]+)@(.+)$/.exec(s);
    if (!match) {
      throw new ConfigError('host', `Invalid host string: "${s}". Expected user@host`);
    }
    const [, user, host] = match;
    return {
      ssh: s,
      ip: host!,
      user: user!,
      home: `/home/${user}`,
    };
  }

  private fromSshObject(config: { ssh: string; key?: string }): ResolvedHost {
    const resolved = this.fromString(config.ssh);
    if (config.key) {
      resolved.key = config.key;
    }
    return resolved;
  }

  private fromIp(config: { ip: string; user: string; key?: string }): ResolvedHost {
    return {
      ssh: `${config.user}@${config.ip}`,
      ip: config.ip,
      user: config.user,
      home: `/home/${config.user}`,
      key: config.key,
    };
  }
}
