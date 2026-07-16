import type { NormalizedConfig, ResolvedHost } from '../config/types.js';
import type { Logger } from '../logging/logger.js';
import type { SSHClient } from '../ssh/client.js';

/**
 * Context passed to each deploy pipeline step.
 * Immutable after construction.
 */
export interface DeployContext {
  readonly config: NormalizedConfig;
  readonly host: ResolvedHost;
  readonly ssh: SSHClient;
  readonly logger: Logger;
  readonly projectDir: string;
  readonly dryRun: boolean;
  /** Optional service name when deploying a specific service */
  readonly serviceName?: string;
}

/**
 * Result of a successful deploy pipeline.
 */
export interface DeployResult {
  success: boolean;
  timings: Record<string, number>;
}
