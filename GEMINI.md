# shipway — Implementation Plan

> Build target: a minimal, deployment-aware CLI + MCP server for shipping Node.js / Python / Ruby apps over SSH.
> Audience for this document: an autonomous coding agent that will scaffold the repo from scratch and ship v0.1.0.
> Status: greenfield. Discard prior `shipit` codebase and start fresh, but consult its safety patterns.

---

## 0. Mission

`shipway` is a CLI and MCP server for deploying long-running services to a VPS over SSH. It targets the niche where Docker is overkill: small teams, single-server (or few-servers) deployments, Node/Python/Ruby apps managed by pm2 or systemd. Its competitive promises are:

1. **The shortest config in the category** — a typical project deploys with a 7-line `shipway.yml`.
2. **Multi-project orchestration** — register projects globally, run `shipway deploy <alias>` from anywhere.
3. **Cross-runtime remote debugging** — one command opens an SSH-tunneled debugger session for Node, Python, or Ruby.
4. **First-class AI agent integration** — exposes a semantic MCP server with read/restricted/full permission tiers and full audit logging, so coding agents can inspect production safely.

The name is locked. The npm package name `shipway` is verified available as of 2026-05-21.

---

## 1. Source Material

### 1.1. Prior implementation (reference only, do not import)

The user's previous tool, `shipit`, exists at `~/shipit/`. Read `~/shipit/src/index.ts` once to understand the working pipeline. **Do not copy code wholesale.** This is a clean rewrite under a new name with a different architecture (modular, multi-project, MCP-enabled).

Patterns to carry forward from the old code (re-implement in the new structure):
- **Shallow-path delete protection**: refuse `rsync --delete` on remote paths with fewer than 3 segments. Prevents accidentally wiping `/home/user`.
- **Multi-local delete guard**: when a sync entry has multiple `local` sources to the same `remote`, disable `--delete` automatically and warn — otherwise each rsync run wipes the previous one's output.
- **Checksum mode**: rsync `--checksum` flag exposed in config for large static assets that get fresh timestamps on every build.
- **Health check with retries**: configurable retries and delay between attempts; show last response on failure.
- **Dry-run mode**: print every command without executing.

Patterns to discard:
- The zero-dependencies constraint. We will use `yaml`, `zod`, and `@modelcontextprotocol/sdk` deliberately.
- JSON-only config. YAML is the primary format. JSON accepted for backwards-compat with people who already wrote configs.
- The single-file `src/index.ts` god-file. We modularize hard.
- The shell-based `exec` with `sh -c` for build commands. Replace with proper child_process spawn with array args; only use shell when the user's build string explicitly needs `&&`/`||`.
- Hardcoded `~/.ssh/google_compute_engine` key path. Make this configurable.

### 1.2. Existing user configs to support

The first two real users are the user's own projects. v0.1.0 ships if and only if these deploy end-to-end through `shipway`:

`~/deutschepolska/shipway.yml`:
```yaml
name: deutschepolska
host: berna@34.123.241.2
build: npm run build && cp server.mjs package.json package-lock.json dist/
sync: ./dist → ~/deutschepolska
postSync: npm install --omit=dev
start: node server.mjs
port: 5050
```

`~/blossom-landing/blossom-app/shipway.yml`:
```yaml
name: blossom-landing
url: https://blossom.pe
host: berna@34.123.241.2
build: npx react-router build
sync:
  - { local: ./build, remote: ~/blossom-landing/build, checksum: true }
  - { local: [./public, ./package.json, ./package-lock.json], remote: ~/blossom-landing, delete: false }
postSync: npm install --omit=dev --no-audit --no-fund
port: 3000
```

A test must verify both configs parse, validate, and produce the expected internal representation. A separate integration test (against a local mock SSH server) must verify the deploy pipeline orchestrates correctly.

### 1.3. Reference: BrainBank's MCP architecture

The user's `brainbank` project at `~/brainbank/` uses `StdioServerTransport` exclusively for MCP. We follow the same pattern. Read `~/brainbank/src/mcp/mcp-server.ts` and `~/brainbank/src/mcp/workspace-pool.ts` for the structural template. The key insight is to redirect `stdout` writes from internal code to `stderr` so they never corrupt the JSON-RPC frame on stdio — see `workspace-factory.ts` in BrainBank.

---

## 2. Design Principles

1. **Convention over configuration.** Every field should have a sensible default. Common cases are one-liners.
2. **Safe by default.** Destructive operations (rsync --delete, env modifications) require explicit opt-in or a deep enough path.
3. **Deployment-aware, not generic.** `shipway.yml` carries domain knowledge so commands can be terse: `shipway logs blossom` works because shipway knows the pm2 name and host already.
4. **One concept per command.** `deploy`, `status`, `logs`, `debug`, `tunnel`, `exec`. No command does two unrelated things.
5. **Cross-runtime.** Node first, but Python and Ruby debug + status are first-class from day one (even if more limited).
6. **Audit everything an agent does.** MCP calls always write to the audit log, even read-only ones.
7. **Fail loudly with helpful messages.** Errors include the exact command that failed, the exit code, and a hint when there's a common cause.

---

## 3. Design Patterns Required

These are not optional. The agent executing this plan must use these patterns where indicated to keep the codebase modular and testable.

### 3.1. Command pattern — for CLI commands

Each subcommand is a class implementing a `Command` interface. The CLI router dispatches based on argv[2].

```typescript
// src/commands/types.ts
export interface Command {
  readonly name: string;
  readonly description: string;
  readonly usage: string;
  execute(ctx: CommandContext): Promise<number>; // returns exit code
}

export interface CommandContext {
  args: string[];          // positional args after command name
  flags: Record<string, string | boolean>;
  cwd: string;
  config: ShipwayConfig | null;  // null when command doesn't need it (e.g. `ls`)
  registry: ProjectRepository;
  logger: Logger;
  ssh: SSHClient;
}
```

Each command lives in `src/commands/<name>.ts` and exports a default instance:

```typescript
// src/commands/deploy.ts
class DeployCommand implements Command {
  name = 'deploy';
  description = 'Build, sync, restart, and health-check a service';
  usage = 'shipway deploy [project] [service]';
  async execute(ctx: CommandContext): Promise<number> { ... }
}
export default new DeployCommand();
```

The router (`src/cli.ts`) imports all commands from `src/commands/index.ts` and dispatches.

### 3.2. Strategy pattern — for per-runtime debug behavior

Each runtime (Node, Python, Ruby) has its own debugger protocol, default port, and enable/disable procedure. Abstract this:

```typescript
// src/runtimes/types.ts
export interface RuntimeStrategy {
  readonly name: 'node' | 'python' | 'ruby';
  readonly defaultDebugPort: number;

  /** Detect whether this runtime applies given a config */
  detect(config: ShipwayConfig): boolean;

  /** Restart the process with debugger enabled */
  enableDebug(ssh: SSHClient, pm2Name: string, port: number): Promise<void>;

  /** Restart the process back to normal mode */
  disableDebug(ssh: SSHClient, pm2Name: string): Promise<void>;

  /** Generate the launch.json snippet for VS Code */
  generateLaunchJson(opts: { localRoot: string; remoteRoot: string; port: number }): object;
}
```

Implementations in `src/runtimes/node.ts`, `src/runtimes/python.ts`, `src/runtimes/ruby.ts`. A registry in `src/runtimes/index.ts` returns the right strategy based on inspection of the `start` command.

Detection logic:
- `start` matches `^node ` or contains `node ` → node runtime
- `start` matches `^python(3?)? ` or contains `python -m` → python runtime
- `start` matches `^(bundle exec )?(ruby|rails|rake|puma|unicorn)` → ruby runtime
- Otherwise: unknown, refuse debug with a clear error message

### 3.3. Adapter pattern — for process managers

```typescript
// src/process-managers/types.ts
export interface ProcessManager {
  readonly kind: 'pm2' | 'systemd' | 'none';
  start(ssh: SSHClient, opts: StartOpts): Promise<void>;
  stop(ssh: SSHClient, name: string): Promise<void>;
  restart(ssh: SSHClient, name: string, env?: Record<string, string>): Promise<void>;
  status(ssh: SSHClient, name: string): Promise<ProcessStatus>;
  logs(ssh: SSHClient, name: string, opts: LogsOpts): Promise<string>;
}
```

Implementations:
- `src/process-managers/pm2.ts` — uses `pm2 start/stop/restart/describe/logs`
- `src/process-managers/systemd.ts` — uses `sudo systemctl start/stop/restart/status/journalctl`
- `src/process-managers/none.ts` — no-op stubs; for static sites without a process

### 3.4. Repository pattern — for the project registry

```typescript
// src/registry/types.ts
export interface Project {
  alias: string;
  path: string;             // absolute path to project root
  addedAt: string;          // ISO timestamp
  lastDeployAt?: string;
}

export interface ProjectRepository {
  list(): Promise<Project[]>;
  get(alias: string): Promise<Project | null>;
  add(project: Project): Promise<void>;
  remove(alias: string): Promise<void>;
  updateLastDeploy(alias: string): Promise<void>;
}
```

Implementation: `src/registry/file-repository.ts` reads/writes `~/.shipway/projects.yml`. Concurrent-safe via a write-then-rename pattern (write to `.tmp`, then atomic rename).

### 3.5. Pipeline pattern — for the deploy flow

The deploy command is a fixed pipeline of steps. Each step is independent and testable.

```typescript
// src/pipeline/types.ts
export interface DeployStep {
  readonly name: string;        // 'build', 'sync', 'postSync', etc.
  shouldRun(ctx: DeployContext): boolean;  // skip if e.g. no build command
  run(ctx: DeployContext): Promise<void>;
}

// src/pipeline/deploy-pipeline.ts
export class DeployPipeline {
  constructor(private steps: DeployStep[]) {}
  async execute(ctx: DeployContext): Promise<DeployResult> {
    const timings: Record<string, number> = {};
    for (const step of this.steps) {
      if (!step.shouldRun(ctx)) continue;
      const t0 = Date.now();
      ctx.logger.startStep(step.name);
      try {
        await step.run(ctx);
        timings[step.name] = Date.now() - t0;
        ctx.logger.endStep(step.name, 'success', timings[step.name]);
      } catch (e) {
        ctx.logger.endStep(step.name, 'failure', Date.now() - t0);
        throw new DeployError(step.name, e);
      }
    }
    return { success: true, timings };
  }
}
```

Concrete steps in `src/pipeline/steps/`: `resolve-host.ts`, `build.ts`, `sync.ts`, `post-sync.ts`, `restart.ts`, `health-check.ts`.

### 3.6. Factory pattern — for host resolution

```typescript
// src/host/resolver.ts
export class HostResolver {
  async resolve(config: HostConfig): Promise<ResolvedHost> {
    if (typeof config === 'string') return this.fromString(config);
    if ('ssh' in config) return this.fromSshString(config);
    if ('ip' in config) return this.fromIp(config);
    if ('instance' in config) return this.fromGcloud(config);
    throw new ConfigError('host', 'Unrecognized host shape');
  }

  private fromString(s: string): ResolvedHost {
    // Accept: "user@1.2.3.4", "user@host", "gcp://user@instance.zone"
    if (s.startsWith('gcp://')) return this.fromGcloud(parseGcpUrl(s));
    const m = /^([^@]+)@(.+)$/.exec(s);
    if (!m) throw new ConfigError('host', `Invalid host string: ${s}`);
    return { ssh: s, ip: m[2], user: m[1], home: `/home/${m[1]}` };
  }
  // ...
}
```

### 3.7. Builder pattern — for rsync arguments

rsync has many flags. Construction is fiddly. Wrap it:

```typescript
// src/rsync/builder.ts
export class RsyncArgsBuilder {
  private args: string[] = ['-avz', '--stats'];
  private excludes: string[] = [];

  ssh(sshCommand: string[]): this {
    this.args.push('-e', sshCommand.join(' '));
    return this;
  }
  checksum(enabled: boolean): this {
    if (enabled) this.args.push('--checksum');
    return this;
  }
  delete(enabled: boolean): this {
    if (enabled) this.args.push('--delete');
    return this;
  }
  dryRun(enabled: boolean): this {
    if (enabled) this.args.push('-n');
    return this;
  }
  exclude(pattern: string): this {
    this.excludes.push(pattern);
    return this;
  }
  source(path: string, isDir: boolean): this {
    this.args.push(isDir ? `${path.replace(/\/+$/, '')}/` : path);
    return this;
  }
  destination(host: string, remotePath: string): this {
    this.args.push(`${host}:${remotePath}/`);
    return this;
  }
  build(): string[] {
    return [...this.args, ...this.excludes.flatMap(e => ['--exclude', e])];
  }
}
```

### 3.8. Observer pattern — for audit logging

The MCP server emits events for every tool call. An `AuditLog` observer subscribes and writes to disk. This decouples MCP logic from logging:

```typescript
// src/audit/audit-log.ts
export interface AuditEvent {
  ts: string;
  tool: string;
  args: Record<string, unknown>;
  caller?: string;
  permissionTier: 'readonly' | 'restricted' | 'full';
  result: 'success' | 'denied' | 'error';
  error?: string;
  durationMs: number;
}

export class AuditLog {
  constructor(private dir: string) {}
  async record(event: AuditEvent): Promise<void> {
    const file = path.join(this.dir, `${event.ts.slice(0, 10)}.jsonl`);
    await fs.appendFile(file, JSON.stringify(event) + '\n');
  }
}
```

### 3.9. Dependency injection (constructor injection)

Every class that does I/O takes its dependencies in the constructor. This is the rule for testability — never `import` a singleton inside a class method.

```typescript
// Good
class DeployCommand {
  constructor(
    private readonly ssh: SSHClient,
    private readonly logger: Logger,
    private readonly registry: ProjectRepository,
  ) {}
}

// Bad
class DeployCommand {
  async execute() {
    const ssh = new SSHClient(); // hidden dependency, untestable
  }
}
```

Wire dependencies in `src/cli.ts` (the composition root).

### 3.10. Anti-patterns to avoid

- **God classes.** No class with more than ~150 lines or 8 public methods. Split.
- **Hidden state.** Config is loaded once and passed explicitly. No globals beyond the audit log destination.
- **String types where unions work.** `'pm2' | 'systemd' | 'none'`, never `string` for these.
- **Throwing strings or numbers.** Always `throw new Error(...)` or a custom subclass.
- **Promise.race for timeouts.** Use `AbortSignal.timeout(ms)` (Node 17.3+).
- **Catching errors to swallow them.** Errors propagate to a single top-level handler in `src/cli.ts`.

---

## 4. Tech Stack

| Choice | Rationale |
|---|---|
| **TypeScript** strict, `target: ES2022`, `module: NodeNext` | Type safety, modern JS, ESM modules |
| **Node.js 20+** as runtime requirement | LTS, native fetch, AbortSignal.timeout, glob, structuredClone |
| **tsc** for build (output to `bin/`) | No bundler needed; we ship readable JS |
| **Vitest** for tests | Fast, native TS, ESM-friendly |
| **yaml** (eemeli/yaml) for YAML parsing | Standard, supports YAML 1.2, good error positions |
| **zod** for config validation | Composable schemas, human errors, type inference |
| **@modelcontextprotocol/sdk** for MCP | Official SDK, stdio transport |
| **Biome** for lint + format | 10x faster than ESLint+Prettier, single config |
| **Changesets** for versioning + CHANGELOG | Conventional commits-free, PR-driven changelog |
| **tsx** for dev (`npm run dev`) | Run TS directly without build step |
| **No** bundler (esbuild, rollup, etc.) | We ship Node-native, no need to bundle |
| **No** CLI framework (commander, yargs) | Argv parsing is 50 lines and we want zero magic |

Forbidden direct dependencies:
- `lodash`, `underscore` — use native equivalents
- `chalk` — write 10 lines of ANSI escape codes manually (kept in `src/utils/colors.ts`)
- `axios`, `node-fetch` — use global `fetch`
- `glob`, `fast-glob` — use `node:fs.glob` (Node 22) or manual recursion
- `dotenv` — use `node --env-file` or a 30-line parser

---

## 5. Repository Structure

```
~/shipway/
├── src/
│   ├── cli.ts                          # entry point, argv parser, composition root
│   ├── commands/
│   │   ├── index.ts                    # exports all commands as a record
│   │   ├── types.ts                    # Command interface, CommandContext
│   │   ├── deploy.ts
│   │   ├── status.ts
│   │   ├── logs.ts
│   │   ├── ssh.ts
│   │   ├── exec.ts
│   │   ├── restart.ts
│   │   ├── stop.ts
│   │   ├── start.ts
│   │   ├── open.ts
│   │   ├── link.ts                     # register CWD as a project
│   │   ├── unlink.ts
│   │   ├── ls.ts                       # list all registered projects
│   │   ├── doctor.ts                   # diagnostics
│   │   ├── debug.ts                    # remote debugger tunnel
│   │   ├── tunnel.ts                   # generic SSH tunnel
│   │   ├── diff.ts                     # rsync dry-run with summary
│   │   ├── env.ts                      # remote env management
│   │   ├── mcp.ts                      # launch MCP server
│   │   ├── init-claude.ts              # generate .claude/skills/<project>/SKILL.md
│   │   ├── migrate.ts                  # convert old shipit.json to shipway.yml
│   │   └── help.ts
│   ├── config/
│   │   ├── schema.ts                   # zod schemas
│   │   ├── parser.ts                   # YAML/JSON load + shorthand expansion
│   │   ├── normalize.ts                # expand `host: "user@ip"` → object form
│   │   └── types.ts                    # TypeScript types derived from zod
│   ├── host/
│   │   ├── resolver.ts                 # HostResolver class
│   │   └── gcloud.ts                   # gcloud instances describe wrapper
│   ├── ssh/
│   │   ├── client.ts                   # SSHClient class
│   │   └── args.ts                     # build ssh args (key path, options)
│   ├── rsync/
│   │   ├── builder.ts                  # RsyncArgsBuilder
│   │   ├── runner.ts                   # spawn rsync, parse stats
│   │   └── safety.ts                   # assertSafeRemote, multi-local guard
│   ├── process-managers/
│   │   ├── types.ts
│   │   ├── pm2.ts
│   │   ├── systemd.ts
│   │   ├── none.ts
│   │   └── index.ts                    # factory: by `restart.method`
│   ├── runtimes/
│   │   ├── types.ts
│   │   ├── node.ts                     # --inspect on 9229
│   │   ├── python.ts                   # debugpy on 5678
│   │   ├── ruby.ts                     # rdbg --open
│   │   └── index.ts                    # detect from `start` string
│   ├── registry/
│   │   ├── types.ts
│   │   ├── file-repository.ts          # ~/.shipway/projects.yml
│   │   └── resolver.ts                 # alias → Project or CWD config
│   ├── pipeline/
│   │   ├── deploy-pipeline.ts
│   │   ├── deploy-context.ts
│   │   └── steps/
│   │       ├── build.ts
│   │       ├── sync.ts
│   │       ├── post-sync.ts
│   │       ├── restart.ts
│   │       └── health-check.ts
│   ├── health/
│   │   └── checker.ts                  # HTTP health check with retry/backoff
│   ├── mcp/
│   │   ├── server.ts                   # MCP server entry (stdio transport)
│   │   ├── tools/
│   │   │   ├── list-projects.ts
│   │   │   ├── status.ts
│   │   │   ├── logs.ts
│   │   │   ├── metrics.ts
│   │   │   ├── health-check.ts
│   │   │   ├── restart.ts
│   │   │   ├── deploy.ts
│   │   │   └── exec.ts
│   │   ├── permissions.ts              # tier checks
│   │   └── stdio-safety.ts             # redirect stdout writes to stderr
│   ├── audit/
│   │   ├── audit-log.ts
│   │   └── types.ts
│   ├── errors/
│   │   ├── base.ts                     # ShipwayError abstract
│   │   ├── config-error.ts
│   │   ├── ssh-error.ts
│   │   ├── rsync-error.ts
│   │   ├── deploy-error.ts
│   │   └── exit-codes.ts               # const enum of exit codes
│   ├── logging/
│   │   ├── logger.ts                   # human + json output
│   │   ├── colors.ts                   # ANSI helpers (no chalk)
│   │   └── format.ts                   # timing, step indicators
│   └── utils/
│       ├── exec.ts                     # spawn wrapper with timeout
│       ├── paths.ts                    # tilde expansion, home dir
│       ├── argv.ts                     # parse --flag and --key=value
│       └── atomic-write.ts             # write-then-rename
├── tests/
│   ├── unit/
│   │   ├── config/
│   │   ├── host/
│   │   ├── rsync/
│   │   ├── runtimes/
│   │   └── ...
│   ├── integration/
│   │   ├── deploy-flow.test.ts         # against a mock SSH server
│   │   └── mcp-tools.test.ts
│   └── fixtures/
│       ├── configs/
│       │   ├── deutschepolska.yml      # the real user configs
│       │   ├── blossom.yml
│       │   ├── multi-service.yml
│       │   └── invalid/                # bad configs for error tests
│       └── mock-ssh/
├── bin/                                # output (gitignored)
├── docs/
│   ├── getting-started.md
│   ├── config-reference.md
│   ├── debugging-remote.md
│   ├── ai-agents.md                    # MCP setup guide
│   ├── multi-service.md
│   └── comparison.md                   # vs Kamal, pm2 deploy, custom bash
├── examples/
│   ├── nodejs-pm2/
│   ├── python-systemd/
│   ├── ruby-rails/
│   ├── multi-service/
│   └── static-site/
├── schemas/
│   └── shipway.schema.json             # generated from zod, published to /schemas/
├── .github/
│   └── workflows/
│       ├── ci.yml                      # test + lint on PRs
│       └── release.yml                 # publish on git tag
├── .changeset/
├── package.json
├── tsconfig.json
├── biome.json
├── vitest.config.ts
├── README.md
├── CONTRIBUTING.md
├── CHANGELOG.md
├── LICENSE                             # MIT
├── PLAN.md                             # this file
└── .gitignore
```

---

## 6. Configuration Schema

### 6.1. Top-level schema (zod)

```typescript
// src/config/schema.ts
import { z } from 'zod';

const SyncEntrySchema = z.object({
  local: z.union([z.string(), z.array(z.string())]),
  remote: z.string(),
  exclude: z.array(z.string()).optional(),
  delete: z.boolean().optional(),     // default true
  checksum: z.boolean().optional(),   // default false
});

const HostObjectSchema = z.union([
  z.object({ ssh: z.string() }),
  z.object({ ip: z.string(), user: z.string(), key: z.string().optional() }),
  z.object({ instance: z.string(), zone: z.string(), user: z.string() }),
]);

const HostSchema = z.union([z.string(), HostObjectSchema]);

const RestartSchema = z.object({
  method: z.enum(['pm2', 'systemd', 'none']).default('pm2'),
  name: z.string().optional(),
  start: z.string().optional(),
});

const HealthSchema = z.union([
  z.number().int().positive(),  // shorthand: port number
  z.object({
    url: z.string(),
    expect: z.number().int().default(200),
    retries: z.number().int().default(5),
    delayMs: z.number().int().default(1000),
  }),
]);

const ServiceSchema = z.object({
  build: z.string().optional(),
  sync: z.union([z.string(), SyncEntrySchema, z.array(z.union([z.string(), SyncEntrySchema]))]),
  postSync: z.string().optional(),
  start: z.string().optional(),
  restart: RestartSchema.optional(),
  port: z.number().optional(),
  health: HealthSchema.optional(),
});

// Named `shipway logs <strategy>` source — tail a raw remote file (or run a
// custom command) directly over SSH, bypassing the process manager's buffering.
const LogStrategySchema = z.union([
  z.string(),  // shorthand: remote file path to tail
  z.object({
    file: z.string().optional(),   // remote file to tail (tail -F)
    cmd: z.string().optional(),    // custom command, overrides file
    lines: z.number().int().optional(),  // default backlog (overridden by --lines)
  }),
]);

export const ShipwayConfigSchema = z.object({
  name: z.string().min(1),
  url: z.string().url().optional(),
  host: HostSchema,
  build: z.string().optional(),
  sync: z.union([z.string(), SyncEntrySchema, z.array(z.union([z.string(), SyncEntrySchema]))]).optional(),
  postSync: z.string().optional(),
  start: z.string().optional(),
  restart: RestartSchema.optional(),
  port: z.number().optional(),
  health: HealthSchema.optional(),
  services: z.record(z.string(), ServiceSchema).optional(),
  logs: z.record(z.string(), LogStrategySchema).optional(),  // v0.5.0+
});

export type ShipwayConfig = z.infer<typeof ShipwayConfigSchema>;
```

### 6.2. Shorthand expansion rules

Implemented in `src/config/normalize.ts`. Applied after parsing, before validation.

- `host: "user@ip"` → `{ ssh: "user@ip", ... }`
- `host: "gcp://user@instance.zone"` → `{ instance, zone, user }`
- `sync: "./dist → /remote/path"` (or `->` ASCII) → `{ local: './dist', remote: '/remote/path' }`
- `sync: "./dist → ~/app"` with `~` expanded based on resolved host's home dir
- `port: 5050` → `health: { url: "http://localhost:5050/", expect: 200, retries: 5, delayMs: 1000 }`
- `start: "node x.js"` (without `restart`) → `restart: { method: 'pm2', name: <root name>, start: "node x.js" }`
- `logs: { live: "/tmp/app.log" }` (string shorthand) → `{ live: { file: "/tmp/app.log" } }`
- `restart.name` defaults to `<config.name>` (or `<config.name>-<service>` in multi-service)
- `exclude` always includes the implicit `['.DS_Store', '._*', '.git', 'node_modules']` unless overridden with `exclude: { override: [...] }`

### 6.3. Validation error format

When zod validation fails, produce errors like:

```
✗ Invalid shipway.yml at line 7:
    health.retries: expected number, received string ("five")

  Tip: retries must be an integer like 5, not a string.
```

This requires mapping zod paths back to YAML source positions. Use `yaml` library's `parseDocument` to get position info, then resolve.

---

## 7. Implementation Phases

Each phase has a clear deliverable and acceptance criteria. The agent executing this plan must complete a phase fully before moving on.

### Phase 0 — Scaffolding (1 session)

**Goal:** Empty project that builds, lints, tests, and has CI green.

**Tasks:**
1. `git init ~/shipway`
2. Create `package.json` with name `shipway`, version `0.0.1`, type `module`, bin `{ "shipway": "./bin/cli.js" }`
3. `tsconfig.json` with strict mode, ES2022 target, NodeNext modules, output to `bin/`
4. Install dev deps: `typescript`, `tsx`, `vitest`, `@types/node`, `@biomejs/biome`, `@changesets/cli`
5. Install runtime deps: `yaml`, `zod`, `@modelcontextprotocol/sdk`
6. `biome.json` with default config, semicolons required, double quotes, 100-char line width
7. `vitest.config.ts` with globals enabled
8. `.gitignore` excluding `node_modules`, `bin`, `*.log`, `.DS_Store`
9. Empty `src/cli.ts` with a minimal shebang + `console.log('shipway v0.0.1')`
10. `npm run build && bin/cli.js` outputs the version line
11. GitHub Actions: `.github/workflows/ci.yml` runs `npm ci && npm run build && npm run lint && npm test` on push/PR to main
12. LICENSE = MIT with the user's name
13. Initial README.md with one-paragraph pitch and "🚧 Under construction"
14. CONTRIBUTING.md placeholder
15. Push to github.com/<user>/shipway as a public repo

**Acceptance:** `npm run build && bin/cli.js --version` prints `0.0.1`. CI green on a fresh PR.

### Phase 1 — Config + Core (1-2 sessions)

**Goal:** Parse and validate the two real configs (deutschepolska, blossom).

**Tasks:**
1. Implement `src/config/schema.ts` (zod schemas, see §6.1)
2. Implement `src/config/parser.ts`: load `shipway.yml` or `shipway.json`, parse, return raw object
3. Implement `src/config/normalize.ts`: expand all shorthands (see §6.2)
4. Implement `src/errors/` base classes with exit codes (see §13.2)
5. Implement `src/host/resolver.ts` (Factory pattern, see §3.6)
6. Implement `src/ssh/client.ts` with SSHClient class: `exec(cmd)`, `tunnel(localPort, remoteHost, remotePort)`, key path from `host.key` || env `SHIPWAY_SSH_KEY` || fallback to `~/.ssh/google_compute_engine` || default agent
7. Implement `src/rsync/builder.ts` (Builder pattern, §3.7)
8. Implement `src/rsync/safety.ts` carrying over the shallow-path and multi-local guards from old code
9. Implement `src/process-managers/pm2.ts`, `systemd.ts`, `none.ts` (Adapter pattern, §3.3)
10. Implement `src/pipeline/deploy-pipeline.ts` and concrete steps
11. Implement `src/commands/deploy.ts` and `src/commands/help.ts`
12. Implement `src/cli.ts` composition root: parse argv, load config, dispatch
13. Write unit tests for each module (target: 70% coverage)
14. Write integration test: parse `tests/fixtures/configs/deutschepolska.yml` and assert the normalized config matches the expected canonical form

**Acceptance:**
- `cd ~/deutschepolska && shipway deploy --dry-run` prints the exact same commands the old shipit prints (modulo nicer formatting)
- `cd ~/blossom-landing/blossom-app && shipway deploy --dry-run` likewise
- All unit and integration tests pass

### Phase 2 — Operational commands (1 session)

**Goal:** Round out the basic toolkit.

**Tasks:**
1. `src/commands/status.ts` — pm2 describe + health check
2. `src/commands/logs.ts` — `pm2 logs --raw` with `--follow`, `--lines`, `--since`, `--grep`
3. `src/commands/ssh.ts` — interactive SSH (`spawn ssh ...host... { stdio: 'inherit' }`)
4. `src/commands/exec.ts` — single command in remote dir
5. `src/commands/restart.ts`, `stop.ts`, `start.ts`
6. `src/commands/open.ts` — open the resolved public URL
7. `src/commands/tunnel.ts` — generic SSH tunnel: `shipway tunnel <project> <localPort>[:remotePort]`
8. `src/commands/diff.ts` — rsync dry-run with parsed summary (X added, Y modified, Z deleted)
9. Update help text

**Acceptance:** Every command works against deutschepolska and blossom in real life. `shipway logs blossom --grep error --since 10m` returns recent errors.

### Phase 3 — Multi-project registry (1 session)

**Goal:** Run any command from anywhere using `<alias>`.

**Tasks:**
1. `src/registry/file-repository.ts` — read/write `~/.shipway/projects.yml`, atomic write
2. `src/commands/link.ts` — register CWD; alias from config.name or arg
3. `src/commands/unlink.ts`
4. `src/commands/ls.ts` — table output: alias, host, status, last deploy, URL
5. Extend `src/cli.ts`: when first positional arg matches a registered alias, `cd` to its path and load that project's config
6. Multi-status: `shipway status` (no args) iterates all registered projects in parallel
7. `shipway --json` flag for machine-readable output across all commands

**Acceptance:** From `~`, `shipway deploy blossom` and `shipway status` (showing both projects) both work.

### Phase 4 — Cross-runtime remote debugger (1-2 sessions)

**Goal:** `shipway debug <alias>` works for Node. Python and Ruby strategies are scaffolded but can be stubbed if they need real environments to test.

**Tasks:**
1. `src/runtimes/types.ts` (Strategy pattern, §3.2)
2. `src/runtimes/node.ts`:
   - `enableDebug`: stop the pm2 process, restart with `pm2 start <command> --name <name> --node-args="--inspect=127.0.0.1:9229"`
   - `disableDebug`: restart pm2 without the node-args (need to remember the original command — store it on enableDebug start)
   - `generateLaunchJson`: returns the VS Code config snippet
3. `src/runtimes/python.ts`:
   - Detects `python` or `python3` in `start`
   - `enableDebug` wraps the start command: `python -m debugpy --listen 127.0.0.1:5678 --wait-for-client <original>`
   - Generates debugpy launch.json
4. `src/runtimes/ruby.ts`:
   - Detects `bundle exec`, `rails`, `puma`, `unicorn`, `ruby`
   - `enableDebug` prepends `RUBY_DEBUG_OPEN=true` to the start command and configures port
   - Generates rdbg launch.json
5. `src/runtimes/index.ts` — detector
6. `src/commands/debug.ts`:
   - Detect runtime; refuse with friendly error if unknown
   - Call `enableDebug` on the strategy
   - Open SSH tunnel (`ssh -L <port>:127.0.0.1:<port> -N <host>`)
   - Print the launch.json to stdout
   - Wait for Ctrl-C (`process.on('SIGINT')`)
   - On exit: cleanup — disable debug, close tunnel. Show the manual cleanup command in case the handler is killed too.
7. **Critical safety**: register cleanup handler immediately after enableDebug; if Ctrl-C arrives before cleanup runs, log a `EMERGENCY: run 'shipway restart <alias>' to revert` line to stderr.

**Acceptance:** Against a real running Node service, `shipway debug deutschepolska` opens the tunnel, VS Code attaches successfully to a breakpoint, Ctrl-C cleans up correctly, the service responds normally afterward.

### Phase 5 — Multi-service (1 session)

**Goal:** Deploy multiple processes per project from one config.

**Tasks:**
1. Update `src/config/schema.ts` to accept the `services` map (already in §6.1)
2. Update `src/config/normalize.ts`: when `services` is present, the root-level deploy fields apply as defaults for each service
3. Update commands to accept optional service argument: `shipway logs <alias> [<service>]`
4. pm2 names become `<config.name>-<serviceKey>` automatically (override-able with `services.<key>.restart.name`)
5. Default behavior of `shipway deploy <alias>` with no service: deploy all services in declaration order. With `<service>`: deploy just that one.

**Acceptance:** Convert a test fixture to multi-service shape, deploy both, verify both processes run under correct pm2 names.

### Phase 6 — MCP server (2-3 sessions, **the strategic feature**)

**Goal:** `shipway mcp` exposes a stdio MCP server with three permission tiers and audit logging. Following BrainBank's stdio-only pattern.

**Tasks:**
1. `src/mcp/stdio-safety.ts`: monkey-patch `console.log` and `process.stdout.write` to redirect to stderr for the duration of the MCP server's life. **Critical**: the stdio MCP transport requires that no library prints to stdout, ever, or the JSON-RPC frame is corrupted.

2. `src/mcp/server.ts`: instantiate `Server` from `@modelcontextprotocol/sdk`, attach `StdioServerTransport`, register tool handlers. Read permission tier from argv (`--readonly` default, `--restricted`, `--full`).

3. `src/audit/audit-log.ts` (Observer pattern, §3.8). Default audit dir: `~/.shipway/audit/`. File per day: `YYYY-MM-DD.jsonl`.

4. `src/mcp/permissions.ts`: define which tools are allowed in which tier:
   ```typescript
   const TIER_TOOLS = {
     readonly: ['shipway_list_projects', 'shipway_status', 'shipway_logs', 'shipway_metrics', 'shipway_health_check'],
     restricted: [...TIER_TOOLS.readonly, 'shipway_restart', 'shipway_deploy', 'shipway_rollback'],
     full: [...TIER_TOOLS.restricted, 'shipway_exec', 'shipway_env_set'],
   };
   ```

5. Implement each tool in `src/mcp/tools/<tool>.ts`. Each tool:
   - Has a zod input schema
   - Returns a structured result
   - Calls the same internal commands as the CLI (don't duplicate logic)
   - Records audit entry before AND after execution (so denied attempts are visible)

6. Update `src/commands/mcp.ts`:
   ```bash
   shipway mcp                  # readonly (default, safest)
   shipway mcp --restricted     # +restart, deploy, rollback
   shipway mcp --full           # +arbitrary exec (requires explicit confirmation per call)
   ```

7. Document MCP integration in `docs/ai-agents.md`:
   - Example `claude_desktop_config.json` entry
   - Example `.mcp.json` for Claude Code
   - Cursor and Antigravity equivalents
   - Recommended starting tier: readonly

**Acceptance:**
- `shipway mcp` starts cleanly, accepts `tools/list` JSON-RPC, returns the 5 readonly tools.
- Connect Claude Desktop, ask "What's the status of all my services?" → Claude calls `shipway_status` for each, returns synthesized view.
- Attempting `shipway_deploy` in readonly returns an error with the upgrade instruction.
- Audit log accumulates entries with correct caller, tool, args, result.

### Phase 7 — AI integration helpers (1 session)

**Goal:** `shipway init-claude` generates a Claude Code skill per project.

**Tasks:**
1. `src/commands/init-claude.ts`:
   - Detect if CWD is inside a project with `shipway.yml`
   - Generate `.claude/skills/<alias>/SKILL.md` with the template from §7.1
   - Include frontmatter (`name`, `description`)
   - Populate sections from the config: services list, host, URLs, ports, commands

2. Skill template:
   ```markdown
   ---
   name: shipway-<alias>
   description: Deploy, debug, and inspect <project name> running on <host>
   ---

   # <Project Name> — Deployment Context

   This project is managed by `shipway`. It deploys to `<host>` and runs under pm2.

   ## Services
   - **<service>**: `<start command>`, pm2 name `<pm2 name>`, port <port>

   ## Common operations
   - Status: `shipway status <alias>`
   - Logs: `shipway logs <alias>` (add `-f` to follow, `--grep <term>` to filter)
   - Restart: `shipway restart <alias>`
   - Deploy: `shipway deploy <alias>`
   - Debug: `shipway debug <alias>` (opens a tunneled debugger session)

   ## Troubleshooting
   - 502 response → process likely crashed; run `shipway logs <alias> --since 5m`
   - Slow deploys → check `shipway exec <alias> "df -h"` for disk space
   - Auth failures → verify SSH key path in shipway.yml or `SHIPWAY_SSH_KEY`
   ```

3. Auto-regenerate skill on every `shipway deploy` if `.claude/skills/<alias>/` already exists.

**Acceptance:** Run `shipway init-claude` in deutschepolska; resulting skill loads correctly in Claude Code; asking Claude "how do I see recent errors" returns the right command.

### Phase 8 — Polish, docs, publish (1-2 sessions)

**Goal:** Public release. v0.1.0 on npm. README that converts.

**Tasks:**
1. Write `docs/getting-started.md` — 5-minute install + first deploy walkthrough
2. Write `docs/config-reference.md` — every field documented
3. Write `docs/debugging-remote.md` — debug flow per runtime
4. Write `docs/ai-agents.md` — MCP setup
5. Write `docs/multi-service.md`
6. Write `docs/comparison.md` — table vs Kamal, pm2 deploy, Capistrano, bash scripts
7. Rewrite README:
   - Headline: "Deploy Node, Python, and Ruby apps over SSH. Seven lines of YAML. No Docker."
   - Quick example (the deutschepolska config)
   - Install: `npm i -g shipway`
   - Three-step quickstart
   - Comparison table
   - Link to docs
8. Publish JSON schema to `schemas/shipway.schema.json`. Document VS Code YAML extension setup for autocomplete.
9. Generate examples in `examples/` that actually work (use real test hosts or document expectations)
10. Set up `release.yml` GitHub Action: on git tag push, build, run tests, publish to npm with `--provenance`
11. Use Changesets for the version bump + changelog entry
12. `npm publish` for v0.1.0
13. Announce: dev.to post, brief HN Show, /r/node, X thread

**Acceptance:** `npx shipway --help` works on a fresh machine. README's quickstart works end-to-end for a new user.

---

## 8. MCP Server Architecture (detailed)

### 8.1. Transport — stdio only, mirrors BrainBank

Following the user's existing pattern in `~/brainbank/src/mcp/mcp-server.ts`. Use `StdioServerTransport`. HTTP+SSE transport is explicitly out of scope for v1. Reason: stdio covers Claude Desktop, Claude Code, Cursor, Antigravity, and every other current MCP client. Adding HTTP+SSE doubles surface area for no current user benefit.

### 8.2. Stdout-safety pattern

The `@modelcontextprotocol/sdk` requires stdout to be exclusively JSON-RPC frames. Anything else corrupts the protocol. Implementation:

```typescript
// src/mcp/stdio-safety.ts
export function redirectStdoutToStderr(): () => void {
  const originalWrite = process.stdout.write.bind(process.stdout);
  const originalLog = console.log;
  process.stdout.write = ((chunk: any, ...args: any[]) => {
    return process.stderr.write(chunk, ...args);
  }) as any;
  console.log = (...args) => console.error(...args);
  return () => {
    process.stdout.write = originalWrite;
    console.log = originalLog;
  };
}
```

This is called as the very first thing in `src/commands/mcp.ts`. The MCP SDK's own stdio transport bypasses these wrappers (writes directly via the transport object), so JSON-RPC frames still go to stdout correctly.

### 8.3. Tool catalog

| Tool | Tier | Purpose |
|---|---|---|
| `shipway_list_projects` | readonly | Return all registered projects with metadata |
| `shipway_status` | readonly | Get health code, pm2 status, last deploy time |
| `shipway_logs` | readonly | Fetch logs with optional filters |
| `shipway_metrics` | readonly | Disk, memory, CPU on the host |
| `shipway_health_check` | readonly | One-off health URL check |
| `shipway_restart` | restricted | Restart a service |
| `shipway_deploy` | restricted | Full deploy pipeline |
| `shipway_rollback` | restricted | Roll back to previous release |
| `shipway_exec` | full | Run arbitrary command on remote |
| `shipway_env_set` | full | Set environment variable in remote .env |

Each tool's input schema is a zod schema converted to JSON schema (use `zod-to-json-schema`). The tool name is its export name. Tool descriptions are written for AI agents — describe when to use the tool, not just what it does.

### 8.4. Audit log schema

```typescript
interface AuditEvent {
  ts: string;              // ISO 8601
  tool: string;            // e.g. "shipway_status"
  args: Record<string, unknown>;
  caller?: string;         // from MCP request meta if available
  tier: 'readonly' | 'restricted' | 'full';
  result: 'success' | 'denied' | 'error';
  error?: string;          // message if result !== success
  durationMs: number;
}
```

One JSONL file per day at `~/.shipway/audit/YYYY-MM-DD.jsonl`. Future feature: `shipway audit --tail`, `shipway audit --grep`.

### 8.5. Permission denial UX

When a tool is called outside its tier:

```json
{
  "isError": true,
  "content": [{
    "type": "text",
    "text": "Permission denied: shipway_deploy requires --restricted or --full tier. Current tier: readonly.\n\nRestart the MCP server with:\n  shipway mcp --restricted\n\nOr from claude_desktop_config.json, update the args to include \"--restricted\"."
  }]
}
```

Always actionable. Never just "denied".

---

## 9. Remote Debugging (detailed)

See research notes in PLAN.md predecessor / chat history. Implementation summary per runtime:

### 9.1. Node.js

- **Debug port:** 9229 (Node default)
- **Enable flow:**
  1. Read current pm2 config for the process: `pm2 describe <name>` → parse command + args
  2. Stop process: `pm2 stop <name>`
  3. Restart with inspect: `pm2 start <command> --name <name> --node-args="--inspect=127.0.0.1:9229" --cwd <remote_dir>` (preserve env)
  4. Verify `--inspect` is binding to 127.0.0.1 only (never expose 9229 publicly)
- **Tunnel:** `ssh -L 9229:127.0.0.1:9229 -N <user>@<host>`
- **Cleanup:** restart pm2 without `--node-args`
- **VS Code launch.json:**
  ```json
  {
    "type": "node",
    "request": "attach",
    "name": "shipway: <alias>",
    "address": "localhost",
    "port": 9229,
    "localRoot": "${workspaceFolder}",
    "remoteRoot": "<remote sync target>",
    "skipFiles": ["<node_internals>/**"]
  }
  ```

### 9.2. Python

- **Debug port:** 5678 (debugpy default)
- **Prerequisite:** `debugpy` installed on the remote in the same env as the app (`pip install debugpy`). `shipway doctor` should check this.
- **Enable flow:** wrap the start command so it launches under debugpy:
  - Original: `python app.py`
  - Wrapped: `python -m debugpy --listen 127.0.0.1:5678 --wait-for-client app.py`
- **Tunnel:** `ssh -L 5678:127.0.0.1:5678 -N <user>@<host>`
- **Cleanup:** restart without the wrapper
- **VS Code launch.json:**
  ```json
  {
    "type": "debugpy",
    "request": "attach",
    "name": "shipway: <alias>",
    "connect": { "host": "localhost", "port": 5678 },
    "pathMappings": [{ "localRoot": "${workspaceFolder}", "remoteRoot": "<remote sync target>" }]
  }
  ```

### 9.3. Ruby

- **Debug port:** 12345 (chosen, not a default — Ruby's default is UNIX socket)
- **Prerequisite:** Ruby 3.1+ ships `debug` gem natively; older Rubies need `gem install debug` and `gem 'debug'` in Gemfile.
- **Enable flow:** restart process with env `RUBY_DEBUG_OPEN=true RUBY_DEBUG_PORT=12345 RUBY_DEBUG_HOST=127.0.0.1`
- **Tunnel:** `ssh -L 12345:127.0.0.1:12345 -N <user>@<host>`
- **Cleanup:** restart without those env vars
- **VS Code launch.json (requires `vscode-rdbg` extension):**
  ```json
  {
    "type": "rdbg",
    "request": "attach",
    "name": "shipway: <alias>",
    "debugPort": "localhost:12345",
    "localfs": true,
    "localfsMap": "<remote sync target>:${workspaceFolder}"
  }
  ```

### 9.4. Common debug command flow

```typescript
// src/commands/debug.ts (skeleton)
async execute(ctx: CommandContext): Promise<number> {
  const strategy = detectRuntime(ctx.config);
  if (!strategy) {
    ctx.logger.error('Unknown runtime. Supported: Node, Python, Ruby.');
    return ExitCode.UNSUPPORTED;
  }

  const cleanup = registerCleanup(async () => {
    await strategy.disableDebug(ctx.ssh, pm2Name);
  });

  ctx.logger.info(`Detected runtime: ${strategy.name}`);
  await strategy.enableDebug(ctx.ssh, pm2Name, strategy.defaultDebugPort);
  ctx.logger.success('Debugger enabled on remote');

  const tunnel = await ctx.ssh.tunnel(strategy.defaultDebugPort, '127.0.0.1', strategy.defaultDebugPort);
  ctx.logger.success(`Tunnel open: localhost:${strategy.defaultDebugPort}`);

  const launchJson = strategy.generateLaunchJson({ ... });
  ctx.logger.info('Add to your .vscode/launch.json:');
  console.log(JSON.stringify(launchJson, null, 2));

  ctx.logger.info('Press Ctrl-C to close tunnel and revert process.');
  await waitForSignal('SIGINT');

  await cleanup();
  await tunnel.close();
  return ExitCode.OK;
}
```

The `registerCleanup` utility installs handlers for `SIGINT`, `SIGTERM`, and `uncaughtException`. If cleanup fails, the error message includes the manual command: `shipway restart <alias>`.

---

## 10. Testing Strategy

### 10.1. Test pyramid

- **Unit tests (60%):** Pure functions, no I/O. Config parsing, normalization, rsync arg building, runtime detection, host string parsing. These should run in <2 seconds for the whole suite.
- **Integration tests (30%):** Module boundaries. Deploy pipeline against a mocked SSHClient + mocked rsync. MCP server with stdio mocked. Goal: catch wiring bugs without real network.
- **End-to-end tests (10%):** Against a real test VM. Only run on `npm run test:e2e` (not in CI by default). Document how to set up the test VM in `tests/e2e/README.md`.

### 10.2. Real config fixtures

Both real configs (deutschepolska, blossom) live in `tests/fixtures/configs/`. They are the canary: if a refactor breaks them, the build fails. Each has an adjacent `.expected.json` showing the normalized form.

### 10.3. Mock SSH server

For integration tests, ship a tiny mock SSH server (or use a stub with method assertions). Don't use real SSH in CI.

### 10.4. Coverage target

70% line coverage on `src/`, enforced in CI. Generated via `vitest --coverage`.

---

## 11. Documentation

### 11.1. README.md structure

1. Headline + one-sentence pitch
2. Animated GIF or asciinema cast of a deploy (optional but high-impact)
3. Install (`npm i -g shipway`)
4. The 7-line config example
5. Three-command quickstart (`link`, `deploy`, `status`)
6. Feature highlights (5 bullets max)
7. Comparison table with Kamal, pm2 deploy, custom bash
8. Link to docs site or `docs/` directory
9. Contributing + License footer

### 11.2. Required docs files

- `docs/getting-started.md` — install + first deploy
- `docs/config-reference.md` — every field
- `docs/debugging-remote.md` — `shipway debug` flow per runtime
- `docs/ai-agents.md` — MCP setup, security considerations, audit log
- `docs/multi-service.md` — services map
- `docs/comparison.md` — honest comparison vs alternatives

### 11.3. Doc style

- Imperative voice, second person ("Run `shipway link`"). No "we" or "let's".
- Code blocks are runnable as written. No `<your-host>` without explanation.
- Every "do X" is followed by what success looks like ("you should see `✓ Linked: blossom`").
- Examples use the two real configs (with names obfuscated to `my-app`, `my-worker`).

---

## 12. Release Process

### 12.1. Versioning

- Pre-1.0: 0.MINOR.PATCH. Minor bumps for breaking changes (acceptable in 0.x), patch for fixes.
- 1.0: feature-complete, stable config schema. Don't rush to 1.0; better to ship 0.5.x for months than break users.

### 12.2. Changesets workflow

1. Every PR that's user-visible includes a changeset file (`pnpm changeset` or `npx changeset`)
2. Changesets accumulate in `.changeset/` between releases
3. On main: `npx changeset version` bumps `package.json` and writes `CHANGELOG.md`
4. Tag the version commit: `git tag v0.1.0 && git push --tags`
5. GitHub Action `release.yml` triggers on tag, publishes to npm with `--provenance`

### 12.3. release.yml outline

```yaml
on:
  push:
    tags: ['v*']
jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write   # for npm provenance
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', registry-url: 'https://registry.npmjs.org' }
      - run: npm ci
      - run: npm run build
      - run: npm test
      - run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### 12.4. Pre-publish checklist

- All tests passing
- `npm run lint` clean
- `npm pack --dry-run` shows only expected files (use `files` field in package.json to whitelist)
- README updated if user-visible changes
- CHANGELOG updated via changesets
- Example configs in `examples/` still parse
- JSON schema regenerated

---

## 13. Code Quality Standards

### 13.1. TypeScript rules

- `strict: true` always. No `any` except at I/O boundaries with a comment explaining why.
- Prefer `readonly` for class fields and `as const` for literal arrays/objects.
- Prefer union types over enums (`type Method = 'pm2' | 'systemd' | 'none'`)
- Discriminated unions for variant types (e.g. host config)
- `unknown` for caught errors; narrow before use
- Async functions always; no callback-style APIs

### 13.2. Error handling

Custom error classes per category. Each carries an exit code:

```typescript
// src/errors/exit-codes.ts
export const ExitCode = {
  OK: 0,
  GENERAL: 1,
  CONFIG: 10,
  BUILD: 20,
  SYNC: 30,
  RESTART: 40,
  HEALTH: 50,
  SSH: 60,
  UNSUPPORTED: 70,
} as const;

// src/errors/base.ts
export abstract class ShipwayError extends Error {
  abstract readonly exitCode: number;
  abstract readonly category: string;
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = this.constructor.name;
  }
}

// src/errors/config-error.ts
export class ConfigError extends ShipwayError {
  readonly exitCode = ExitCode.CONFIG;
  readonly category = 'config';
  constructor(public readonly field: string, message: string) {
    super(`Invalid config at "${field}": ${message}`);
  }
}
```

Top-level handler in `src/cli.ts`:

```typescript
try {
  const exitCode = await router.dispatch(argv);
  process.exit(exitCode);
} catch (e) {
  if (e instanceof ShipwayError) {
    logger.error(e.message);
    if (e.cause) logger.debug(String(e.cause));
    process.exit(e.exitCode);
  }
  logger.error('Unexpected error: ' + String(e));
  if (e instanceof Error && e.stack) logger.debug(e.stack);
  process.exit(ExitCode.GENERAL);
}
```

### 13.3. Logging

- Default log output: human-readable with ANSI colors and timing indicators
- `--json` flag → newline-delimited JSON events for CI consumption
- `--quiet` → only errors and final status line
- `--ci` → equivalent to `--json --no-color --quiet=false`
- Never log secrets. The `Logger` class has a `redact(value: string)` helper that masks anything matching common secret patterns (long hex, base64-looking blobs, `Bearer`, `password=`).

### 13.4. File and function size limits

- Files: target <200 lines. Split if exceeded.
- Functions: target <40 lines. If longer, refactor into helpers.
- Classes: <8 public methods. Compose, don't expand.

### 13.5. Naming

- Files: `kebab-case.ts`
- Classes: `PascalCase`
- Functions, variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE` only for module-level true constants
- Types: `PascalCase`, no `I` prefix on interfaces

---

## 14. Decision Log

Decisions already made; the executing agent must not re-litigate without strong cause.

1. **Name:** `shipway`. Verified available on npm 2026-05-21. No backwards compat with old `shipit` name.
2. **Config format:** YAML primary, JSON accepted. Filename: `shipway.yml`.
3. **Old `shipit.json` compat:** No automatic loading. Provide `shipway migrate` for one-time conversion.
4. **MCP transport:** stdio only for v1. Mirrors BrainBank's pattern.
5. **Dependencies:** Accept `yaml`, `zod`, `@modelcontextprotocol/sdk`. Drop the zero-deps constraint.
6. **Process managers:** pm2 default, systemd supported, none for static. No native daemonization.
7. **Container support:** No. Out of scope. Use Kamal if you want Docker.
8. **License:** MIT.
9. **Min Node version:** 20 LTS.
10. **Module system:** ESM (`"type": "module"` in package.json).
11. **TypeScript:** strict, ES2022, NodeNext.
12. **Test framework:** Vitest.
13. **Lint/format:** Biome (not ESLint+Prettier).
14. **First public version:** 0.1.0. Don't ship 1.0 until config schema is stable.
15. **Audit log location:** `~/.shipway/audit/YYYY-MM-DD.jsonl`. JSONL is non-negotiable for grep-ability.
16. **Default MCP tier:** readonly. Explicit upgrade required.

---

## 15. Open Questions (decide during implementation)

These don't block starting. Note them and decide when relevant.

1. **Hooks API:** support `hooks.before.deploy`, `hooks.after.health` shell commands? Defer to v0.2.
2. **Secret management:** integrate with `age` / `sops`? Defer; document the manual pattern in `docs/`.
3. **Rollback mechanism:** keep N previous releases on the remote like Capistrano (`releases/<timestamp>/`)? Probably yes by v0.3; not in v0.1.
4. **Watch mode** (`shipway watch` rebuilds + redeploys on file change): nice-to-have, defer.
5. **HTTP+SSE MCP transport:** defer until a user asks for it.
6. **Multi-host per service** (HA): out of scope for solo VPS users. Document explicitly.
7. **Bun runtime support:** detect `bun ` in `start`, use same debug pattern as Node? Yes if it's <50 lines of additional code; otherwise defer.

---

## 16. First Task for the Executing Agent

Start with Phase 0. The first concrete actions:

1. `mkdir -p ~/shipway && cd ~/shipway`
2. `git init`
3. `npm init -y`
4. Edit `package.json` to:
   ```json
   {
     "name": "shipway",
     "version": "0.0.1",
     "type": "module",
     "bin": { "shipway": "./bin/cli.js" },
     "files": ["bin", "schemas", "README.md", "LICENSE"],
     "engines": { "node": ">=20" },
     "scripts": {
       "build": "tsc",
       "dev": "tsx src/cli.ts",
       "test": "vitest run",
       "test:watch": "vitest",
       "lint": "biome check .",
       "format": "biome format --write ."
     },
     "license": "MIT"
   }
   ```
5. `npm i -D typescript tsx vitest @types/node @biomejs/biome @changesets/cli`
6. `npm i yaml zod @modelcontextprotocol/sdk`
7. Create `tsconfig.json`, `biome.json`, `vitest.config.ts`, `.gitignore`
8. Create `src/cli.ts` with shebang `#!/usr/bin/env node` and a single `console.log` printing version + help stub
9. `npm run build && node bin/cli.js` → must print version
10. Commit: `chore: initial scaffold`
11. Push to GitHub. Verify CI is green.

Then proceed to Phase 1.

**Do not write any feature code in Phase 0.** The phase exists so the scaffold is solid and the CI loop is closed before any logic lands.

---

## 17. Reference Files in the User's Existing Codebase

When the executing agent needs to understand patterns or carry over logic:

- `~/shipit/src/index.ts` — the old monolith. Read once. Carry forward only the safety patterns (§1.1) and the rough pipeline order.
- `~/shipit/AGENTS.md` — old project doc. Useful for understanding intent.
- `~/deutschepolska/shipit.json` — real config #1. Convert to YAML for fixtures.
- `~/blossom-landing/blossom-app/shipit.json` — real config #2. Convert to YAML for fixtures.
- `~/brainbank/src/mcp/mcp-server.ts` — reference for stdio MCP setup.
- `~/brainbank/src/mcp/workspace-pool.ts` — reference for resource pooling pattern (may be useful for SSH connection pooling later).
- `~/brainbank/src/mcp/workspace-factory.ts` — reference for stdout-safety redirect.

---

## 18. Done Definition for v0.1.0

The release is ready when all of these are true:

- [ ] All 8 phases complete
- [ ] Both real configs (deutschepolska, blossom) deploy end-to-end through `shipway deploy <alias>`
- [ ] `shipway debug deutschepolska` opens a working Node debugger tunnel
- [ ] `shipway mcp` registered in Claude Desktop returns sensible answers to "what's the status of my services"
- [ ] README quickstart works for a new user with no prior knowledge of shipway
- [ ] CI green on main
- [ ] `npm install -g shipway@0.1.0` works on a fresh machine
- [ ] Audit log has entries from at least one Claude session
- [ ] License, Contributing, Code of Conduct files present
- [ ] First GitHub issue template added
- [ ] At least 5 examples in `examples/` parse cleanly

Once all check, tag `v0.1.0` and publish. Then write the announcement.
