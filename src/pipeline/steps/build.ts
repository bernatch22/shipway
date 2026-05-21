import { execShell } from '../../utils/exec.js';
import type { DeployStep } from '../deploy-pipeline.js';
import type { DeployContext } from '../deploy-context.js';

/**
 * Build step — runs the local build command.
 * Uses shell execution for user build strings that may contain && or ||.
 */
export class BuildStep implements DeployStep {
  readonly name = 'Build';

  shouldRun(ctx: DeployContext): boolean {
    return !!ctx.config.build;
  }

  async run(ctx: DeployContext): Promise<void> {
    const buildCmd = ctx.config.build!;

    if (ctx.dryRun) {
      ctx.logger.debug(`[dry-run] sh -c "${buildCmd}"`);
      return;
    }

    ctx.logger.debug(`Running: ${buildCmd}`);
    const result = await execShell(buildCmd, {
      cwd: ctx.projectDir,
      inherit: true,
    });

    if (result.exitCode !== 0) {
      throw new Error(`Build command failed with exit code ${result.exitCode}`);
    }
  }
}
