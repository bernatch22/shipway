import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { ExitCode } from '../errors/index.js';
import type { Command, CommandContext } from './types.js';

class MigrateCommand implements Command {
  readonly name = 'migrate';
  readonly description = 'Convert shipit.json to shipway.yml';
  readonly usage = 'shipway migrate [dir]';

  async execute(ctx: CommandContext): Promise<number> {
    const dir = ctx.args[0] ?? ctx.cwd;
    const shipitPath = resolve(dir, 'shipit.json');

    if (!existsSync(shipitPath)) {
      ctx.logger.error(`No shipit.json found in ${dir}`);
      return ExitCode.CONFIG;
    }

    const content = await readFile(shipitPath, 'utf-8');
    const shipit = JSON.parse(content);

    // Convert to shipway format
    const shipway: Record<string, unknown> = {
      name: shipit.name,
    };

    if (shipit.url) shipway.url = shipit.url;

    // Convert host
    if (shipit.host) {
      if (shipit.host.ssh) {
        shipway.host = shipit.host.ssh;
      } else if (shipit.host.ip && shipit.host.user) {
        shipway.host = `${shipit.host.user}@${shipit.host.ip}`;
      } else if (shipit.host.instance) {
        shipway.host = shipit.host;
      }
    }

    if (shipit.build) shipway.build = shipit.build;

    // Convert sync
    if (shipit.sync) {
      const entries = Array.isArray(shipit.sync) ? shipit.sync : [shipit.sync];
      if (entries.length === 1) {
        const e = entries[0];
        if (e.exclude || e.checksum || e.delete === false) {
          shipway.sync = e;
        } else {
          shipway.sync = `${e.local} → ${e.remote}`;
        }
      } else {
        shipway.sync = entries;
      }
    }

    if (shipit.postSync) {
      // Simplify postSync by removing cd prefix if it matches the sync remote
      shipway.postSync = shipit.postSync;
    }

    // Convert restart to start shorthand where possible
    if (shipit.restart) {
      if (shipit.restart.method === 'pm2' && shipit.restart.start) {
        shipway.start = shipit.restart.start;
      } else if (shipit.restart.method !== 'pm2') {
        shipway.restart = shipit.restart;
      }
    }

    // Convert health to port shorthand where possible
    if (shipit.health) {
      const portMatch = /localhost:(\d+)/.exec(shipit.health.url);
      if (
        portMatch &&
        (shipit.health.expect === 200 || !shipit.health.expect) &&
        !shipit.health.retries &&
        !shipit.health.delayMs
      ) {
        shipway.port = parseInt(portMatch[1]!, 10);
      } else {
        shipway.health = shipit.health;
      }
    }

    const yaml = stringifyYaml(shipway, { lineWidth: 0 });
    const outPath = resolve(dir, 'shipway.yml');
    await writeFile(outPath, yaml, 'utf-8');

    ctx.logger.success(`Migrated: ${shipitPath} → ${outPath}`);
    ctx.logger.info('Review the generated shipway.yml and test with: shipway deploy --dry-run');
    return ExitCode.OK;
  }
}

export default new MigrateCommand();
