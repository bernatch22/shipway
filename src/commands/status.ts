import type { NormalizedService } from '../config/types.js';
import { ExitCode } from '../errors/index.js';
import { checkHealth } from '../health/checker.js';
import { HostResolver } from '../host/resolver.js';
import { bold, dim, green, red } from '../logging/colors.js';
import type { Logger } from '../logging/logger.js';
import { getProcessManager } from '../process-managers/index.js';
import type { SSHClient } from '../ssh/client.js';
import type { Command, CommandContext } from './types.js';

class StatusCommand implements Command {
  readonly name = 'status';
  readonly description = 'Show service status and health';
  readonly usage = 'shipway status [service]';

  async execute(ctx: CommandContext): Promise<number> {
    if (!ctx.config) {
      ctx.logger.error('No shipway config found.');
      return ExitCode.CONFIG;
    }

    const resolver = new HostResolver();
    const host = await resolver.resolve(ctx.config.host);
    const ssh = await ctx.createSSH();

    ctx.logger.raw(`\n📊 ${bold(ctx.config.name)}\n`);
    ctx.logger.raw(`${dim(`   ${host.ssh} (${host.ip})`)}\n\n`);

    const serviceArg = ctx.args[0];

    // Multi-service
    if (ctx.config.services && Object.keys(ctx.config.services).length > 0) {
      const entries = serviceArg
        ? ([[serviceArg, ctx.config.services[serviceArg]]] as [string, NormalizedService][])
        : Object.entries(ctx.config.services);

      if (serviceArg && !ctx.config.services[serviceArg]) {
        const available = Object.keys(ctx.config.services).join(', ');
        ctx.logger.error(`Service "${serviceArg}" not found. Available: ${available}`);
        return ExitCode.CONFIG;
      }

      for (const [svcName, svc] of entries) {
        await this.showServiceStatus(ssh, ctx.logger, ctx.config.name, svcName, svc);
      }

      ctx.logger.raw('\n');
      return ExitCode.OK;
    }

    // Single-service
    if (ctx.config.restart.method !== 'none') {
      const pm = getProcessManager(ctx.config.restart.method);
      const name = ctx.config.restart.name ?? ctx.config.name;
      const status = await pm.status(ssh, name);

      const statusIcon = status.running ? green('●') : red('●');
      ctx.logger.raw(`   ${statusIcon} ${name}: ${status.status}`);
      if (status.uptime) ctx.logger.raw(` (uptime: ${status.uptime})`);
      if (status.memory) ctx.logger.raw(` | ${status.memory}`);
      if (status.cpu) ctx.logger.raw(` | ${status.cpu}`);
      if (status.restarts !== undefined) ctx.logger.raw(` | restarts: ${status.restarts}`);
      ctx.logger.raw('\n');
    }

    if (ctx.config.health) {
      await checkHealth(ssh, ctx.config.health, ctx.logger);
    }

    ctx.logger.raw('\n');
    return ExitCode.OK;
  }

  private async showServiceStatus(
    ssh: SSHClient,
    logger: Logger,
    rootName: string,
    svcName: string,
    svc: NormalizedService,
  ): Promise<void> {
    const pm = getProcessManager(svc.restart.method);
    const name = svc.restart.name ?? `${rootName}-${svcName}`;
    const status = await pm.status(ssh, name);

    const statusIcon = status.running ? green('●') : red('●');
    logger.raw(`   ${statusIcon} ${name}: ${status.status}`);
    if (status.uptime) logger.raw(` (uptime: ${status.uptime})`);
    if (status.memory) logger.raw(` | ${status.memory}`);
    if (status.restarts !== undefined) logger.raw(` | ↺${status.restarts}`);
    logger.raw('\n');
  }
}

export default new StatusCommand();
