# Changelog

All notable changes to **shipway** are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions follow semver (pre-1.0, minor = features/notable docs).

## [0.5.2] — 2026-07-10

### Fixed
- **Multi-service deploy swallowed the real error on failure.** `shipway deploy <service>` caught
  the underlying `DeployError` with a bare `catch {}` (no binding) and only ever printed
  `Service "x" failed.` — the actual cause (an rsync path that no longer exists, a failed
  `postSync` command, SSH auth) was discarded. Now prints `err.message` (which already includes
  the step + cause) plus the wrapped cause's message on a second line when it adds detail.

### Added
- **`shipway env list [--service <name>]`** — lists every key on the remote `.env` (never
  values), for the whole project or one service in a multi-service config. Answers "what's
  actually set on the box" without a pull/edit/push round-trip.
- **Per-service `env:`** — a `services.<name>.env` field (same shorthand as the root `env:`)
  lets one service in a multi-service stack own its own `.env` file/path. Falls back to the
  root/environment `env:` when omitted (the common case — one shared `.env`).
- **`--service <name>`** flag on `shipway env pull|push|diff|list` to target that service's env
  file explicitly. Combines with the existing `--env <name>` for `shipway env list --env prod
  --service api`.

## [0.5.0] — 2026-06-22

### Added
- **Log strategies** — a top-level `logs:` map of named sources for `shipway logs <strategy>`.
  Each strategy tails a **raw remote file** (`tail -F` under a forced PTY) or runs a **custom
  command** directly over SSH, bypassing the process manager. This avoids pm2's output buffering,
  so `--follow` streams in real-time — ideal for fast, chatty logs (STT/turns/TTS/LLM). Shorthand
  `name: /path/to/file`, or `{ file, cmd, lines }`. `--lines` and `--grep` (line-buffered) still
  apply. A strategy name is matched before services; unknown names fall through to the normal
  pm2/systemd path (backwards-compatible). Definable per-environment under `environments.<env>.logs`.

## [0.4.0] — 2026-06-18

### Added
- **`defaultEnv`** top-level config key. When set, `shipway deploy` (and `logs`/`status`/`restart`) with
  no `--env` uses that environment instead of the bare base config. An explicit `--env` still wins. Lets a
  project whose common target is an environment (e.g. `prod`) drop the repetitive `--env` flag.

## [0.3.0] — 2026-06-18

### Added
- **Per-service `build`.** A service's own `build` now runs in its pipeline, so
  `shipway deploy <service>` can **build + ship just that one service** — e.g. a UI-only deploy
  (`shipway deploy ui`) that rebuilds the frontend without touching the API/workers. The shared
  root `build` still runs once for a full deploy.

### Changed
- A service **without** its own `build` no longer inherits the root `build` (it used to, but the
  per-service pipeline never ran it — so this was dead config). This prevents the root build from
  re-running once per service now that per-service build is wired up. Define `build` on the service
  that needs it; leave it off the others.

## [0.2.1] — 2026-06-18

### Fixed
- `shipway --version` now reads the real version from `package.json` instead of a hardcoded constant
  that version bumps forgot to update (0.2.0 shipped reporting `0.1.0`).

## [0.2.0] — 2026-06-18

### Documentation
- **Advanced multi-service guide** in the README: heterogeneous stacks, out-of-tree **sidecars**, and
  **restart-only** services. Documents three patterns that the basic multi-service docs didn't cover:
  - **Restart-only service** — `sync: []` + `postSync: ''` so a second unit sharing the same code is only
    restarted, not re-synced (and the gotcha: omitting them inherits the root sync/postSync).
  - **Out-of-tree sidecar** — `sync: {local: ../sidecar, remote: ~/sidecar}` for a service whose source
    lives outside `remoteDir` (a sibling folder / repo root).
  - **The `postSync` `cd` gotcha** — shipway prefixes `postSync` with `cd <remoteDir>`; a sidecar working in
    a different dir must `cd` there itself.
  - **`services:` scoped to one environment** (e.g. prod = full stack, staging = single process), and the
    once-per-deploy shared `build`.
- New worked example **`examples/sidecar-stack/`** ("Beacon": Python API + restart-only gateway + Node
  ingestor sidecar) — annotated `shipway.yml` + README.

_No behavior changes — the `services:` engine already supported all of the above; this release documents and
exemplifies it._

## [0.1.0]

- Initial release: local-build → rsync → pm2/systemd deploy over SSH, configured by `shipway.yml`.
  Single-service and multi-service, environments, env-file push/pull, project registry, MCP server,
  dry-run + delete safety guards.
