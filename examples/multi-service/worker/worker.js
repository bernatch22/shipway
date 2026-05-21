import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const DATA_DIR = join(import.meta.dirname ?? '.', '..', 'data');
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL ?? '2000', 10);

// ── Task processing logic ──────────────────────────────────

const TASK_HANDLERS = {
  // Simulate different task types with varying processing times
  email: async (payload) => {
    await sleep(1000 + Math.random() * 2000);
    return { sent: true, to: payload.to, subject: payload.subject };
  },
  report: async (payload) => {
    await sleep(2000 + Math.random() * 3000);
    const rows = Math.floor(Math.random() * 10000);
    return { generated: true, format: payload.format ?? 'pdf', rows };
  },
  thumbnail: async (payload) => {
    await sleep(500 + Math.random() * 1500);
    return { processed: true, imageUrl: payload.url, size: '128x128' };
  },
  webhook: async (payload) => {
    await sleep(300 + Math.random() * 700);
    // Simulate occasional failures
    if (Math.random() < 0.1) throw new Error('Webhook endpoint unreachable');
    return { delivered: true, url: payload.url, status: 200 };
  },
  default: async (payload) => {
    await sleep(1000 + Math.random() * 1000);
    return { processed: true, payload };
  },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Worker loop ────────────────────────────────────────────

async function loadTasks() {
  const file = join(DATA_DIR, 'tasks.json');
  if (!existsSync(file)) return { tasks: [], nextId: 1 };
  try {
    const data = await readFile(file, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { tasks: [], nextId: 1 };
  }
}

async function saveTasks(data) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(join(DATA_DIR, 'tasks.json'), JSON.stringify(data, null, 2), 'utf-8');
}

async function processNextTask() {
  const data = await loadTasks();
  const { tasks } = data;

  // Find first pending task (priority: high > normal > low)
  const priorityOrder = ['high', 'normal', 'low'];
  let nextTask = null;

  for (const priority of priorityOrder) {
    nextTask = tasks.find((t) => t.status === 'pending' && t.priority === priority);
    if (nextTask) break;
  }

  if (!nextTask) return false;

  // Mark as processing
  nextTask.status = 'processing';
  nextTask.startedAt = new Date().toISOString();
  await saveTasks(data);

  const handler = TASK_HANDLERS[nextTask.type] ?? TASK_HANDLERS.default;
  console.log(`⚙️  Processing task #${nextTask.id} (${nextTask.type})...`);

  try {
    const result = await handler(nextTask.payload);
    nextTask.status = 'completed';
    nextTask.completedAt = new Date().toISOString();
    nextTask.result = result;
    console.log(`✅ Task #${nextTask.id} completed`);
  } catch (err) {
    nextTask.status = 'failed';
    nextTask.completedAt = new Date().toISOString();
    nextTask.error = err.message;
    console.log(`❌ Task #${nextTask.id} failed: ${err.message}`);
  }

  await saveTasks(data);
  return true;
}

// ── Main loop ──────────────────────────────────────────────

console.log(`🔧 TaskForge Worker started (poll every ${POLL_INTERVAL}ms)`);

async function loop() {
  while (true) {
    try {
      const hadWork = await processNextTask();
      if (!hadWork) {
        await sleep(POLL_INTERVAL);
      }
    } catch (err) {
      console.error(`Worker error: ${err.message}`);
      await sleep(POLL_INTERVAL);
    }
  }
}

loop();
