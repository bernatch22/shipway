import { DeployPipeline } from '../pipeline/deploy-pipeline.js';
import { BuildStep } from '../pipeline/steps/build.js';
import { SyncStep } from '../pipeline/steps/sync.js';
import { PostSyncStep } from '../pipeline/steps/post-sync.js';
import { RestartStep } from '../pipeline/steps/restart.js';
import { HealthCheckStep } from '../pipeline/steps/health-check.js';
import { HostResolver } from '../host/resolver.js';
import { ExitCode } from '../errors/index.js';
import { deployHeader, deployFooter } from '../logging/format.js';
import type { NormalizedConfig, NormalizedService, ResolvedHost } from '../config/types.js';
import type { SSHClient } from '../ssh/client.js';
import type { Command, CommandContext } from './types.js';

class DeployCommand implements Command {
  readonly name = 'deploy';
  readonly description = 'Build, sync, restart, and health-check a service';
  readonly usage = 'shipway deploy [project] [service] [--dry-run]';

  async execute(ctx: CommandContext): Promise<number> {
    if (!ctx.config) {
      ctx.logger.error('No shipway config found. Run from a project directory or specify an alias.');
      return ExitCode.CONFIG;
    }

    const dryRun = ctx.flags['dry-run'] === true || ctx.flags.n === true;
    const resolver = new HostResolver();
    const host = await resolver.resolve(ctx.config.host);
    const ssh = await ctx.createSSH();

    // Check if this is a multi-service deploy
    if (ctx.config.services && Object.keys(ctx.config.services).length > 0) {
      const serviceFilter = ctx.args[0]; // optional: deploy only one service
      return this.deployMultiService(ctx, host, ssh, dryRun, serviceFilter);
    }

    // Single-service deploy
    return this.deploySingle(ctx, ctx.config, host, ssh, dryRun);
  }

  /**
   * Deploy all services (or a specific one) from a multi-service config.
   */
  private async deployMultiService(
    ctx: CommandContext,
    host: ResolvedHost,
    ssh: SSHClient,
    dryRun: boolean,
    serviceFilter?: string,
  ): Promise<number> {
    const config = ctx.config!;
    const services = config.services!;
    const serviceNames = serviceFilter
      ? [serviceFilter]
      : Object.keys(services);

    // Validate the service filter
    if (serviceFilter && !services[serviceFilter]) {
      const available = Object.keys(services).join(', ');
      ctx.logger.error(`Service "${serviceFilter}" not found. Available: ${available}`);
      return ExitCode.CONFIG;
    }

    ctx.logger.raw(`🚀 ${dryRun ? '[DRY RUN] ' : ''}shipway → ${config.name} (${serviceNames.length} services)\n`);
    ctx.logger.blank();

    const t0 = Date.now();
    let failed = false;

    // Build once at root level if defined (shared build step)
    if (config.build && !serviceFilter) {
      ctx.logger.raw(`▶ Build (shared)\n`);
      const pipeline = new DeployPipeline([new BuildStep()]);
      try {
        await pipeline.execute({
          config,
          host,
          ssh,
          logger: ctx.logger,
          projectDir: ctx.cwd,
          dryRun,
        });
      } catch {
        failed = true;
        return ExitCode.GENERAL;
      }
      ctx.logger.blank();
    }

    // Deploy each service
    for (const name of serviceNames) {
      const svc = services[name]!;
      ctx.logger.raw(`━━━ ${name} ━━━\n`);

      // Create a virtual NormalizedConfig for this service
      const serviceConfig = this.buildServiceConfig(config, svc, name);

      try {
        const pipeline = new DeployPipeline([
          new SyncStep(),
          new PostSyncStep(),
          new RestartStep(),
          new HealthCheckStep(),
        ]);

        await pipeline.execute({
          config: serviceConfig,
          host,
          ssh,
          logger: ctx.logger,
          projectDir: ctx.cwd,
          dryRun,
          serviceName: name,
        });
      } catch {
        ctx.logger.error(`Service "${name}" failed.`);
        failed = true;
        break;
      }

      ctx.logger.blank();
    }

    if (!failed) {
      const elapsed = Date.now() - t0;
      ctx.logger.raw(deployFooter(elapsed, config.url));
    }

    return failed ? ExitCode.GENERAL : ExitCode.OK;
  }

  /**
   * Build a virtual NormalizedConfig from a service entry.
   * The pipeline steps read from config, so we project the service
   * fields onto a NormalizedConfig shape.
   */
  private buildServiceConfig(
    root: NormalizedConfig,
    svc: NormalizedService,
    _serviceName: string,
  ): NormalizedConfig {
    return {
      name: root.name,
      url: root.url,
      host: root.host,
      sync: svc.sync,
      build: svc.build,
      postSync: svc.postSync,
      start: svc.start,
      restart: svc.restart,
      health: svc.health,
      exclude: root.exclude,
    };
  }

  /**
   * Standard single-service deploy.
   */
  private async deploySingle(
    ctx: CommandContext,
    config: NormalizedConfig,
    host: ResolvedHost,
    ssh: SSHClient,
    dryRun: boolean,
  ): Promise<number> {
    const t0 = Date.now();
    ctx.logger.raw(`${deployHeader(config.name, dryRun)}\n`);
    ctx.logger.debug(`${host.ssh} (${host.ip})`);
    ctx.logger.blank();

    const pipeline = new DeployPipeline([
      new BuildStep(),
      new SyncStep(),
      new PostSyncStep(),
      new RestartStep(),
      new HealthCheckStep(),
    ]);

    const result = await pipeline.execute({
      config,
      host,
      ssh,
      logger: ctx.logger,
      projectDir: ctx.cwd,
      dryRun,
    });

    if (result.success) {
      const url = resolvePublicUrl(config, host.ip);
      ctx.logger.raw(deployFooter(Date.now() - t0, url));
    }

    return ExitCode.OK;
  }
}

function resolvePublicUrl(
  config: { url?: string; health?: { url: string } },
  ip: string,
): string | undefined {
  if (config.url) return config.url;
  if (config.health) {
    return config.health.url.replace(/localhost|127\.0\.0\.1/, ip);
  }
  return undefined;
}

export default new DeployCommand();
