import deploy from './deploy.js';
import env from './env.js';
import exec from './exec.js';
import help from './help.js';
import link from './link.js';
import logs from './logs.js';
import ls from './ls.js';
import migrate from './migrate.js';
import open from './open.js';
import restart from './restart.js';
import ssh from './ssh.js';
import start from './start.js';
import status from './status.js';
import stop from './stop.js';
import type { Command } from './types.js';
import unlink from './unlink.js';

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
  env,
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
