import { getProcessManager } from '../process-managers/index.js';
import { ExitCode } from '../errors/index.js';
import type { Command, CommandContext } from './types.js';

class LogsCommand implements Command {
  readonly name = 'logs';
  readonly description = 'Tail remote service logs';
  readonly usage = 'shipway logs [service] [--lines N] [--follow] [--grep PATTERN]';

  async execute(ctx: CommandContext): Promise<number> {
    if (!ctx.config) {
      ctx.logger.error('No shipway config found.');
      return ExitCode.CONFIG;
    }

    const serviceArg = ctx.args[0];
    const ssh = await ctx.createSSH();

    const lines = typeof ctx.flags.lines === 'string' ? parseInt(ctx.flags.lines, 10) : 50;
    const follow = ctx.flags.follow === true || ctx.flags.f === true;
    const grep = typeof ctx.flags.grep === 'string' ? ctx.flags.grep : undefined;
    const since = typeof ctx.flags.since === 'string' ? ctx.flags.since : undefined;

    // Multi-service: if a service is specified, show its logs
    if (serviceArg && ctx.config.services?.[serviceArg]) {
      const svc = ctx.config.services[serviceArg];
      const pm = getProcessManager(svc.restart.method);
      const name = svc.restart.name ?? `${ctx.config.name}-${serviceArg}`;
      const output = await pm.logs(ssh, name, { lines, follow, grep, since });
      if (output) ctx.logger.raw(`${output}\n`);
      return ExitCode.OK;
    }

    // Multi-service: no service specified → show all
    if (ctx.config.services && Object.keys(ctx.config.services).length > 0) {
      if (!serviceArg) {
        // Show logs for all services
        for (const [svcName, svc] of Object.entries(ctx.config.services)) {
          const pm = getProcessManager(svc.restart.method);
          const name = svc.restart.name ?? `${ctx.config.name}-${svcName}`;
          ctx.logger.raw(`━━━ ${svcName} ━━━\n`);
          const output = await pm.logs(ssh, name, { lines, follow, grep, since });
          if (output) ctx.logger.raw(`${output}\n`);
          ctx.logger.blank();
        }
        return ExitCode.OK;
      }

      // Service not found
      const available = Object.keys(ctx.config.services).join(', ');
      ctx.logger.error(`Service "${serviceArg}" not found. Available: ${available}`);
      return ExitCode.CONFIG;
    }

    // Single-service
    if (ctx.config.restart.method === 'none') {
      ctx.logger.info('No process manager configured. No logs available.');
      return ExitCode.OK;
    }

    const pm = getProcessManager(ctx.config.restart.method);
    const name = ctx.config.restart.name ?? ctx.config.name;
    const output = await pm.logs(ssh, name, { lines, follow, grep, since });
    if (output) ctx.logger.raw(`${output}\n`);

    return ExitCode.OK;
  }
}

export default new LogsCommand();
