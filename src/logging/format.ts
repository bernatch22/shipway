import { bold, dim, green, red, yellow } from './colors.js';

/**
 * Format a duration in milliseconds to a human-readable string.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

/**
 * Step status indicators for pipeline output.
 */
export const ICONS = {
  start: '▶',
  success: '✓',
  failure: '✗',
  skip: '○',
  info: 'ℹ',
  warn: '⚠',
  error: '✗',
  deploy: '🚀',
  build: '⚙',
  sync: '📦',
  health: '🏥',
  restart: '🔄',
  link: '🔗',
} as const;

/**
 * Format a step start message.
 */
export function stepStart(name: string): string {
  return `${yellow(ICONS.start)} ${bold(name)}`;
}

/**
 * Format a step end message with timing.
 */
export function stepEnd(name: string, status: 'success' | 'failure', durationMs: number): string {
  const icon = status === 'success' ? green(ICONS.success) : red(ICONS.failure);
  const timing = dim(`(${formatDuration(durationMs)})`);
  return `${icon} ${name} ${timing}`;
}

/**
 * Format a deploy header.
 */
export function deployHeader(projectName: string, dryRun: boolean): string {
  const label = `${ICONS.deploy} shipway → ${bold(projectName)}`;
  return dryRun ? `${label} ${yellow('[DRY RUN]')}` : label;
}

/**
 * Format a deploy footer.
 */
export function deployFooter(durationMs: number, url?: string): string {
  const timing = green(`Deployed in ${formatDuration(durationMs)}`);
  const urlLine = url ? `\n   ${dim(url)}` : '';
  return `\n${green(ICONS.deploy)} ${timing}${urlLine}\n`;
}
