import { expandTilde } from '../utils/paths.js';

/**
 * Standard SSH options for non-interactive deployments.
 */
export const SSH_OPTIONS: readonly string[] = [
  '-o',
  'StrictHostKeyChecking=no',
  '-o',
  'UserKnownHostsFile=/dev/null',
  '-o',
  'LogLevel=ERROR',
  '-o',
  'ConnectTimeout=10',
];

/**
 * Build SSH args with optional key file.
 * Key resolution order:
 * 1. Explicit key from config (shipway.yml `key` field)
 * 2. SHIPWAY_SSH_KEY env var
 * 3. System default agent (ssh-agent, ~/.ssh/id_*)
 */
export function buildSshArgs(keyOverride?: string): string[] {
  const key = resolveKeyPath(keyOverride);
  if (key) {
    return ['-i', key, ...SSH_OPTIONS];
  }
  return [...SSH_OPTIONS];
}

function resolveKeyPath(override?: string): string | null {
  if (override) return expandTilde(override);

  const envKey = process.env.SHIPWAY_SSH_KEY;
  if (envKey) return expandTilde(envKey);

  return null;
}

/**
 * Build the SSH command string for use in rsync's -e flag.
 */
export function buildSshCommand(keyOverride?: string): string {
  return ['ssh', ...buildSshArgs(keyOverride)].join(' ');
}
