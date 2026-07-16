import { ExitCode } from '../errors/index.js';
import { HostResolver } from '../host/resolver.js';
import type { Command, CommandContext } from './types.js';

class SshCommand implements Command {
  readonly name = 'ssh';
  readonly description = 'Open an interactive SSH session to the host';
  readonly usage = 'shipway ssh [project]';

  async execute(ctx: CommandContext): Promise<number> {
    if (!ctx.config) {
      ctx.logger.error('No shipway config found.');
      return ExitCode.CONFIG;
    }

    const resolver = new HostResolver();
    await resolver.resolve(ctx.config.host);
    const ssh = await ctx.createSSH();

    return ssh.interactive();
  }
}

export default new SshCommand();
