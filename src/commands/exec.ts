import { HostResolver } from '../host/resolver.js';
import { ExitCode } from '../errors/index.js';
import type { Command, CommandContext } from './types.js';

class ExecCommand implements Command {
  readonly name = 'exec';
  readonly description = 'Execute a command on the remote host';
  readonly usage = 'shipway exec [project] -- <command>';

  async execute(ctx: CommandContext): Promise<number> {
    if (!ctx.config) {
      ctx.logger.error('No shipway config found.');
      return ExitCode.CONFIG;
    }

    const remoteCmd = ctx.args.join(' ');
    if (!remoteCmd) {
      ctx.logger.error('No command specified. Usage: shipway exec -- <command>');
      return ExitCode.GENERAL;
    }

    const resolver = new HostResolver();
    const host = await resolver.resolve(ctx.config.host);
    const ssh = await ctx.createSSH();

    const remoteDir = ctx.config.sync[0]?.remote ?? host.home;
    const result = await ssh.exec(`cd ${remoteDir} && ${remoteCmd}`, { allowFail: true });
    return result.exitCode;
  }
}

export default new ExecCommand();
