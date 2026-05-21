#!/usr/bin/env node

import { commands } from './commands/index.js';
import { loadConfigFromDir } from './config/parser.js';
import { HostResolver } from './host/resolver.js';
import { SSHClient } from './ssh/client.js';
import { Logger } from './logging/logger.js';
import { ShipwayError, ExitCode } from './errors/index.js';
import { parseArgv } from './utils/argv.js';
import type { CommandContext } from './commands/types.js';
import type { NormalizedConfig, ResolvedHost } from './config/types.js';
import type { OutputMode } from './logging/logger.js';

const VERSION = '0.0.1';

async function main(): Promise<number> {
  const parsed = parseArgv(process.argv);

  // Global flags
  if (parsed.flags.version || parsed.flags.v) {
    console.log(VERSION);
    return ExitCode.OK;
  }

  if (parsed.flags.help || parsed.flags.h) {
    parsed.command = 'help';
  }

  const commandName = parsed.command ?? 'help';

  // Logger setup
  const quiet = parsed.flags.quiet === true;
  const jsonMode = parsed.flags.json === true;
  const mode: OutputMode = jsonMode ? 'json' : 'human';
  const logger = new Logger({ mode, quiet });

  // Find command
  const command = commands[commandName];
  if (!command) {
    logger.error(`Unknown command: "${commandName}". Run 'shipway help' for available commands.`);
    return ExitCode.GENERAL;
  }

  // Load config (best-effort — some commands don't need it)
  const cwd = process.cwd();
  let config: NormalizedConfig | null = null;

  const commandsWithoutConfig = new Set(['help', 'ls', 'link', 'unlink', 'doctor', 'migrate', 'mcp']);
  if (!commandsWithoutConfig.has(commandName)) {
    try {
      config = await loadConfigFromDir(cwd);
    } catch {
      // Config load failed — command will handle null config
    }
  }

  // Resolve host lazily for SSH client creation
  let resolvedHost: ResolvedHost | null = null;

  const createSSH = async (): Promise<SSHClient> => {
    if (!config) {
      throw new Error('No config available to create SSH client');
    }
    if (!resolvedHost) {
      const resolver = new HostResolver();
      resolvedHost = await resolver.resolve(config.host);
    }
    return new SSHClient(resolvedHost.ssh, resolvedHost.key);
  };

  const ctx: CommandContext = {
    args: parsed.args,
    flags: parsed.flags,
    cwd,
    config,
    logger,
    createSSH,
  };

  return command.execute(ctx);
}

// ── Top-level error handler ───────────────────────────────

main()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((e: unknown) => {
    const logger = new Logger();

    if (e instanceof ShipwayError) {
      logger.error(e.message);
      if (e.cause) logger.debug(String(e.cause));
      process.exit(e.exitCode);
    }

    if (e instanceof Error) {
      logger.error(`Unexpected error: ${e.message}`);
      if (e.stack) logger.debug(e.stack);
    } else {
      logger.error(`Unexpected error: ${String(e)}`);
    }

    process.exit(ExitCode.GENERAL);
  });
