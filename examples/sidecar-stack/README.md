# Beacon — heterogeneous multi-service deploy (sidecar + restart-only + per-env)

A **config-only** reference (no runnable services) for the harder real-world shape that the
[`multi-service`](../multi-service/) example doesn't cover: a mixed-runtime stack deployed to **one
box** by a single `shipway deploy --env prod`.

It exercises every advanced `services:` pattern at once:

| Pattern | Service | What to look at in `shipway.yml` |
|---|---|---|
| **Mixed runtimes** | `api` (Python) + `ingestor` (Node) | different `postSync` per service (`uv sync` vs `npm ci`) |
| **Restart-only** | `gateway` | `sync: []` + `postSync: ''` ⇒ shipway only bounces the unit (shares the API's code) |
| **Out-of-tree sidecar** | `ingestor` | `sync.local: ../beacon-ingestor` + explicit `remote:` (a sibling repo folder, outside `remoteDir`) |
| **The `cd` postSync gotcha** | `ingestor` | `postSync: 'cd ~/beacon-ingestor && npm ci …'` — required, else it installs in `~/beacon` |
| **Build once, ship with a service** | `build:` | dashboard built locally, rsynced into `static/`, then shipped by `api`'s sync |
| **Multi-service for ONE env** | `prod` only | `staging` has no `services:` → stays a single pm2 process |

## The flow

```bash
shipway deploy --env prod
# 1. build   (local):   cd ../beacon-web && npm ci && npm run build && rsync … → ../beacon/static/
# 2. api:     sync . → ~/beacon (incl. static/)  ·  uv sync --no-dev  ·  restart beacon-api
# 3. gateway: (no sync, no postSync)             ·  restart beacon-gateway
# 4. ingestor: sync ../beacon-ingestor → ~/beacon-ingestor · npm ci --omit=dev · restart beacon-ingestor

shipway deploy --env prod --dry-run   # print the per-service plan without touching the box
shipway logs ingestor --env prod      # tail just the sidecar
shipway restart gateway --env prod    # bounce one unit
shipway status --env prod             # all three units at a glance
```

## Notes / requirements

- **Pre-create the systemd units** on the box (`beacon-api`, `beacon-gateway`, `beacon-ingestor`).
  shipway's systemd adapter start/restarts units — it does not install them. Each unit owns its env
  via `EnvironmentFile=` (e.g. `EnvironmentFile=/home/deploy/beacon/.env`).
- **Order matters.** Services deploy in declaration order and stop at the first failure. List the
  code-syncing service (`api`) before restart-only ones (`gateway`).
- **Why restart-only must be explicit.** A service that *omits* `sync`/`postSync` inherits the root's,
  so it would redundantly re-sync and re-install. `sync: []` and `postSync: ''` skip those steps.

For the prose walk-through see the main
[README → Advanced: heterogeneous stacks](../../README.md#advanced-heterogeneous-stacks-sidecars--restart-only-services).
