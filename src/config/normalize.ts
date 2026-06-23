import type {
  EnvFileConfig,
  HealthConfig,
  ServiceConfig,
  ShipwayConfig,
  SyncEntry,
} from './schema.js';
import type {
  NormalizedConfig,
  NormalizedEnvFile,
  NormalizedHealth,
  NormalizedService,
} from './types.js';

/** Default excludes applied to every sync entry unless overridden. */
const DEFAULT_EXCLUDES = ['.DS_Store', '._*', '.git', 'node_modules'];

/**
 * Normalize a parsed+validated ShipwayConfig into a fully-expanded NormalizedConfig.
 * Applies all shorthand expansions per GEMINI.md §6.2.
 */
export function normalize(raw: ShipwayConfig): NormalizedConfig {
  const remoteDir = raw.remoteDir;
  const syncEntries = normalizeSyncEntries(raw.sync, raw.exclude, remoteDir);
  const restart = normalizeRestart(raw.restart, raw.start, raw.name, undefined, remoteDir);
  const health = normalizeHealth(raw.health, raw.port);
  const postSync = normalizePostSync(raw.postSync, remoteDir);
  const env = normalizeEnvFile(raw.env, remoteDir);

  const result: NormalizedConfig = {
    name: raw.name,
    url: raw.url,
    host: raw.host!,
    remoteDir,
    sync: syncEntries,
    build: raw.build,
    postSync,
    start: raw.start,
    restart,
    health,
    env,
    exclude: raw.exclude ?? DEFAULT_EXCLUDES,
  };

  if (raw.services) {
    result.services = {};
    for (const [key, svc] of Object.entries(raw.services)) {
      result.services[key] = normalizeService(svc, raw, key);
    }
  }

  if (raw.logs) {
    result.logs = {};
    for (const [key, strat] of Object.entries(raw.logs)) {
      // Shorthand string → remote file to tail.
      result.logs[key] = typeof strat === 'string' ? { file: strat } : { ...strat };
    }
  }

  return result;
}

/**
 * Resolve env-file locations for `shipway env`. The remote path defaults to
 * `<remoteDir>/.env`; the local path defaults to `./.env`. Returns undefined
 * only when neither a remote path nor a remoteDir is available.
 */
function normalizeEnvFile(
  env: EnvFileConfig | undefined,
  remoteDir: string | undefined,
): NormalizedEnvFile | undefined {
  const defaultRemote = remoteDir ? `${remoteDir.replace(/\/+$/, '')}/.env` : undefined;

  if (env === undefined) {
    return defaultRemote ? { remote: defaultRemote, local: '.env' } : undefined;
  }
  if (typeof env === 'string') {
    return { remote: env, local: '.env' };
  }
  const remote = env.remote ?? defaultRemote;
  if (!remote) return undefined;
  return { remote, local: env.local ?? '.env' };
}

/**
 * Parse a sync shorthand string: "./dist → ~/app" or "./dist -> ~/app"
 * If only a local path (no arrow), remote defaults to remoteDir.
 */
function parseSyncString(s: string, remoteDir?: string): SyncEntry {
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

  // No arrow — treat as local-only, remote is remoteDir
  if (remoteDir) {
    return { local: s, remote: remoteDir };
  }

  throw new Error(`Invalid sync string "${s}": must contain → or -> (or set remoteDir)`);
}

/**
 * Normalize the flexible sync input into a flat array of SyncEntry.
 */
function normalizeSyncEntries(
  sync: ShipwayConfig['sync'],
  globalExcludes?: string[],
  remoteDir?: string,
): SyncEntry[] {
  if (!sync) return [];

  const excludes = globalExcludes ?? DEFAULT_EXCLUDES;

  const entries: SyncEntry[] = [];
  const raw = Array.isArray(sync) ? sync : [sync];

  for (const item of raw) {
    if (typeof item === 'string') {
      const parsed = parseSyncString(item, remoteDir);
      entries.push({
        ...parsed,
        exclude: excludes,
        delete: true,
        checksum: false,
      });
    } else {
      // Object form — remote defaults to remoteDir if not set
      const remote = item.remote ?? remoteDir;
      if (!remote) {
        throw new Error(
          `Sync entry is missing "remote" and no "remoteDir" is set: ${JSON.stringify(item)}`,
        );
      }
      entries.push({
        ...item,
        remote,
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
 * When remoteDir is set, it becomes the cwd for pm2.
 */
function normalizeRestart(
  restart: ShipwayConfig['restart'],
  start: string | undefined,
  name: string,
  serviceName?: string,
  remoteDir?: string,
): { method: 'pm2' | 'systemd' | 'none'; name?: string; start?: string; cwd?: string } {
  if (restart) {
    return {
      method: restart.method,
      name: restart.name ?? (serviceName ? `${name}-${serviceName}` : name),
      start: restart.start ?? start,
      cwd: remoteDir,
    };
  }

  if (start) {
    return {
      method: 'pm2',
      name: serviceName ? `${name}-${serviceName}` : name,
      start,
      cwd: remoteDir,
    };
  }

  return { method: 'none' };
}

/**
 * Prefix postSync with `cd remoteDir &&` if remoteDir is set
 * and the command doesn't already start with `cd `.
 */
function normalizePostSync(
  postSync: string | undefined,
  remoteDir: string | undefined,
): string | undefined {
  if (!postSync) return undefined;
  if (!remoteDir) return postSync;

  // If the user already wrote `cd /something`, don't double-prefix
  if (postSync.trimStart().startsWith('cd ')) return postSync;

  return `cd ${remoteDir} && ${postSync}`;
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
  const remoteDir = root.remoteDir;
  return {
    // Per-service build is the service's OWN build only — it must NOT inherit root.build, or every
    // service would re-run the shared root build in its pipeline (double build). The root `build`
    // still runs ONCE before all services (see deployMultiService); a service's own build runs in
    // its per-service pipeline, so `shipway deploy <service>` can build just that one.
    build: svc.build,
    sync: normalizeSyncEntries(svc.sync ?? root.sync, root.exclude, remoteDir),
    postSync: normalizePostSync(svc.postSync ?? root.postSync, remoteDir),
    start: svc.start ?? root.start,
    restart: normalizeRestart(
      svc.restart,
      svc.start ?? root.start,
      root.name,
      serviceName,
      remoteDir,
    ),
    health: normalizeHealth(svc.health, svc.port ?? root.port),
    cwd: svc.cwd,
  };
}
