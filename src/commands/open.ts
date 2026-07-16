import { spawn } from 'node:child_process';
import { ExitCode } from '../errors/index.js';
import { HostResolver } from '../host/resolver.js';
import type { Command, CommandContext } from './types.js';

class OpenCommand implements Command {
  readonly name = 'open';
  readonly description = 'Open the deployed URL in the browser';
  readonly usage = 'shipway open [project]';

  async execute(ctx: CommandContext): Promise<number> {
    if (!ctx.config) {
      ctx.logger.error('No shipway config found.');
      return ExitCode.CONFIG;
    }

    const resolver = new HostResolver();
    const host = await resolver.resolve(ctx.config.host);
    const url = resolveUrl(ctx.config, host.ip);

    ctx.logger.info(`Opening ${url}`);
    spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
    return ExitCode.OK;
  }
}

function resolveUrl(
  config: { url?: string; health?: { url: string }; port?: number },
  ip: string,
): string {
  if (config.url) return config.url;
  if (config.health) return config.health.url.replace(/localhost|127\.0\.0\.1/, ip);
  return `http://${ip}/`;
}

export default new OpenCommand();
