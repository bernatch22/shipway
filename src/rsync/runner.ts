import { existsSync, statSync } from 'node:fs';
import type { SyncEntry } from '../config/schema.js';
import { RsyncError } from '../errors/index.js';
import type { Logger } from '../logging/logger.js';
import { exec } from '../utils/exec.js';
import { RsyncArgsBuilder } from './builder.js';
import { assertSafeRemote, multiLocalWarning, shouldDisableDeleteForMultiLocal } from './safety.js';

export interface RsyncRunnerOptions {
  server: string;
  keyPath?: string;
  dryRun?: boolean;
}

/**
 * Execute rsync for a single SyncEntry.
 * Handles safety checks, multi-local sources, and argument construction.
 */
export async function runSync(
  entry: SyncEntry,
  options: RsyncRunnerOptions,
  logger: Logger,
): Promise<void> {
  const { server, keyPath, dryRun = false } = options;

  if (!entry.remote) {
    throw new RsyncError(
      'Sync entry is missing "remote" — this should have been caught during normalization',
    );
  }
  const remote = entry.remote;

  let deleteEnabled = entry.delete !== false;

  // Safety: check shallow path
  if (deleteEnabled) {
    assertSafeRemote(remote);
  }

  const locals = Array.isArray(entry.local) ? entry.local : [entry.local];

  // Safety: disable delete for multiple locals to the same remote
  if (shouldDisableDeleteForMultiLocal(entry)) {
    logger.warn(multiLocalWarning(remote, locals.length));
    deleteEnabled = false;
  }

  for (const local of locals) {
    const localExists = existsSync(local);

    if (!dryRun && !localExists) {
      throw new RsyncError(`Local path not found: ${local}`);
    }

    const isDir = localExists ? statSync(local).isDirectory() : true;

    const builder = new RsyncArgsBuilder()
      .ssh(keyPath)
      .checksum(entry.checksum ?? false)
      .delete(deleteEnabled && isDir)
      .dryRun(dryRun)
      .source(local, isDir)
      .destination(server, remote);

    if (entry.exclude) {
      builder.excludeMany(entry.exclude);
    }

    const args = builder.build();
    logger.debug(`rsync ${args.join(' ')}`);

    const result = await exec('rsync', args);
    if (result.exitCode !== 0) {
      throw new RsyncError(
        `rsync failed for ${local} → ${server}:${remote}\n${result.stderr}`,
        result.exitCode,
      );
    }
  }
}
