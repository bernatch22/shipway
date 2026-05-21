import type { ProcessManager } from './types.js';
import { Pm2Manager } from './pm2.js';
import { SystemdManager } from './systemd.js';
import { NoneManager } from './none.js';

export type { ProcessManager, StartOpts, LogsOpts, ProcessStatus } from './types.js';

/**
 * Factory: get the right process manager by method name.
 */
export function getProcessManager(method: 'pm2' | 'systemd' | 'none'): ProcessManager {
  switch (method) {
    case 'pm2':
      return new Pm2Manager();
    case 'systemd':
      return new SystemdManager();
    case 'none':
      return new NoneManager();
  }
}
