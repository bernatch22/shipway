import { findConfigFile, loadConfig } from '../config/parser.js';
import type { NormalizedConfig } from '../config/types.js';
import { FileProjectRepository } from './file-repository.js';

/**
 * Resolve a project alias or CWD to its config.
 * Checks the registry first, then falls back to CWD.
 */
export async function resolveProject(
  aliasOrCwd: string | undefined,
  cwd: string,
): Promise<{ config: NormalizedConfig; projectDir: string } | null> {
  const registry = new FileProjectRepository();

  // If an alias is provided, look it up in the registry
  if (aliasOrCwd) {
    const project = await registry.get(aliasOrCwd);
    if (project) {
      const configPath = findConfigFile(project.path);
      if (configPath) {
        const config = await loadConfig(configPath);
        return { config, projectDir: project.path };
      }
    }
  }

  // Fall back to CWD
  const configPath = findConfigFile(cwd);
  if (configPath) {
    const config = await loadConfig(configPath);
    return { config, projectDir: cwd };
  }

  return null;
}
