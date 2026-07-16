import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Expand tilde (~) in a path to the user's home directory.
 */
export function expandTilde(p: string): string {
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return p;
}

/**
 * Get the shipway config directory (~/.shipway).
 */
export function getConfigDir(): string {
  return join(homedir(), '.shipway');
}

/**
 * Get the audit log directory (~/.shipway/audit).
 */
export function getAuditDir(): string {
  return join(getConfigDir(), 'audit');
}

/**
 * Get the registry file path (~/.shipway/projects.yml).
 */
export function getRegistryPath(): string {
  return join(getConfigDir(), 'projects.yml');
}

/**
 * Resolve a path relative to a base directory.
 * Expands tilde first.
 */
export function resolvePath(p: string, base?: string): string {
  const expanded = expandTilde(p);
  if (base) return resolve(base, expanded);
  return resolve(expanded);
}
