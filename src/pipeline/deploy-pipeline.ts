import { DeployError } from '../errors/index.js';
import type { DeployContext, DeployResult } from './deploy-context.js';

/**
 * A single step in the deploy pipeline.
 */
export interface DeployStep {
  readonly name: string;
  shouldRun(ctx: DeployContext): boolean;
  run(ctx: DeployContext): Promise<void>;
}

/**
 * Deploy pipeline — executes a sequence of steps with timing and error handling.
 */
export class DeployPipeline {
  constructor(private readonly steps: DeployStep[]) {}

  async execute(ctx: DeployContext): Promise<DeployResult> {
    const timings: Record<string, number> = {};

    for (const step of this.steps) {
      if (!step.shouldRun(ctx)) {
        ctx.logger.debug(`Skipping ${step.name}`);
        continue;
      }

      const t0 = Date.now();
      ctx.logger.startStep(step.name);

      try {
        await step.run(ctx);
        timings[step.name] = Date.now() - t0;
        ctx.logger.endStep(step.name, 'success', timings[step.name] ?? 0);
      } catch (e) {
        ctx.logger.endStep(step.name, 'failure', Date.now() - t0);
        throw new DeployError(step.name, e);
      }
    }

    return { success: true, timings };
  }
}
