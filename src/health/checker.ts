import type { SSHClient } from '../ssh/client.js';
import type { NormalizedHealth } from '../config/types.js';
import type { Logger } from '../logging/logger.js';

export interface HealthCheckResult {
  healthy: boolean;
  statusCode: number | null;
  attempts: number;
}

/**
 * Run an HTTP health check on the remote server via curl over SSH.
 * Retries with configurable delay and attempts.
 */
export async function checkHealth(
  ssh: SSHClient,
  health: NormalizedHealth,
  logger: Logger,
): Promise<HealthCheckResult> {
  const { url, expect, retries, delayMs } = health;

  for (let i = 1; i <= retries; i++) {
    const result = await ssh.execSilent(
      `curl -s -o /dev/null -w '%{http_code}' --max-time 5 ${url}`,
      { allowFail: true },
    );

    const statusCode = parseInt(result.trim(), 10) || null;

    if (statusCode === expect) {
      logger.success(`Healthy (HTTP ${statusCode}) on attempt ${i}`);
      return { healthy: true, statusCode, attempts: i };
    }

    if (i < retries) {
      logger.debug(`attempt ${i}: HTTP ${statusCode ?? '—'}, retrying in ${delayMs}ms...`);
      await sleep(delayMs);
    } else {
      logger.error(`Failed after ${retries} attempts (last: HTTP ${statusCode ?? '—'})`);
    }
  }

  return { healthy: false, statusCode: null, attempts: retries };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
