import { checkHealth } from '../../health/checker.js';
import { getProcessManager } from '../../process-managers/index.js';
import type { DeployContext } from '../deploy-context.js';
import type { DeployStep } from '../deploy-pipeline.js';

/**
 * Health check step — verify the service is responding correctly after deploy.
 * On failure, shows recent logs from the process manager.
 */
export class HealthCheckStep implements DeployStep {
  readonly name = 'Health check';

  shouldRun(ctx: DeployContext): boolean {
    return !!ctx.config.health && !ctx.dryRun;
  }

  async run(ctx: DeployContext): Promise<void> {
    const { config, ssh, logger } = ctx;
    const health = config.health!;

    const result = await checkHealth(ssh, health, logger);

    if (!result.healthy) {
      // Show recent logs to help diagnose
      if (config.restart.method !== 'none') {
        const pm = getProcessManager(config.restart.method);
        const name = config.restart.name ?? config.name;
        logger.info('Recent logs:');
        const logs = await pm.logs(ssh, name, { lines: 15 });
        if (logs) logger.raw(`${logs}\n`);
      }

      throw new Error(`Health check failed: expected HTTP ${health.expect} from ${health.url}`);
    }
  }
}
