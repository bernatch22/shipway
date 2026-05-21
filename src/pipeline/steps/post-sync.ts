import type { DeployStep } from '../deploy-pipeline.js';
import type { DeployContext } from '../deploy-context.js';

/**
 * Post-sync step — runs a command on the remote server after syncing.
 * Commonly used for `npm install --omit=dev` etc.
 */
export class PostSyncStep implements DeployStep {
  readonly name = 'Post-sync';

  shouldRun(ctx: DeployContext): boolean {
    return !!ctx.config.postSync;
  }

  async run(ctx: DeployContext): Promise<void> {
    const cmd = ctx.config.postSync!;

    if (ctx.dryRun) {
      ctx.logger.debug(`[dry-run] ssh ${ctx.host.ssh} "${cmd}"`);
      return;
    }

    // Run in the remote directory of the first sync entry, or home
    const remoteDir = ctx.config.sync[0]?.remote ?? ctx.host.home;
    await ctx.ssh.exec(`cd ${remoteDir} && ${cmd}`);
  }
}
