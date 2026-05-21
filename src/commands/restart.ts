import { getProcessManager } from '../process-managers/index.js';
import { ExitCode } from '../errors/index.js';
import type { NormalizedService } from '../config/types.js';
import type { Command, CommandContext } from './types.js';

class RestartCommand implements Command {
  readonly name = 'restart';
  readonly description = 'Restart the remote service';
  readonly usage = 'shipway restart [service]';

  async execute(ctx: CommandContext): Promise<number> {
    if (!ctx.config) {
      ctx.logger.error('No shipway config found.');
      return ExitCode.CONFIG;
    }

    const ssh = await ctx.createSSH();
    const serviceArg = ctx.args[0];

    // Multi-service
    if (ctx.config.services && Object.keys(ctx.config.services).length > 0) {
      const entries: [string, NormalizedService][] = serviceArg
        ? [[serviceArg, ctx.config.services[serviceArg]!]]
        : Object.entries(ctx.config.services);

      if (serviceArg && !ctx.config.services[serviceArg]) {
        const available = Object.keys(ctx.config.services).join(', ');
        ctx.logger.error(`Service "${serviceArg}" not found. Available: ${available}`);
        return ExitCode.CONFIG;
      }

      for (const [svcName, svc] of entries) {
        const pm = getProcessManager(svc.restart.method);
        const name = svc.restart.name ?? `${ctx.config.name}-${svcName}`;
        ctx.logger.info(`Restarting ${name}...`);
        await pm.restart(ssh, name);
        ctx.logger.success(`${name} restarted`);
      }
      return ExitCode.OK;
    }

    // Single-service
    if (ctx.config.restart.method === 'none') {
      ctx.logger.info('No process manager configured.');
      return ExitCode.OK;
    }

    const pm = getProcessManager(ctx.config.restart.method);
    const name = ctx.config.restart.name ?? ctx.config.name;
    ctx.logger.info(`Restarting ${name}...`);
    await pm.restart(ssh, name);
    ctx.logger.success('Restarted');
    return ExitCode.OK;
  }
}

export default new RestartCommand();
