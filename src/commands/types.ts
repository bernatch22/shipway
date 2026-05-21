import type { NormalizedConfig } from '../config/types.js';
import type { Logger } from '../logging/logger.js';
import type { SSHClient } from '../ssh/client.js';

/**
 * Command interface — each CLI subcommand implements this.
 */
export interface Command {
  readonly name: string;
  readonly description: string;
  readonly usage: string;
  execute(ctx: CommandContext): Promise<number>;
}

/**
 * Context passed to each command.
 */
export interface CommandContext {
  args: string[];
  flags: Record<string, string | boolean>;
  cwd: string;
  config: NormalizedConfig | null;
  logger: Logger;
  createSSH: () => Promise<SSHClient>;
}
