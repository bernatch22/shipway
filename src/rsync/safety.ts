import { RsyncError } from '../errors/index.js';
import type { SyncEntry } from '../config/schema.js';

/**
 * Assert that a remote path is deep enough for --delete to be safe.
 * Refuses paths with fewer than 3 segments to prevent wiping /home/user.
 *
 * Carried forward from shipit safety pattern.
 */
export function assertSafeRemote(remote: string): void {
  // Expand ~ to a 3-segment path equivalent
  const expanded = remote.startsWith('~/') ? `/home/user/${remote.slice(2)}` : remote;
  const parts = expanded.replace(/\/+$/, '').split('/').filter(Boolean);

  if (parts.length < 3) {
    throw new RsyncError(
      `Refusing --delete on shallow path "${remote}". ` +
        'This could wipe important files. ' +
        'Use a deeper path, or set "delete: false" in the sync entry.',
    );
  }
}

/**
 * Check if multiple local sources are synced to the same remote with --delete.
 * If so, each rsync run would wipe the previous one's output.
 * Returns true if delete should be disabled.
 *
 * Carried forward from shipit safety pattern.
 */
export function shouldDisableDeleteForMultiLocal(entry: SyncEntry): boolean {
  const locals = Array.isArray(entry.local) ? entry.local : [entry.local];
  return locals.length > 1 && entry.delete !== false;
}

/**
 * Generate a warning message when --delete is disabled for multi-local.
 */
export function multiLocalWarning(remote: string, localCount: number): string {
  return (
    `--delete disabled for "${remote}" because there are ${localCount} local sources. ` +
    'Each rsync run would delete files placed by previous runs. ' +
    'Split into separate sync entries if you need --delete.'
  );
}
