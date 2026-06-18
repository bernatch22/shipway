# Changelog

All notable changes to **shipway** are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions follow semver (pre-1.0, minor = features/notable docs).

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
