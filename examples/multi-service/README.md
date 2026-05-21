# TaskForge — Multi-Service Example

A lightweight task queue system demonstrating shipway's multi-service deployment.

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Dashboard     │    │    API Server    │    │     Worker      │
│   (port 4000)   │───▶│   (port 4001)   │───▶│  (background)   │
│                 │    │                 │    │                 │
│  Static HTML    │    │  REST endpoints │    │  Processes tasks│
│  + live status  │    │  task CRUD      │    │  from memory Q  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Services

- **API** (`api/server.js`): REST API for creating, listing, and inspecting tasks
- **Worker** (`worker/worker.js`): Background process that picks up tasks and executes them
- **Dashboard** (`dashboard/server.js`): Minimal web dashboard showing queue status

## Running Locally

```bash
node api/server.js &
node worker/worker.js &
node dashboard/server.js &
```

## Deploy with Shipway

```bash
shipway deploy taskforge
```

This deploys all three services, managed by pm2 as `taskforge-api`, `taskforge-worker`, and `taskforge-dashboard`.
