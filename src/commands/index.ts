import type { Command } from './types.js';
import deploy from './deploy.js';
import status from './status.js';
import logs from './logs.js';
import ssh from './ssh.js';
import exec from './exec.js';
import restart from './restart.js';
import stop from './stop.js';
import start from './start.js';
import open from './open.js';
import link from './link.js';
import unlink from './unlink.js';
import ls from './ls.js';
import migrate from './migrate.js';
import help from './help.js';

/**
 * Registry of all CLI commands.
 * The router looks up commands by name from this record.
 */
export const commands: Record<string, Command> = {
  deploy,
  ship: deploy, // alias
  status,
  logs,
  ssh,
  exec,
  restart,
  stop,
  start,
  open,
  link,
  unlink,
  ls,
  migrate,
  help,
};
