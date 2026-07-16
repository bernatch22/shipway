import { runSync } from '../../rsync/runner.js';
import type { DeployContext } from '../deploy-context.js';
import type { DeployStep } from '../deploy-pipeline.js';

/**
 * Sync step — rsync local files to remote server.
 * Creates remote directories first, then syncs each entry.
 */
export class SyncStep implements DeployStep {
  readonly name = 'Sync';

  shouldRun(ctx: DeployContext): boolean {
    return ctx.config.sync.length > 0;
  }

  async run(ctx: DeployContext): Promise<void> {
    const { config, host, ssh, logger, dryRun } = ctx;

    // Create remote directories
    if (!dryRun) {
      for (const entry of config.sync) {
        await ssh.exec(`mkdir -p ${entry.remote}`, { silent: true });
      }
    }

    // Sync each entry
    for (const entry of config.sync) {
      await runSync(entry, { server: host.ssh, keyPath: host.key, dryRun }, logger);
    }
  }
}
