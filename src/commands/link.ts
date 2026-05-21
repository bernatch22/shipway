import { FileProjectRepository } from '../registry/file-repository.js';
import { findConfigFile, loadConfig } from '../config/parser.js';
import { ExitCode } from '../errors/index.js';
import type { Command, CommandContext } from './types.js';

class LinkCommand implements Command {
  readonly name = 'link';
  readonly description = 'Register the current directory as a project';
  readonly usage = 'shipway link [alias]';

  async execute(ctx: CommandContext): Promise<number> {
    const configPath = findConfigFile(ctx.cwd);
    if (!configPath) {
      ctx.logger.error('No shipway.yml found in current directory.');
      return ExitCode.CONFIG;
    }

    const config = await loadConfig(configPath);
    const alias = ctx.args[0] ?? config.name;

    const registry = new FileProjectRepository();
    await registry.add({
      alias,
      path: ctx.cwd,
      addedAt: new Date().toISOString(),
    });

    ctx.logger.success(`Linked: ${alias} → ${ctx.cwd}`);
    return ExitCode.OK;
  }
}

export default new LinkCommand();
