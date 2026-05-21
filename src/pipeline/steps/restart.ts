import { getProcessManager } from '../../process-managers/index.js';
import type { DeployStep } from '../deploy-pipeline.js';
import type { DeployContext } from '../deploy-context.js';

/**
 * Restart step — restart the service via the configured process manager.
 */
export class RestartStep implements DeployStep {
  readonly name = 'Restart';

  shouldRun(ctx: DeployContext): boolean {
    return ctx.config.restart.method !== 'none';
  }

  async run(ctx: DeployContext): Promise<void> {
    const { config, ssh, logger, dryRun } = ctx;
    const { restart } = config;
    const pm = getProcessManager(restart.method);
    const name = restart.name ?? config.name;

    if (dryRun) {
      logger.debug(`[dry-run] ${restart.method} restart ${name}`);
      return;
    }

    // Use start() which handles the "not found" case with initial creation
    if (restart.start) {
      const cwd = restart.cwd ?? config.remoteDir ?? config.sync[0]?.remote ?? `/home/${ctx.host.user}/${config.name}`;
      await pm.start(ssh, {
        name,
        command: restart.start,
        cwd,
      });
    } else {
      await pm.restart(ssh, name);
    }
  }
}
