import { ExitCode } from '../errors/index.js';
import { bold, cyan, dim, green, yellow } from '../logging/colors.js';
import type { Command, CommandContext } from './types.js';

const VERSION = '0.1.0';

class HelpCommand implements Command {
  readonly name = 'help';
  readonly description = 'Show help information';
  readonly usage = 'shipway help [command]';

  async execute(ctx: CommandContext): Promise<number> {
    const text = `
${cyan(bold('shipway'))} ${dim(`v${VERSION}`)} — deploy apps over SSH

${yellow('Usage:')}
  shipway <command> [options]

${yellow('Deploy:')}
  ${green('deploy')}     Build → sync → restart → health check ${dim('(default)')}

${yellow('Operations:')}
  ${green('status')}     Show service status + health check
  ${green('logs')}       Tail remote logs ${dim('(--lines, --follow, --grep, --since)')}
  ${green('restart')}    Restart the remote service
  ${green('stop')}       Stop the remote service
  ${green('start')}      Start the remote service
  ${green('exec')}       Run a command on the remote host
  ${green('env')}        Pull/push/diff the remote .env ${dim('(env pull | push --yes | diff)')}
  ${green('ssh')}        Open interactive SSH session
  ${green('open')}       Open the deployed URL in browser

${yellow('Project Management:')}
  ${green('link')}       Register current directory as a project
  ${green('unlink')}     Remove a registered project
  ${green('ls')}         List all registered projects

${yellow('Advanced:')}
  ${green('migrate')}    Convert shipit.json → shipway.yml
  ${green('help')}       Show this help

${yellow('Flags:')}
  ${green('--dry-run, -n')}  Preview commands without executing
  ${green('--env <name>')}   Use a specific environment
  ${green('--json')}         JSON output for CI
  ${green('--quiet')}        Minimal output
  ${green('--version, -v')}  Show version
  ${green('--help, -h')}     Show help

${yellow('Config:')} ${dim('shipway.yml')}
  ${dim('name')}       Project name (used for pm2, logs)
  ${dim('host')}       Target: "user@ip" or { ssh, key? } or { ip, user, key? }
  ${dim('build')}      Local build command
  ${dim('sync')}       "./local → ~/remote" or { local, remote, delete, checksum }
  ${dim('postSync')}   Remote command after sync
  ${dim('start')}      Start command (auto-creates pm2 config)
  ${dim('port')}       Port number (auto-creates health check)

${dim('Docs: https://github.com/pinecall/shipway')}
`;
    ctx.logger.raw(text);
    return ExitCode.OK;
  }
}

export default new HelpCommand();
