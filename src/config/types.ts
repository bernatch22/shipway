import type { SyncEntry, RestartConfig, HostConfig } from './schema.js';

/**
 * Resolved host info after processing all host config shapes.
 */
export interface ResolvedHost {
  /** Full SSH connection string: user@ip */
  ssh: string;
  /** IP address or hostname */
  ip: string;
  /** SSH user */
  user: string;
  /** Remote home directory */
  home: string;
  /** Optional SSH key path */
  key?: string;
}

/**
 * Fully normalized config — all shorthands expanded, defaults applied.
 * This is what the pipeline works with.
 */
export interface NormalizedConfig {
  name: string;
  url?: string;
  host: HostConfig;
  sync: SyncEntry[];
  build?: string;
  postSync?: string;
  start?: string;
  restart: RestartConfig;
  health?: NormalizedHealth;
  exclude: string[];
  services?: Record<string, NormalizedService>;
}

export interface NormalizedHealth {
  url: string;
  expect: number;
  retries: number;
  delayMs: number;
}

export interface NormalizedService {
  build?: string;
  sync: SyncEntry[];
  postSync?: string;
  start?: string;
  restart: RestartConfig;
  health?: NormalizedHealth;
  cwd?: string;
}
