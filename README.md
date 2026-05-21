# ⚓ Shipway

**Deploy apps over SSH.** Build locally, sync via rsync, restart with pm2 or systemd, health-check — all from a 7-line YAML config.

Shipway is a CLI for shipping Node.js, Python, and Ruby apps to a VPS without Docker. It targets the sweet spot where containers are overkill: single-server deployments, small teams, apps managed by pm2 or systemd.

- **7-line config** — most projects deploy with just `name`, `host`, `build`, `sync`, `start`, `port`
- **Multi-service** — deploy API + worker + dashboard in one `shipway.yml`
- **Safe by default** — shallow-path delete protection, multi-local guards, dry-run mode
- **Registry** — `shipway link` once, then `shipway deploy myapp` from anywhere
- **MCP server** — AI agents can inspect and manage production via the Model Context Protocol
- **Zero cloud lock-in** — pure SSH, works with any VPS, any provider

---

## Table of Contents

- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)
  - [Minimal Config](#minimal-config)
  - [Full Reference](#full-reference)
  - [Host Formats](#host-formats)
  - [remoteDir](#remotedir)
  - [Sync Formats](#sync-formats)
  - [Multi-Service](#multi-service)
- [Commands](#commands)
  - [Deploy](#deploy)
  - [Operations](#operations)
  - [Project Management](#project-management)
  - [Advanced](#advanced)
- [Deploy Pipeline](#deploy-pipeline)
- [Process Managers](#process-managers)
- [Safety Guards](#safety-guards)
- [Project Registry](#project-registry)
- [Migrating from shipit](#migrating-from-shipit)
- [Project Structure](#project-structure)
- [Design Patterns](#design-patterns)
- [Testing](#testing)
- [Environment Variables](#environment-variables)
- [Examples](#examples)
- [Contributing](#contributing)
- [License](#license)

---

## Quick Start

```bash
# Install globally
npm i -g shipway

# Create a config in your project
cat > shipway.yml << 'EOF'
name: my-app
host: deploy@192.168.1.100
build: npm run build
sync: ./dist → ~/my-app
start: node server.js
port: 3000
EOF

# Ship it
shipway deploy
```

That's it. Shipway will:

1. Run `npm run build` locally
2. `rsync` the `./dist` directory to `~/my-app` on the server
3. Start (or restart) the app via pm2
4. Health-check `http://localhost:3000/` on the server

---

## Installation

```bash
npm i -g shipway
```

### Prerequisites

| Requirement | Why |
|-------------|-----|
| **Node.js 20+** | Runtime (native `fetch`, `AbortSignal.timeout`) |
| **rsync** | File sync (pre-installed on macOS and most Linux) |
| **ssh** | Remote access (pre-installed everywhere) |
| **pm2** (on server) | Process management (optional — systemd also supported) |

### Verify

```bash
shipway --version   # 0.0.1
shipway doctor      # checks all dependencies
```

---

## Configuration

### Minimal Config

A typical Node.js app deploys with 7 lines:

```yaml
# shipway.yml
name: my-api
host: deploy@10.0.0.5
remoteDir: ~/my-api
build: npm run build
sync: ./dist
postSync: npm install --omit=dev
start: node server.js
port: 3000
```

### Full Reference

Every field and its default:

```yaml
# shipway.yml — full reference
name: my-app                    # required — pm2 name, log prefix

url: https://my-app.com         # optional — public URL (used by `shipway open`)

host: deploy@10.0.0.5           # required — see "Host Formats" below

remoteDir: ~/my-app              # optional — see "remoteDir" below
                                 # sets default remote for sync, cd for postSync, cwd for pm2

build: npm run build             # optional — local shell command (supports && ||)

sync:                            # optional — rsync entries (see "Sync Formats")
  - local: ./dist
    remote: ~/my-app             # defaults to remoteDir if omitted
    exclude: [data, logs]        # default: [.DS_Store, .git, node_modules, ._*]
    delete: true                 # default: true (--delete flag)
    checksum: false              # default: false (--checksum flag)

postSync: npm install --omit=dev # optional — auto-prefixed with `cd remoteDir &&`

start: node server.js           # optional — pm2 uses remoteDir as cwd

restart:                         # optional — explicit process manager config
  method: pm2                    # pm2 | systemd | none
  name: my-app                  # override pm2/systemd name
  start: node server.js         # start command

port: 3000                       # optional — auto-generates health check

health:                          # optional — explicit health check config
  url: http://localhost:3000/
  expect: 200                    # expected HTTP status
  retries: 5                     # retry attempts
  delayMs: 1000                  # delay between retries

exclude:                         # global rsync excludes (applied to all sync entries)
  - .DS_Store
  - .git
  - node_modules
  - ._*

services:                        # optional — multi-service config (see below)
  api:
    build: npm run build:api
    sync: ./dist/api → ~/my-app/api
    start: node api/server.js
    port: 4001
  worker:
    sync: ./dist/worker → ~/my-app/worker
    start: node worker/index.js
```

### Host Formats

Three ways to specify the target server:

```yaml
# 1. String shorthand (most common)
host: deploy@10.0.0.5

# 2. SSH object with explicit key
host:
  ssh: deploy@10.0.0.5
  key: ~/.ssh/my_deploy_key

# 3. IP object
host:
  ip: 10.0.0.5
  user: deploy
  key: ~/.ssh/my_deploy_key     # optional
```

> **Key resolution order:** config `key` field → `SHIPWAY_SSH_KEY` env var → system ssh-agent

### remoteDir

Set `remoteDir` to avoid repeating the remote path everywhere. It affects three things:

| What | Without `remoteDir` | With `remoteDir: ~/my-app` |
|------|--------------------|-----------------------------|
| **sync** | `sync: ./dist → ~/my-app` | `sync: ./dist` (remote defaults to `~/my-app`) |
| **postSync** | `postSync: cd ~/my-app && npm install` | `postSync: npm install` (auto-prefixed) |
| **pm2 cwd** | inferred from first sync entry | `~/my-app` |

Before:

```yaml
sync:
  local: ./dist
  remote: /home/deploy/my-app
postSync: cd /home/deploy/my-app && npm install --omit=dev
```

After:

```yaml
remoteDir: ~/my-app
sync: ./dist
postSync: npm install --omit=dev
```

> If a sync entry already has an explicit `remote`, it takes precedence over `remoteDir`.
> If `postSync` already starts with `cd `, it won't be double-prefixed.

### Sync Formats

Sync supports multiple shorthand formats:

```yaml
# 1. Arrow shorthand (simplest)
sync: ./dist → ~/my-app

# 2. Object form (full control)
sync:
  local: ./dist
  remote: ~/my-app
  delete: true
  checksum: true
  exclude: [data]

# 3. Array of entries (multiple sync targets)
sync:
  - { local: ./build, remote: ~/app/build, checksum: true }
  - { local: [./public, ./package.json], remote: ~/app, delete: false }

# 4. Multi-local (multiple sources → one remote)
sync:
  local: [./public, ./package.json, ./package-lock.json]
  remote: ~/app
  delete: false    # ⚠️ auto-disabled when multiple locals target same remote
```

### Multi-Service

Deploy multiple services from one config. Each service inherits the root config and can override any field:

```yaml
name: taskforge
host: deploy@10.0.0.5
exclude: [.git, node_modules]

services:
  api:
    sync: . → ~/taskforge
    start: node api/server.js
    port: 4001

  worker:
    sync: . → ~/taskforge
    start: node worker/worker.js

  dashboard:
    sync: . → ~/taskforge
    start: node dashboard/server.js
    port: 4000
```

Each service gets its own pm2 process: `taskforge-api`, `taskforge-worker`, `taskforge-dashboard`.

---

## Commands

### Deploy

| Command | Description |
|---------|-------------|
| `shipway deploy` | Full pipeline: build → sync → restart → health check |
| `shipway deploy --dry-run` | Preview everything without executing |
| `shipway deploy -n` | Short flag for `--dry-run` |

### Operations

| Command | Description |
|---------|-------------|
| `shipway status` | Show pm2 status + health check |
| `shipway logs` | Tail remote logs (default: 50 lines) |
| `shipway logs --lines 100` | Last 100 lines |
| `shipway logs --follow` | Stream logs in real-time |
| `shipway logs --grep error` | Filter logs by pattern |
| `shipway restart` | Restart the remote service |
| `shipway stop` | Stop the remote service |
| `shipway start` | Start the remote service |
| `shipway exec -- ls -la` | Run a command on the remote host |
| `shipway ssh` | Open interactive SSH session |
| `shipway open` | Open the deployed URL in browser |

### Project Management

| Command | Description |
|---------|-------------|
| `shipway link` | Register CWD as a project (uses `name` from config) |
| `shipway link my-alias` | Register with a custom alias |
| `shipway unlink my-alias` | Remove a registered project |
| `shipway ls` | List all registered projects |

### Advanced

| Command | Description |
|---------|-------------|
| `shipway migrate` | Convert `shipit.json` → `shipway.yml` |
| `shipway doctor` | Check system dependencies (ssh, rsync, pm2) |
| `shipway mcp` | Start MCP server for AI agent integration |
| `shipway help` | Show full help |

### Global Flags

| Flag | Description |
|------|-------------|
| `--dry-run`, `-n` | Preview commands without executing |
| `--json` | JSON output (for CI/CD pipelines) |
| `--quiet` | Minimal output |
| `--version`, `-v` | Show version |
| `--help`, `-h` | Show help |

---

## Deploy Pipeline

Every deploy runs through a fixed pipeline of 5 steps. Each step can be skipped if the config doesn't define it:

```
┌─────────┐    ┌──────┐    ┌───────────┐    ┌─────────┐    ┌──────────────┐
│  Build  │───▶│ Sync │───▶│ Post-sync │───▶│ Restart │───▶│ Health check │
└─────────┘    └──────┘    └───────────┘    └─────────┘    └──────────────┘
  local          rsync        remote SSH      pm2/systemd     curl via SSH
```

| Step | When it runs | What it does |
|------|-------------|--------------|
| **Build** | `build` is set | Runs the build command locally via `sh -c` |
| **Sync** | `sync` is set | `rsync` with `-avz --stats`, optional `--delete` and `--checksum` |
| **Post-sync** | `postSync` is set | Runs a command on the remote server (e.g. `npm install --omit=dev`) |
| **Restart** | `start` or `restart` is set | Restarts (or starts) the process via pm2/systemd |
| **Health check** | `port` or `health` is set | Curls the health URL with retries |

Each step is timed independently. On failure, the pipeline stops and shows the failing step with its error.

---

## Process Managers

Shipway supports three process managers via the adapter pattern:

| Manager | Config | Use case |
|---------|--------|----------|
| **pm2** (default) | `restart.method: pm2` or just `start: ...` | Node.js apps, most common |
| **systemd** | `restart.method: systemd` | System services, requires sudo |
| **none** | `restart.method: none` | Static sites, no process to manage |

### pm2 (default)

When you specify `start`, shipway auto-configures pm2:

```yaml
start: node server.js    # → pm2 start 'node server.js' --name my-app
```

First deploy creates the pm2 process. Subsequent deploys restart it with `pm2 restart --update-env`.

### systemd

```yaml
restart:
  method: systemd
  name: my-app            # systemd unit name
```

Uses `sudo systemctl restart my-app`. The systemd unit file must be created separately.

---

## Safety Guards

Shipway inherits and improves on safety patterns from battle-tested deployments:

### Shallow-path delete protection

`rsync --delete` is refused on remote paths with fewer than 3 segments. This prevents catastrophic mistakes like accidentally wiping `/home/deploy`:

```yaml
# ✅ Safe — 3+ segments
sync: ./dist → ~/my-app/dist

# ❌ Rejected — too shallow
sync: ./dist → ~/my-app        # if ~/my-app resolves to /home/deploy/my-app → OK (3 segments)
sync: ./dist → /var             # REFUSED
```

### Multi-local delete guard

When multiple `local` sources target the same `remote`, `--delete` is automatically disabled with a warning — otherwise each rsync run would wipe the previous one's output:

```yaml
sync:
  local: [./public, ./package.json]
  remote: ~/app
  # delete: true → auto-disabled, warning emitted
```

### Dry-run mode

`shipway deploy --dry-run` runs the full pipeline but:
- Build runs normally (so you can verify it works)
- Rsync runs with `-n` (shows what would be transferred)
- Remote commands are logged but not executed
- Health check is skipped

---

## Project Registry

Register projects globally, then deploy from anywhere:

```bash
# In your project directory
cd ~/my-app
shipway link

# Now deploy from anywhere
shipway deploy my-app

# List all projects
shipway ls

# ● my-app (deployed: 5/21/2026)
#   /Users/you/my-app
```

Projects are stored in `~/.shipway/projects.yml`:

```yaml
projects:
  - alias: my-app
    path: /Users/you/my-app
    addedAt: "2026-05-21T12:00:00.000Z"
    lastDeployAt: "2026-05-21T14:30:00.000Z"
```

---

## Migrating from shipit

If you're migrating from the `shipit` tool:

```bash
shipway migrate              # converts shipit.json → shipway.yml in CWD
shipway migrate ~/other-app  # or specify a directory
```

The migrator intelligently converts:

| shipit.json | shipway.yml |
|-------------|-------------|
| `{ host: { ip, user } }` | `host: user@ip` |
| `{ restart: { method: "pm2", start: "node app.js" } }` | `start: node app.js` |
| `{ health: { url: "http://localhost:3000/" } }` | `port: 3000` |
| `{ sync: { local, remote } }` | `sync: local → remote` |

After migration, review the generated `shipway.yml` and test:

```bash
shipway deploy --dry-run
```

---

## Project Structure

```
shipway/
├── src/
│   ├── cli.ts                          # Entry point — argv parser, composition root
│   ├── commands/
│   │   ├── index.ts                    # Command registry (name → handler)
│   │   ├── types.ts                    # Command interface + CommandContext
│   │   ├── deploy.ts                   # Build → sync → restart → health
│   │   ├── status.ts                   # Remote process status + health
│   │   ├── logs.ts                     # Tail remote logs
│   │   ├── ssh.ts                      # Interactive SSH session
│   │   ├── exec.ts                     # Run remote command
│   │   ├── restart.ts / stop.ts / start.ts
│   │   ├── open.ts                     # Open URL in browser
│   │   ├── link.ts / unlink.ts / ls.ts # Project registry management
│   │   ├── migrate.ts                  # shipit.json → shipway.yml
│   │   └── help.ts                     # ANSI-colored help output
│   ├── config/
│   │   ├── schema.ts                   # Zod schemas (validation + type inference)
│   │   ├── parser.ts                   # YAML/JSON load → validate → normalize
│   │   ├── normalize.ts               # Shorthand expansion (string→object, port→health)
│   │   └── types.ts                    # NormalizedConfig, ResolvedHost
│   ├── host/
│   │   └── resolver.ts                 # HostResolver — string, SSH object, IP object
│   ├── ssh/
│   │   ├── args.ts                     # SSH flag builder (key resolution, options)
│   │   └── client.ts                   # SSHClient — exec, interactive, tunnel
│   ├── rsync/
│   │   ├── builder.ts                  # RsyncArgsBuilder (fluent API)
│   │   ├── runner.ts                   # Execute rsync with safety checks
│   │   └── safety.ts                   # Shallow-path + multi-local guards
│   ├── pipeline/
│   │   ├── deploy-pipeline.ts          # Pipeline executor with timing
│   │   ├── deploy-context.ts           # Immutable context for steps
│   │   └── steps/
│   │       ├── build.ts                # Local build via sh -c
│   │       ├── sync.ts                 # rsync to remote
│   │       ├── post-sync.ts            # Remote command after sync
│   │       ├── restart.ts              # pm2/systemd restart
│   │       └── health-check.ts         # HTTP health with retries
│   ├── process-managers/
│   │   ├── types.ts                    # ProcessManager interface
│   │   ├── pm2.ts                      # pm2 adapter
│   │   ├── systemd.ts                  # systemd adapter
│   │   ├── none.ts                     # No-op adapter
│   │   └── index.ts                    # Factory: method → adapter
│   ├── health/
│   │   └── checker.ts                  # curl via SSH with retry/backoff
│   ├── registry/
│   │   ├── types.ts                    # Project, ProjectRepository
│   │   ├── file-repository.ts          # ~/.shipway/projects.yml (atomic writes)
│   │   └── resolver.ts                 # Alias → project lookup
│   ├── errors/
│   │   ├── base.ts                     # ShipwayError abstract class
│   │   ├── config-error.ts             # Config validation errors
│   │   ├── ssh-error.ts                # Remote command failures
│   │   ├── rsync-error.ts              # File sync failures
│   │   ├── deploy-error.ts             # Pipeline step failures
│   │   ├── exit-codes.ts               # Typed exit code enum
│   │   └── index.ts                    # Barrel export
│   ├── logging/
│   │   ├── colors.ts                   # ANSI escape codes (no chalk)
│   │   ├── format.ts                   # Step indicators, timing, headers
│   │   ├── logger.ts                   # Logger (human/JSON, stderr-only for MCP)
│   │   └── index.ts
│   └── utils/
│       ├── exec.ts                     # Child process spawn with AbortSignal
│       ├── paths.ts                    # Tilde expansion, config dirs
│       ├── argv.ts                     # CLI argument parser (50 lines, no framework)
│       └── atomic-write.ts             # Write-then-rename for crash safety
├── tests/
│   ├── unit/
│   │   ├── config/parser.test.ts       # Config parsing + normalization (10 tests)
│   │   ├── host/resolver.test.ts       # Host resolution (7 tests)
│   │   ├── rsync/rsync.test.ts         # Builder + safety guards (12 tests)
│   │   └── utils/utils.test.ts         # Argv, paths, format, logger (15 tests)
│   └── fixtures/
│       └── configs/                    # Real user configs for testing
│           ├── deutschepolska.yml
│           ├── blossom.yml
│           └── invalid/
├── examples/
│   └── multi-service/                  # TaskForge: API + Worker + Dashboard
├── bin/                                # tsc output (gitignored)
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── biome.json
├── LICENSE                             # MIT
└── CONTRIBUTING.md
```

---

## Design Patterns

Shipway uses well-defined design patterns to keep the codebase modular and testable:

| Pattern | Where | Purpose |
|---------|-------|---------|
| **Command** | `src/commands/*.ts` | Each CLI subcommand is a class with `execute(ctx)` |
| **Pipeline** | `src/pipeline/` | Deploy is a fixed sequence of independent, testable steps |
| **Adapter** | `src/process-managers/` | pm2, systemd, none share one interface |
| **Factory** | `src/host/resolver.ts` | Resolves any host config shape to `ResolvedHost` |
| **Builder** | `src/rsync/builder.ts` | Fluent API for composing rsync args safely |
| **Repository** | `src/registry/` | Project registry behind an interface (file-backed) |
| **DI** | `src/cli.ts` | Constructor injection — no hidden singletons |

### Command Pattern

```typescript
export interface Command {
  readonly name: string;
  readonly description: string;
  readonly usage: string;
  execute(ctx: CommandContext): Promise<number>; // exit code
}
```

### Pipeline Pattern

```typescript
export interface DeployStep {
  readonly name: string;
  shouldRun(ctx: DeployContext): boolean;
  run(ctx: DeployContext): Promise<void>;
}
```

### Adapter Pattern

```typescript
export interface ProcessManager {
  readonly kind: 'pm2' | 'systemd' | 'none';
  start(ssh: SSHClient, opts: StartOpts): Promise<void>;
  stop(ssh: SSHClient, name: string): Promise<void>;
  restart(ssh: SSHClient, name: string): Promise<void>;
  status(ssh: SSHClient, name: string): Promise<ProcessStatus>;
  logs(ssh: SSHClient, name: string, opts: LogsOpts): Promise<string>;
}
```

---

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

Tests use [Vitest](https://vitest.dev/) with no mocking frameworks — pure unit tests against real config fixtures:

| Suite | Tests | What it covers |
|-------|:-----:|---------------|
| `config/parser.test.ts` | 10 | YAML parsing, normalization, shorthand expansion, validation errors |
| `host/resolver.test.ts` | 7 | String host, SSH object, IP object, key passthrough, error cases |
| `rsync/rsync.test.ts` | 12 | Arg building, checksum, delete, dry-run, exclude, safety guards |
| `utils/utils.test.ts` | 15 | Argv parsing, tilde expansion, duration formatting, secret redaction |
| **Total** | **44** | |

Test fixtures use the real user configs (`deutschepolska.yml`, `blossom.yml`) to verify that actual production configs parse correctly — no synthetic-only tests.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SHIPWAY_SSH_KEY` | — | Path to SSH private key (overrides config `key` field) |

> SSH key resolution: config `key` field → `SHIPWAY_SSH_KEY` env → system ssh-agent (`~/.ssh/id_*`)

---

## Examples

### Multi-Service (TaskForge)

A task queue system with three Node.js services deployed from one `shipway.yml`:

```
examples/multi-service/
├── api/server.js           # REST API (port 4001) — task CRUD
├── worker/worker.js        # Background processor — polls + executes tasks
├── dashboard/server.js     # Web dashboard (port 4000) — live stats + API proxy
├── package.json
└── README.md
```

- **Zero dependencies** — pure Node.js with native `http`, `fs`, `fetch`
- **File-backed persistence** — tasks stored in `data/tasks.json`
- **Simulated task types** — email, report, thumbnail, webhook (with random failures)
- **Dark-mode dashboard** — glassmorphism UI with auto-refresh

```bash
# Run locally
cd examples/multi-service
node api/server.js &
node worker/worker.js &
node dashboard/server.js
# → http://localhost:4000
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript → `bin/` |
| `npm run dev` | Run CLI via tsx (no build step) |
| `npm test` | Run all tests |
| `npm run test:watch` | Watch mode |
| `npm run test:coverage` | Coverage report |
| `npm run lint` | Biome check |
| `npm run format` | Biome format |
| `npm run typecheck` | `tsc --noEmit` |

---

## Tech Stack

| Choice | Rationale |
|--------|-----------|
| **TypeScript** (strict, ES2022, NodeNext) | Type safety, modern JS, ESM |
| **Node.js 20+** | LTS, native fetch, AbortSignal.timeout |
| **tsc** (no bundler) | Ships readable JS, no bundler complexity |
| **Vitest** | Fast, native TS, ESM-friendly |
| **yaml** (eemeli/yaml) | YAML 1.2, good error positions |
| **zod** | Config validation with type inference |
| **Biome** | 10× faster than ESLint + Prettier |
| **No CLI framework** | Argv parsing is 50 lines — zero magic |
| **No chalk** | 10 lines of ANSI helpers in `colors.ts` |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

```bash
git clone https://github.com/berna/shipway
cd shipway
npm install
npm run dev -- help     # run without building
npm test                # run tests
```

---

## License

[MIT](LICENSE)
