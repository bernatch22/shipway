import type { HostConfig, SyncEntry } from './schema.js';

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
  remoteDir?: string;
  sync: SyncEntry[];
  build?: string;
  postSync?: string;
  start?: string;
  restart: NormalizedRestart;
  health?: NormalizedHealth;
  env?: NormalizedEnvFile;
  exclude: string[];
  services?: Record<string, NormalizedService>;
}

/** Resolved env-file locations for `shipway env` pull/push. */
export interface NormalizedEnvFile {
  /** Remote path to the env file (e.g. ~/app/.env). */
  remote: string;
  /** Local path the env file syncs to/from (default ./.env). */
  local: string;
}

export interface NormalizedHealth {
  url: string;
  expect: number;
  retries: number;
  delayMs: number;
}

export interface NormalizedRestart {
  method: 'pm2' | 'systemd' | 'none';
  name?: string;
  start?: string;
  cwd?: string;
}

export interface NormalizedService {
  build?: string;
  sync: SyncEntry[];
  postSync?: string;
  start?: string;
  restart: NormalizedRestart;
  health?: NormalizedHealth;
  cwd?: string;
}
