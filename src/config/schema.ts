import { z } from 'zod';

// ── Sync entry ────────────────────────────────────────────

export const SyncEntrySchema = z.object({
  local: z.union([z.string(), z.array(z.string())]),
  remote: z.string().optional(),
  exclude: z.array(z.string()).optional(),
  delete: z.boolean().optional(),
  checksum: z.boolean().optional(),
});

// ── Env file (for `shipway env` pull/push) ────────────────

export const EnvFileSchema = z.union([
  z.string(), // shorthand: remote path; local defaults to ./.env
  z.object({
    remote: z.string().optional(),
    local: z.string().optional(),
  }),
]);

// ── Host shapes ───────────────────────────────────────────

const HostSshSchema = z.object({
  ssh: z.string(),
  key: z.string().optional(),
});
const HostIpSchema = z.object({
  ip: z.string(),
  user: z.string(),
  key: z.string().optional(),
});

export const HostObjectSchema = z.union([HostSshSchema, HostIpSchema]);
export const HostSchema = z.union([z.string(), HostObjectSchema]);

// ── Restart ───────────────────────────────────────────────

export const RestartSchema = z.object({
  method: z.enum(['pm2', 'systemd', 'none']).default('pm2'),
  name: z.string().optional(),
  start: z.string().optional(),
});

// ── Health check ──────────────────────────────────────────

export const HealthSchema = z.union([
  z.number().int().positive(),
  z.object({
    url: z.string(),
    expect: z.number().int().default(200),
    retries: z.number().int().default(5),
    delayMs: z.number().int().default(1000),
  }),
]);

// ── Sync (flexible input) ─────────────────────────────────

export const SyncFlexSchema = z.union([
  z.string(),
  SyncEntrySchema,
  z.array(z.union([z.string(), SyncEntrySchema])),
]);

// ── Service (within multi-service config) ─────────────────

export const ServiceSchema = z.object({
  build: z.string().optional(),
  sync: SyncFlexSchema.optional(),
  postSync: z.string().optional(),
  start: z.string().optional(),
  restart: RestartSchema.optional(),
  port: z.number().optional(),
  health: HealthSchema.optional(),
  cwd: z.string().optional(),
});
// ── Environment overrides ─────────────────────────────────

export const EnvironmentSchema = z.object({
  url: z.string().url().optional(),
  host: HostSchema.optional(),
  remoteDir: z.string().optional(),
  build: z.string().optional(),
  sync: SyncFlexSchema.optional(),
  postSync: z.string().optional(),
  start: z.string().optional(),
  restart: RestartSchema.optional(),
  port: z.number().optional(),
  health: HealthSchema.optional(),
  env: EnvFileSchema.optional(),
  services: z.record(z.string(), ServiceSchema).optional(),
  exclude: z.array(z.string()).optional(),
});

// ── Top-level config ──────────────────────────────────────

export const ShipwayConfigSchema = z.object({
  name: z.string().min(1),
  url: z.string().url().optional(),
  host: HostSchema.optional(), // optional at parse-time; required after env merge
  remoteDir: z.string().optional(),
  build: z.string().optional(),
  sync: SyncFlexSchema.optional(),
  postSync: z.string().optional(),
  start: z.string().optional(),
  restart: RestartSchema.optional(),
  port: z.number().optional(),
  health: HealthSchema.optional(),
  env: EnvFileSchema.optional(),
  services: z.record(z.string(), ServiceSchema).optional(),
  exclude: z.array(z.string()).optional(),
  environments: z.record(z.string(), EnvironmentSchema).optional(),
});

// ── Inferred types ────────────────────────────────────────

export type EnvFileConfig = z.infer<typeof EnvFileSchema>;
export type SyncEntry = z.infer<typeof SyncEntrySchema>;
export type HostConfig = z.infer<typeof HostSchema>;
export type HostObject = z.infer<typeof HostObjectSchema>;
export type RestartConfig = z.infer<typeof RestartSchema>;
export type HealthConfig = z.infer<typeof HealthSchema>;
export type ServiceConfig = z.infer<typeof ServiceSchema>;
export type EnvironmentConfig = z.infer<typeof EnvironmentSchema>;
export type ShipwayConfig = z.infer<typeof ShipwayConfigSchema>;
