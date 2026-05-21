import type { ShipwayConfig, SyncEntry, HealthConfig, ServiceConfig } from './schema.js';
import type { NormalizedConfig, NormalizedHealth, NormalizedService } from './types.js';

/** Default excludes applied to every sync entry unless overridden. */
const DEFAULT_EXCLUDES = ['.DS_Store', '._*', '.git', 'node_modules'];

/**
 * Normalize a parsed+validated ShipwayConfig into a fully-expanded NormalizedConfig.
 * Applies all shorthand expansions per GEMINI.md §6.2.
 */
export function normalize(raw: ShipwayConfig): NormalizedConfig {
  const syncEntries = normalizeSyncEntries(raw.sync, raw.exclude);
  const restart = normalizeRestart(raw.restart, raw.start, raw.name);
  const health = normalizeHealth(raw.health, raw.port);

  const result: NormalizedConfig = {
    name: raw.name,
    url: raw.url,
    host: raw.host,
    sync: syncEntries,
    build: raw.build,
    postSync: raw.postSync,
    start: raw.start,
    restart,
    health,
    exclude: raw.exclude ?? DEFAULT_EXCLUDES,
  };

  if (raw.services) {
    result.services = {};
    for (const [key, svc] of Object.entries(raw.services)) {
      result.services[key] = normalizeService(svc, raw, key);
    }
  }

  return result;
}

/**
 * Parse a sync shorthand string: "./dist → ~/app" or "./dist -> ~/app"
 */
function parseSyncString(s: string): SyncEntry {
  // Support both → (unicode) and -> (ASCII)
  const separators = ['→', '->'];
  for (const sep of separators) {
    const idx = s.indexOf(sep);
    if (idx !== -1) {
      const local = s.slice(0, idx).trim();
      const remote = s.slice(idx + sep.length).trim();
      return { local, remote };
    }
  }
  // If no arrow, treat as local-only (remote must be provided elsewhere)
  throw new Error(`Invalid sync string "${s}": must contain → or ->`);
}

/**
 * Normalize the flexible sync input into a flat array of SyncEntry.
 */
function normalizeSyncEntries(
  sync: ShipwayConfig['sync'],
  globalExcludes?: string[],
): SyncEntry[] {
  if (!sync) return [];

  const excludes = globalExcludes ?? DEFAULT_EXCLUDES;

  const entries: SyncEntry[] = [];
  const raw = Array.isArray(sync) ? sync : [sync];

  for (const item of raw) {
    if (typeof item === 'string') {
      const parsed = parseSyncString(item);
      entries.push({
        ...parsed,
        exclude: excludes,
        delete: true,
        checksum: false,
      });
    } else {
      entries.push({
        ...item,
        exclude: item.exclude ?? excludes,
        delete: item.delete ?? true,
        checksum: item.checksum ?? false,
      });
    }
  }

  return entries;
}

/**
 * Normalize restart config.
 * If `start` is provided without `restart`, create a pm2 restart config.
 */
function normalizeRestart(
  restart: ShipwayConfig['restart'],
  start: string | undefined,
  name: string,
  serviceName?: string,
): { method: 'pm2' | 'systemd' | 'none'; name?: string; start?: string } {
  if (restart) {
    return {
      method: restart.method,
      name: restart.name ?? (serviceName ? `${name}-${serviceName}` : name),
      start: restart.start ?? start,
    };
  }

  if (start) {
    return {
      method: 'pm2',
      name: serviceName ? `${name}-${serviceName}` : name,
      start,
    };
  }

  return { method: 'none' };
}

/**
 * Normalize health config.
 * If only a port is given, generate the full health config from it.
 */
function normalizeHealth(
  health: HealthConfig | undefined,
  port: number | undefined,
): NormalizedHealth | undefined {
  if (health !== undefined) {
    if (typeof health === 'number') {
      return {
        url: `http://localhost:${health}/`,
        expect: 200,
        retries: 5,
        delayMs: 1000,
      };
    }
    return {
      url: health.url,
      expect: health.expect,
      retries: health.retries,
      delayMs: health.delayMs,
    };
  }

  // If port is provided but no explicit health, infer health from port
  if (port !== undefined) {
    return {
      url: `http://localhost:${port}/`,
      expect: 200,
      retries: 5,
      delayMs: 1000,
    };
  }

  return undefined;
}

/**
 * Normalize a service entry, inheriting defaults from the root config.
 */
function normalizeService(
  svc: ServiceConfig,
  root: ShipwayConfig,
  serviceName: string,
): NormalizedService {
  return {
    build: svc.build ?? root.build,
    sync: normalizeSyncEntries(svc.sync ?? root.sync, root.exclude),
    postSync: svc.postSync ?? root.postSync,
    start: svc.start ?? root.start,
    restart: normalizeRestart(svc.restart, svc.start ?? root.start, root.name, serviceName),
    health: normalizeHealth(svc.health, svc.port ?? root.port),
    cwd: svc.cwd,
  };
}
