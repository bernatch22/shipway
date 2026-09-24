import { describe, expect, it } from 'vitest';
import { Pm2Manager } from '../../../src/process-managers/pm2.ts';
import type { SSHClient } from '../../../src/ssh/client.ts';

/** A box whose pm2 holds `held` (undefined: no such process), recording every line sent to it. */
function aBox(held?: { kill_timeout?: number }): { ssh: SSHClient; ran: string[] } {
  const ran: string[] = [];
  const answer = async (command: string): Promise<string> => {
    ran.push(command);
    if (command.startsWith('pm2 id')) return held === undefined ? 'NOTFOUND' : '[0]';
    if (command.startsWith('pm2 jlist')) {
      return JSON.stringify(held === undefined ? [] : [{ name: 'agent', pm2_env: held }]);
    }
    return '';
  };
  const ssh = { exec: answer, execSilent: answer } as unknown as SSHClient;
  return { ssh, ran };
}

const START = { name: 'agent', command: 'pinecall start --prod', cwd: '/home/berna/agent' };

describe('pm2 kill_timeout', () => {
  it('starts a new process with --kill-timeout', async () => {
    const { ssh, ran } = aBox();
    await new Pm2Manager().start(ssh, { ...START, killTimeout: 45000 });
    expect(ran).toContain(
      "cd /home/berna/agent && pm2 start 'pinecall start --prod' --name agent --kill-timeout 45000",
    );
  });

  it('recreates a process whose kill_timeout differs, since a restart cannot change it', async () => {
    const { ssh, ran } = aBox({});
    await new Pm2Manager().start(ssh, { ...START, killTimeout: 45000 });
    expect(ran).toContain('pm2 delete agent');
    expect(ran.some((line) => line.endsWith('--kill-timeout 45000'))).toBe(true);
    expect(ran.some((line) => line.startsWith('pm2 restart'))).toBe(false);
  });

  it('restarts in place when the kill_timeout already matches', async () => {
    const { ssh, ran } = aBox({ kill_timeout: 45000 });
    await new Pm2Manager().start(ssh, { ...START, killTimeout: 45000 });
    expect(ran).toContain('pm2 restart agent --update-env');
    expect(ran).not.toContain('pm2 delete agent');
  });

  it('restarts in place when the config asks for none', async () => {
    const { ssh, ran } = aBox({ kill_timeout: 1600 });
    await new Pm2Manager().start(ssh, START);
    expect(ran).toContain('pm2 restart agent --update-env');
    expect(ran.some((line) => line.startsWith('pm2 jlist'))).toBe(false);
  });
});
