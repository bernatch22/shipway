import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { ShipwayConfigSchema } from './schema.js';
import { normalize } from './normalize.js';
import { ConfigError } from '../errors/index.js';
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
 * Returns a fully normalized config.
 */
export async function loadConfig(filePath: string): Promise<NormalizedConfig> {
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

  return normalize(result.data);
}

/**
 * Load config from a directory, auto-detecting the config file.
 */
export async function loadConfigFromDir(dir: string): Promise<NormalizedConfig> {
  const configPath = findConfigFile(dir);
  if (!configPath) {
    throw new ConfigError(
      'root',
      `No shipway config found in ${dir}. Expected one of: ${CONFIG_FILENAMES.join(', ')}`,
    );
  }
  return loadConfig(configPath);
}
