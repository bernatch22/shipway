import { ExitCode } from '../errors/index.js';
import { FileProjectRepository } from '../registry/file-repository.js';
import type { Command, CommandContext } from './types.js';

class UnlinkCommand implements Command {
  readonly name = 'unlink';
  readonly description = 'Remove a registered project';
  readonly usage = 'shipway unlink <alias>';

  async execute(ctx: CommandContext): Promise<number> {
    const alias = ctx.args[0];
    if (!alias) {
      ctx.logger.error('Usage: shipway unlink <alias>');
      return ExitCode.GENERAL;
    }

    const registry = new FileProjectRepository();
    const project = await registry.get(alias);
    if (!project) {
      ctx.logger.error(`No project registered with alias "${alias}".`);
      return ExitCode.GENERAL;
    }

    await registry.remove(alias);
    ctx.logger.success(`Unlinked: ${alias}`);
    return ExitCode.OK;
  }
}

export default new UnlinkCommand();
