import { ExitCode } from '../errors/index.js';
import { HostResolver } from '../host/resolver.js';
import { getProcessManager } from '../process-managers/index.js';
import type { Command, CommandContext } from './types.js';

class StartCommand implements Command {
  readonly name = 'start';
  readonly description = 'Start the remote service';
  readonly usage = 'shipway start [project]';

  async execute(ctx: CommandContext): Promise<number> {
    if (!ctx.config) {
      ctx.logger.error('No shipway config found.');
      return ExitCode.CONFIG;
    }
    if (ctx.config.restart.method === 'none') {
      ctx.logger.info('No process manager configured.');
      return ExitCode.OK;
    }

    const resolver = new HostResolver();
    await resolver.resolve(ctx.config.host);
    const ssh = await ctx.createSSH();
    const pm = getProcessManager(ctx.config.restart.method);
    const name = ctx.config.restart.name ?? ctx.config.name;

    ctx.logger.info(`Starting ${name}...`);
    if (ctx.config.restart.start) {
      const remoteDir = ctx.config.sync[0]?.remote ?? `/home/${name}`;
      await pm.start(ssh, {
        name,
        command: ctx.config.restart.start,
        cwd: remoteDir,
      });
    } else {
      // If pm2, try pm2 start <name>; if systemd, systemctl start
      await pm.start(ssh, { name, command: name, cwd: '.' });
    }
    ctx.logger.success('Started');
    return ExitCode.OK;
  }
}

export default new StartCommand();
