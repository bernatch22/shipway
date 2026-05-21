import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { ShipwayConfigSchema } from './schema.js';
import { normalize } from './normalize.js';
import { ConfigError } from '../errors/index.js';
import type { ShipwayConfig } from './schema.js';
import type { NormalizedConfig } from './types.js';

const CONFIG_FILENAMES = ['shipway.yml', 'shipway.yaml', 'shipway.json'];

/**
 * Find the config file in a directory.
 * Checks shipway.yml, shipway.yaml, shipway.json in order.
 */
export function findConfigFile(dir: string): string | null {
  for (const name of CONFIG_FILENAMES) {
    const path = resolve(dir, name);
    if (existsSync(path)) return path;
  }
  return null;
}

/**
 * Load and parse a shipway config file.
 * Supports both YAML and JSON formats.
 * If `env` is provided, merges the matching environment overrides on top.
 * Returns a fully normalized config.
 */
export async function loadConfig(
  filePath: string,
  env?: string,
): Promise<NormalizedConfig> {
  const content = await readFile(filePath, 'utf-8');

  let raw: unknown;
  if (filePath.endsWith('.json')) {
    try {
      raw = JSON.parse(content);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new ConfigError('root', `Invalid JSON: ${msg}`);
    }
  } else {
    try {
      raw = parseYaml(content);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new ConfigError('root', `Invalid YAML: ${msg}`);
    }
  }

  const result = ShipwayConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => {
      const path = i.path.join('.');
      return `  ${path}: ${i.message}`;
    });
    throw new ConfigError('root', `Validation failed:\n${issues.join('\n')}`);
  }

  const merged = env ? mergeEnvironment(result.data, env) : result.data;

  // Validate host is present after merge
  if (!merged.host) {
    throw new ConfigError('host', 'host is required (set it at root level or in the environment)');
  }

  return normalize(merged as ShipwayConfig & { host: ShipwayConfig['host'] });
}

/**
 * Merge environment overrides onto the base config.
 * Environment fields override base fields (shallow merge per top-level key).
 */
function mergeEnvironment(
  base: ShipwayConfig,
  envName: string,
): ShipwayConfig {
  if (!base.environments) {
    throw new ConfigError(
      'environments',
      `No environments defined in config. Cannot use --env ${envName}`,
    );
  }

  const env = base.environments[envName];
  if (!env) {
    const available = Object.keys(base.environments).join(', ');
    throw new ConfigError(
      'environments',
      `Environment "${envName}" not found. Available: ${available}`,
    );
  }

  // Shallow merge: env fields override base fields
  // Remove the `environments` key from the result (it's been consumed)
  const { environments: _, ...baseWithout } = base;

  return {
    ...baseWithout,
    ...stripUndefined(env),
  } as ShipwayConfig;
}

/**
 * Remove undefined values so they don't override defined base values.
 */
function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Load config from a directory, auto-detecting the config file.
 */
export async function loadConfigFromDir(
  dir: string,
  env?: string,
): Promise<NormalizedConfig> {
  const configPath = findConfigFile(dir);
  if (!configPath) {
    throw new ConfigError(
      'root',
      `No shipway config found in ${dir}. Expected one of: ${CONFIG_FILENAMES.join(', ')}`,
    );
  }
  return loadConfig(configPath, env);
}
