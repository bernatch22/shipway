# ⚓ Shipway

**Deploy apps over SSH.** Build locally, sync via rsync, restart with pm2 or systemd, health-check — all from a 7-line YAML config.

Shipway is a CLI for shipping Node.js, Python, and Ruby apps to a VPS without Docker. It targets the sweet spot where containers are overkill: single-server deployments, small teams, apps managed by pm2 or systemd.

- **7-line config** — most projects deploy with just `name`, `host`, `build`, `sync`, `start`, `port`
- **Multi-service** — deploy API + worker + dashboard in one `shipway.yml`
- **Safe by default** — shallow-path delete protection, multi-local guards, dry-run mode
- **Environments** — staging and prod in the same config, switch with `--env`
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
  - [Advanced: heterogeneous stacks, sidecars & restart-only services](#advanced-heterogeneous-stacks-sidecars--restart-only-services)
  - [Environments](#environments)
- [Commands](#commands)
  - [Deploy](#deploy)
  - [Operations](#operations)
  - [Project Management](#project-management)
  - [Advanced](#advanced)
  - [Global Flags](#global-flags)
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
- [Scripts](#scripts)
- [Tech Stack](#tech-stack)
- [Contributing](#contributing)
- [License](#license)

---

## Quick Start

**1. Install**

```bash
npm i -g shipway
```

**2. Add a `shipway.yml` to your project**

```yaml
name: my-app
host: deploy@192.168.1.100
remoteDir: ~/my-app
build: npm run build
sync: ./dist
start: node server.js
port: 3000
```

**3. Deploy**

```bash
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

services:                        # optional — multi-service (see below)
  api:
    sync: ./dist/api → ~/my-app/api
    start: node api/server.js
    port: 4001
  worker:
    sync: ./dist/worker → ~/my-app/worker
    start: node worker/index.js

environments:                    # optional — per-environment overrides (see below)
  staging:
    host: deploy@staging.example.com
    remoteDir: ~/my-app-staging
  prod:
    host: deploy@prod.example.com
    url: https://my-app.com
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

**Before:**

```yaml
sync:
  local: ./dist
  remote: /home/deploy/my-app
postSync: cd /home/deploy/my-app && npm install --omit=dev
```

**After:**

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

Deploy all services or just one:

```bash
shipway deploy              # all services
shipway deploy api          # just the API
shipway logs worker         # logs for one service
shipway status              # status of all services
```

### Advanced: heterogeneous stacks, sidecars & restart-only services

`services:` isn't only for "N copies of the same Node app". Because **every service has its own
`sync`, `build`, `postSync`, `restart`, `cwd` and `health`** (each falling back to the root when
omitted), one config can ship a **mixed-runtime stack** in a single `shipway deploy`: a Python app,
a Node sidecar that lives in a *different* directory, and a unit that should only be **restarted**
(not re-synced). Three patterns worth knowing:

#### 1. Restart-only service (share code, bounce a second unit)

Two units often run from the **same** synced code (e.g. an API process and a separate gateway/worker
that imports it). You want the code synced **once**, but **both** units restarted so they pick up the
change. Give the second service an **empty `sync`** and an **empty `postSync`** so it does nothing but
restart:

```yaml
services:
  api:                      # syncs the code + installs deps + restarts
    sync: . → ~/app
    postSync: uv sync --no-dev
    restart: { method: systemd, name: app-api }
  gateway:                  # SAME code (already on the box) — just bounce the unit
    sync: []                # ← empty list: the Sync step is skipped entirely
    postSync: ''            # ← empty string: the Post-sync step is skipped
    restart: { method: systemd, name: app-gateway }
```

> ⚠️ You **must** set `sync: []` and `postSync: ''` explicitly. A service that *omits* them inherits
> the root `sync`/`postSync`, so it would redundantly re-sync and re-run the install.

#### 2. Out-of-tree sidecar (source outside `remoteDir`)

A sidecar can live **outside** the main app directory — a sibling folder or the repo root — and sync to
its own remote path. Use the object form of `sync` with an explicit `remote` (it bypasses `remoteDir`):

```yaml
services:
  collector:
    sync:
      local: ../collector            # a sibling dir, outside this config's app folder
      remote: ~/collector            # its own remote home (ignores remoteDir)
      exclude: [node_modules, .git]
    postSync: 'cd ~/collector && npm ci --omit=dev'   # ← see the gotcha below
    restart: { method: systemd, name: app-collector }
```

> 🪤 **The `postSync` `cd` gotcha.** shipway prefixes `postSync` with `cd <remoteDir>` (the env's base
> dir) unless your command *already* starts with `cd `. A sidecar whose work happens in a different
> directory **must `cd` there itself** (`cd ~/collector && …`), otherwise the install runs in the wrong
> place. When your command starts with `cd`, shipway leaves it untouched.

#### 3. Multi-service for ONE environment only

`services:` can live **inside an `environment`**. Common when only your prod box runs the full stack while
staging is a single process. The environment's `services:` replaces (doesn't deep-merge with) the root —
so other environments keep using the simple single-service path untouched.

#### 4. Deploy just ONE service — with its own build (e.g. a UI-only deploy)

`shipway deploy <service>` deploys a single service, and **runs that service's own `build`** first. Give
the service a `build` and you get a fast, isolated deploy that rebuilds + ships only its artifact — without
touching the other units:

```yaml
services:
  ui:                                  # `shipway deploy ui` = rebuild the frontend + ship it, nothing else
    build: cd ../web && npm run build && rsync -a --delete dist/ ./static/
    sync: { local: static, remote: ~/app/static }
    restart: { method: none }          # e.g. a static bundle served by an already-running API → no restart
  api:
    restart: { method: systemd, name: app-api }
```

```bash
shipway deploy ui          # build the UI + sync static/ ONLY — api/workers untouched
shipway deploy             # full deploy: every service (each runs its own build if it has one)
```

> The **shared root `build`** (top-level / env-level) runs ONCE before all services on a full deploy. A
> **service's own `build`** runs in that service's pipeline — including when you target it with
> `shipway deploy <service>`. A service without its own `build` does **not** inherit the root one (so the
> root build never re-runs per service). Put the build where the artifact belongs.

#### Worked example — "Beacon", a self-hosted analytics stack

A Python metrics API + a separate gateway unit (restart-only) + a Node event **ingestor** that lives in a
sibling repo folder. The frontend is built once locally and shipped inside the API's sync. Multi-service
**only on `prod`**; `staging` stays a single process. (Full runnable config in
[`examples/sidecar-stack/`](examples/sidecar-stack/).)

```yaml
name: beacon
remoteDir: ~/beacon
sync: .
postSync: uv sync --no-dev
exclude: [.git, .venv, __pycache__, node_modules, .env, "*.pyc"]

environments:
  # staging = one box, one process — plain single-service path
  staging:
    host: deploy@staging.beacon.io
    start: uv run beacon serve --port 8000      # pm2-managed
    port: 8000

  # prod = three units on one box, built + shipped + restarted in one command
  prod:
    host:
      ssh: deploy@beacon.io
      key: ~/.ssh/beacon_prod
    # runs ONCE locally before any service: build the dashboard into the API's static dir
    build: cd ../beacon-web && npm ci && npm run build && rsync -a --delete dist/ ../beacon/static/
    services:
      api:                                       # 1) sync code (incl. built static/) + deps + restart
        postSync: uv sync --no-dev               #    (sync + excludes inherited from root)
        restart: { method: systemd, name: beacon-api }
      gateway:                                    # 2) same code, just bounce the gateway unit
        sync: []
        postSync: ''
        restart: { method: systemd, name: beacon-gateway }
      ingestor:                                   # 3) Node sidecar from a sibling repo dir
        sync:
          local: ../beacon-ingestor
          remote: ~/beacon-ingestor
          exclude: [node_modules, .git, .env]
        postSync: 'cd ~/beacon-ingestor && npm ci --omit=dev'
        restart: { method: systemd, name: beacon-ingestor }
```

```bash
shipway deploy --env prod           # build dashboard → sync api → restart api → restart gateway → sync+install+restart ingestor
shipway deploy --env prod --dry-run # print the exact per-service plan without touching the box
shipway logs ingestor --env prod    # tail just the sidecar
shipway restart gateway --env prod  # bounce one unit
```

> The systemd **units must be pre-created on the box** — shipway's systemd adapter start/restarts, it does
> not install units (see [Process Managers](#process-managers)). Each service's env (e.g. an
> `EnvironmentFile=`) lives in its unit file. Services deploy **in declaration order**, stopping at the
> first failure — list the code-syncing service before the ones that only restart.

### Environments

Deploy to different servers per environment from a single config file:

```yaml
name: my-app
remoteDir: ~/my-app
build: npm run build
sync: ./dist
postSync: npm install --omit=dev
start: node server.js
port: 3000

environments:
  staging:
    host: deploy@staging.example.com
    remoteDir: ~/my-app-staging
    url: https://staging.my-app.com

  prod:
    host:
      ssh: deploy@prod.example.com
      key: ~/.ssh/prod_key
    url: https://my-app.com
```

Use `--env` with any command:

```bash
shipway deploy --env staging     # deploy to staging
shipway deploy --env prod        # deploy to production
shipway status --env prod        # check production status
shipway logs --env staging       # tail staging logs
```

**How merging works:** environment fields override the base config (shallow merge). Fields not set in the environment inherit from the base:

| Field | Base | `--env staging` | Result |
|-------|------|-----------------|--------|
| `host` | — | `deploy@staging.example.com` | `deploy@staging.example.com` |
| `remoteDir` | `~/my-app` | `~/my-app-staging` | `~/my-app-staging` |
| `build` | `npm run build` | *(not set)* | `npm run build` |
| `postSync` | `npm install` | *(not set)* | `cd ~/my-app-staging && npm install` |

> Without `--env`, the base config is used directly.

---

## Commands

### Deploy

| Command | Description |
|---------|-------------|
| `shipway deploy` | Full pipeline: build → sync → restart → health check |
| `shipway deploy --dry-run` | Preview everything without executing |
| `shipway deploy --env staging` | Deploy using the `staging` environment |
| `shipway deploy api` | Deploy only the `api` service (multi-service) |

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

### Env Files

`.env` is usually **excluded from sync** (prod owns its secrets — see [Sync Formats](#sync-formats)),
so deploys never touch it. `shipway env` is how you edit that remote `.env` safely.

| Command | Description |
|---------|-------------|
| `shipway env` | Key-level diff of local vs remote `.env` (read-only, **values never printed**) |
| `shipway env diff` | Same as above, explicit |
| `shipway env pull` | Download the remote `.env` → local file (written `0600`) |
| `shipway env pull --out /tmp/x.env` | Pull to a specific path (won't clobber an existing file without `--force`) |
| `shipway env push --yes` | Upload the local `.env` → remote (backs up remote to `.env.bak`, writes atomically) |
| `shipway env push /tmp/x.env --yes --restart` | Push a specific file, then `pm2 restart` the service |

Without `--yes`, `push` is a **dry run** — it prints the diff and exits. The diff marks each key
`+` add / `~` change / `-` remove (remove = present on remote, absent locally), **never the values**.

The env-file location resolves from config (defaults to `<remoteDir>/.env` remote, `./.env` local):

```yaml
# shorthand — just the remote path
env: ~/app/shared/.env

# or explicit
env:
  remote: ~/app/.env
  local: ./.env.production
```

Typical "edit a prod secret" flow:

```bash
shipway env pull --out /tmp/app.env   # download
$EDITOR /tmp/app.env                   # edit
shipway env push /tmp/app.env --yes --restart
```

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
| `--env <name>` | Use a specific environment |
| `--json` | JSON output (for CI/CD pipelines) |
| `--quiet` | Minimal output |
| `--version`, `-v` | Show version |
| `--help`, `-h` | Show help |

---

## Deploy Pipeline

Every deploy runs through a fixed pipeline of 5 steps:

```
┌─────────┐    ┌──────┐    ┌───────────┐    ┌─────────┐    ┌──────────────┐
│  Build  │───▶│ Sync │───▶│ Post-sync │───▶│ Restart │───▶│ Health check │
└─────────┘    └──────┘    └───────────┘    └─────────┘    └──────────────┘
  local          rsync        remote SSH      pm2/systemd     curl via SSH
```

Each step is skipped if the config doesn't define it. Each step is timed independently. On failure, the pipeline stops and shows the failing step with its error.

| Step | When it runs | What it does |
|------|-------------|--------------|
| **Build** | `build` is set | Runs the build command locally via `sh -c` |
| **Sync** | `sync` is set | `rsync -avz --stats`, optional `--delete` and `--checksum` |
| **Post-sync** | `postSync` is set | Runs a command on the remote server (e.g. `npm install`) |
| **Restart** | `start` or `restart` is set | Restarts (or creates) the process via pm2/systemd |
| **Health check** | `port` or `health` is set | Curls the health URL with retries |

---

## Process Managers

| Manager | Config | Use case |
|---------|--------|----------|
| **pm2** (default) | `start: node server.js` | Node.js apps, most common |
| **systemd** | `restart: { method: systemd, name: my-app }` | System services, requires sudo |
| **none** | `restart: { method: none }` | Static sites, no process to manage |

When you specify `start`, shipway auto-configures pm2:

```yaml
start: node server.js    # → pm2 start 'node server.js' --name my-app
```

First deploy creates the pm2 process. Subsequent deploys restart it with `pm2 restart --update-env`.

---

## Safety Guards

### Shallow-path delete protection

`rsync --delete` is refused on remote paths with fewer than 3 segments. Prevents accidentally wiping `/home/deploy`:

```yaml
# ✅ Safe — /home/deploy/my-app = 3 segments
sync: ./dist → ~/my-app

# ❌ Refused — too shallow
sync: ./dist → /var
```

### Multi-local delete guard

When multiple `local` sources target the same `remote`, `--delete` is automatically disabled with a warning:

```yaml
sync:
  local: [./public, ./package.json]
  remote: ~/app
  # delete: true → auto-disabled, warning emitted
```

### Dry-run mode

`shipway deploy --dry-run` previews the full pipeline:

- Build runs normally (so you can verify it works)
- Rsync runs with `-n` (shows what would transfer)
- Remote commands are logged but not executed
- Health check is skipped

---

## Project Registry

Register projects globally, then deploy from anywhere:

```bash
cd ~/my-app && shipway link        # register
shipway deploy my-app              # deploy from anywhere
shipway ls                         # list all projects
```

Projects are stored in `~/.shipway/projects.yml`.

---

## Migrating from shipit

```bash
shipway migrate              # converts shipit.json → shipway.yml in CWD
shipway migrate ~/other-app  # or specify a directory
```

| shipit.json | shipway.yml |
|-------------|-------------|
| `{ host: { ip, user } }` | `host: user@ip` |
| `{ restart: { method: "pm2", start: "..." } }` | `start: ...` |
| `{ health: { url: "http://localhost:3000/" } }` | `port: 3000` |

After migration, verify with `shipway deploy --dry-run`.

---

## Project Structure

```
shipway/
├── src/
│   ├── cli.ts                   # Entry point, argv parser, composition root
│   ├── commands/                # One file per CLI command
│   │   ├── deploy.ts            # Build → sync → restart → health
│   │   ├── status.ts            # Remote process status
│   │   ├── logs.ts              # Tail remote logs
│   │   ├── restart.ts / stop.ts / start.ts
│   │   ├── ssh.ts / exec.ts / open.ts
│   │   ├── link.ts / unlink.ts / ls.ts
│   │   ├── migrate.ts           # shipit.json → shipway.yml
│   │   └── help.ts
│   ├── config/                  # YAML parsing, zod validation, normalization
│   │   ├── schema.ts            # Zod schemas
│   │   ├── parser.ts            # Load + validate + env merge
│   │   ├── normalize.ts         # Shorthand expansion
│   │   └── types.ts             # NormalizedConfig, ResolvedHost
│   ├── pipeline/                # Deploy pipeline executor + steps
│   │   ├── deploy-pipeline.ts
│   │   └── steps/               # build, sync, post-sync, restart, health-check
│   ├── rsync/                   # RsyncArgsBuilder + safety guards
│   ├── ssh/                     # SSHClient + arg builder
│   ├── process-managers/        # pm2, systemd, none adapters
│   ├── host/                    # Host resolution (string → ResolvedHost)
│   ├── registry/                # Project registry (~/.shipway/projects.yml)
│   ├── health/                  # HTTP health checker with retries
│   ├── errors/                  # Typed error classes + exit codes
│   ├── logging/                 # ANSI colors, step formatting, Logger
│   └── utils/                   # exec, argv, paths, atomic-write
├── tests/
│   ├── unit/                    # 49 tests across 4 suites
│   └── fixtures/configs/        # Real production configs for testing
├── examples/
│   └── multi-service/           # TaskForge: API + Worker + Dashboard
├── bin/                         # tsc output (gitignored)
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── LICENSE                      # MIT
```

---

## Design Patterns

| Pattern | Where | Purpose |
|---------|-------|---------|
| **Command** | `src/commands/` | Each subcommand is a class with `execute(ctx)` |
| **Pipeline** | `src/pipeline/` | Deploy = fixed sequence of testable steps |
| **Adapter** | `src/process-managers/` | pm2, systemd, none share one interface |
| **Builder** | `src/rsync/builder.ts` | Fluent API for composing rsync args |
| **Repository** | `src/registry/` | Project registry behind an interface |
| **DI** | `src/cli.ts` | Constructor injection, no hidden singletons |

---

## Testing

```bash
npm test                # run all tests
npm run test:watch      # watch mode
npm run test:coverage   # coverage report
```

49 tests across 4 suites using [Vitest](https://vitest.dev/):

| Suite | Tests | Covers |
|-------|:-----:|--------|
| `config/parser.test.ts` | 15 | Parsing, normalization, environments, validation |
| `host/resolver.test.ts` | 7 | String, SSH object, IP object, key passthrough |
| `rsync/rsync.test.ts` | 12 | Arg building, safety guards, checksum, delete |
| `utils/utils.test.ts` | 15 | Argv, paths, formatting, logger |

Test fixtures use real production configs to verify that actual deployments parse correctly.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SHIPWAY_SSH_KEY` | — | Path to SSH private key (overrides config `key`) |

---

## Examples

### TaskForge (Multi-Service)

A task queue with three Node.js services deployed from one `shipway.yml`:

```
examples/multi-service/
├── api/server.js           # REST API (port 4001)
├── worker/worker.js        # Background task processor
├── dashboard/server.js     # Web dashboard (port 4000)
└── shipway.yml
```

Zero dependencies, file-backed persistence, dark-mode dashboard with auto-refresh.

```bash
cd examples/multi-service
node api/server.js & node worker/worker.js & node dashboard/server.js
# → http://localhost:4000
```

### Beacon (heterogeneous stack — sidecar + restart-only + per-env multi-service)

A config-only reference for the harder real-world shape: a **Python** API, a **restart-only**
gateway unit sharing the same code, and a **Node sidecar** (`ingestor`) that lives in a *sibling*
repo folder — all shipped by one `shipway deploy --env prod`, with `staging` left as a single
process. Demonstrates `sync: []` / `postSync: ''` (restart-only), out-of-tree `sync.local: ../…`,
the `cd` postSync gotcha, a once-per-deploy `build`, and `services:` scoped to one environment.

```
examples/sidecar-stack/
└── shipway.yml + README.md     # annotated config (the patterns, not runnable services)
```

See [Advanced: heterogeneous stacks](#advanced-heterogeneous-stacks-sidecars--restart-only-services)
for the full walk-through.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript → `bin/` |
| `npm run dev` | Run CLI via tsx (no build step) |
| `npm test` | Run all tests |
| `npm run test:watch` | Watch mode |
| `npm run lint` | Biome check |
| `npm run format` | Biome format |
| `npm run typecheck` | `tsc --noEmit` |

---

## Tech Stack

| Choice | Rationale |
|--------|-----------|
| **TypeScript** (strict, ES2022, NodeNext) | Type safety, modern JS, ESM |
| **Node.js 20+** | LTS, native fetch, AbortSignal.timeout |
| **tsc** (no bundler) | Ships readable JS |
| **Vitest** | Fast, native TS, ESM-friendly |
| **yaml** (eemeli/yaml) | YAML 1.2, good error positions |
| **zod** | Config validation with type inference |
| **Biome** | 10× faster than ESLint + Prettier |
| **No CLI framework** | Argv parsing is 50 lines — zero magic |
| **No chalk** | 10 lines of ANSI helpers in `colors.ts` |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
git clone https://github.com/pinecall/shipway
cd shipway
npm install
npm run dev -- help     # run without building
npm test                # run tests
```

---

## License

[MIT](LICENSE)
