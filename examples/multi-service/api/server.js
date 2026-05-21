import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const PORT = parseInt(process.env.PORT ?? '4001', 10);
const DATA_DIR = join(import.meta.dirname ?? '.', '..', 'data');

// ── In-memory task store with file persistence ─────────────

let tasks = [];
let nextId = 1;

async function loadTasks() {
  const file = join(DATA_DIR, 'tasks.json');
  if (!existsSync(file)) return;
  try {
    const data = await readFile(file, 'utf-8');
    const parsed = JSON.parse(data);
    tasks = parsed.tasks ?? [];
    nextId = parsed.nextId ?? 1;
  } catch {
    // Start fresh if corrupt
  }
}

async function saveTasks() {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(
    join(DATA_DIR, 'tasks.json'),
    JSON.stringify({ tasks, nextId }, null, 2),
    'utf-8',
  );
}

// ── API routes ─────────────────────────────────────────────

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
  });
}

function json(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:' + PORT);
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    json(res, {}, 204);
    return;
  }

  // Reload from disk on every request (worker modifies the same file)
  await loadTasks();

  // Health check
  if (url.pathname === '/' || url.pathname === '/health') {
    json(res, { status: 'ok', service: 'taskforge-api', tasks: tasks.length });
    return;
  }

  // GET /tasks — list all tasks
  if (method === 'GET' && url.pathname === '/tasks') {
    const status = url.searchParams.get('status');
    const filtered = status ? tasks.filter((t) => t.status === status) : tasks;
    json(res, { tasks: filtered, total: tasks.length });
    return;
  }

  // POST /tasks — create a task
  if (method === 'POST' && url.pathname === '/tasks') {
    const body = await parseBody(req);
    const task = {
      id: nextId++,
      type: body.type ?? 'default',
      payload: body.payload ?? {},
      status: 'pending',
      priority: body.priority ?? 'normal',
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      result: null,
      error: null,
    };
    tasks.push(task);
    await saveTasks();
    json(res, task, 201);
    return;
  }

  // GET /tasks/:id
  if (method === 'GET' && url.pathname.startsWith('/tasks/')) {
    const id = parseInt(url.pathname.split('/')[2], 10);
    const task = tasks.find((t) => t.id === id);
    if (!task) {
      json(res, { error: 'Task not found' }, 404);
      return;
    }
    json(res, task);
    return;
  }

  // GET /stats — queue statistics
  if (method === 'GET' && url.pathname === '/stats') {
    const stats = {
      total: tasks.length,
      pending: tasks.filter((t) => t.status === 'pending').length,
      processing: tasks.filter((t) => t.status === 'processing').length,
      completed: tasks.filter((t) => t.status === 'completed').length,
      failed: tasks.filter((t) => t.status === 'failed').length,
    };
    json(res, stats);
    return;
  }

  json(res, { error: 'Not found' }, 404);
});

await loadTasks();
server.listen(PORT, () => {
  console.log('TaskForge API running on http://localhost:' + PORT);
});
