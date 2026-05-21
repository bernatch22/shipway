import { FileProjectRepository } from '../registry/file-repository.js';
import { ExitCode } from '../errors/index.js';
import { bold, dim, green } from '../logging/colors.js';
import type { Command, CommandContext } from './types.js';

class LsCommand implements Command {
  readonly name = 'ls';
  readonly description = 'List all registered projects';
  readonly usage = 'shipway ls';

  async execute(ctx: CommandContext): Promise<number> {
    const registry = new FileProjectRepository();
    const projects = await registry.list();

    if (projects.length === 0) {
      ctx.logger.info('No projects registered. Run "shipway link" in a project directory.');
      return ExitCode.OK;
    }

    ctx.logger.raw(`\n  ${bold('Registered Projects')}\n\n`);

    for (const project of projects) {
      const lastDeploy = project.lastDeployAt
        ? dim(` (deployed: ${new Date(project.lastDeployAt).toLocaleDateString()})`)
        : '';
      ctx.logger.raw(`  ${green('●')} ${bold(project.alias)}${lastDeploy}\n`);
      ctx.logger.raw(`    ${dim(project.path)}\n`);
    }

    ctx.logger.raw('\n');
    return ExitCode.OK;
  }
}

export default new LsCommand();
