import { createServer } from 'node:http';

const PORT = parseInt(process.env.PORT ?? '4000', 10);
const API_URL = process.env.API_URL ?? 'http://localhost:4001';

// ── Dashboard HTML ─────────────────────────────────────────

const HTML = [
'<!DOCTYPE html>',
'<html lang="en">',
'<head>',
'  <meta charset="UTF-8">',
'  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
'  <title>TaskForge Dashboard</title>',
'  <style>',
'    * { margin: 0; padding: 0; box-sizing: border-box; }',
'    body {',
'      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
'      background: #0f0f1a;',
'      color: #e0e0e0;',
'      min-height: 100vh;',
'    }',
'    .container { max-width: 960px; margin: 0 auto; padding: 2rem; }',
'    h1 {',
'      font-size: 2rem;',
'      background: linear-gradient(135deg, #667eea, #764ba2);',
'      -webkit-background-clip: text;',
'      -webkit-text-fill-color: transparent;',
'      margin-bottom: 0.5rem;',
'    }',
'    .subtitle { color: #888; margin-bottom: 2rem; }',
'    .stats {',
'      display: grid;',
'      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));',
'      gap: 1rem;',
'      margin-bottom: 2rem;',
'    }',
'    .stat {',
'      background: rgba(255,255,255,0.05);',
'      border: 1px solid rgba(255,255,255,0.1);',
'      border-radius: 12px;',
'      padding: 1.25rem;',
'      text-align: center;',
'      transition: transform 0.2s;',
'    }',
'    .stat:hover { transform: translateY(-2px); }',
'    .stat-value { font-size: 2rem; font-weight: 700; margin-bottom: 0.25rem; }',
'    .stat-label { font-size: 0.85rem; color: #888; text-transform: uppercase; }',
'    .stat.pending .stat-value { color: #f6ad55; }',
'    .stat.processing .stat-value { color: #63b3ed; }',
'    .stat.completed .stat-value { color: #68d391; }',
'    .stat.failed .stat-value { color: #fc8181; }',
'    .stat.total .stat-value { color: #b794f4; }',
'    .actions { display: flex; gap: 0.75rem; margin-bottom: 2rem; flex-wrap: wrap; }',
'    button {',
'      background: linear-gradient(135deg, #667eea, #764ba2);',
'      color: white; border: none;',
'      padding: 0.6rem 1.25rem; border-radius: 8px;',
'      cursor: pointer; font-size: 0.9rem; transition: opacity 0.2s;',
'    }',
'    button:hover { opacity: 0.85; }',
'    .tasks-list { display: flex; flex-direction: column; gap: 0.5rem; }',
'    .task-item {',
'      background: rgba(255,255,255,0.03);',
'      border: 1px solid rgba(255,255,255,0.08);',
'      border-radius: 8px; padding: 1rem;',
'      display: flex; align-items: center; gap: 1rem;',
'    }',
'    .task-id { font-weight: 700; color: #b794f4; min-width: 3rem; }',
'    .task-type { background: rgba(102,126,234,0.2); color: #667eea; padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.8rem; }',
'    .task-status { padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.8rem; margin-left: auto; }',
'    .task-status.pending { background: rgba(246,173,85,0.2); color: #f6ad55; }',
'    .task-status.processing { background: rgba(99,179,237,0.2); color: #63b3ed; }',
'    .task-status.completed { background: rgba(104,211,145,0.2); color: #68d391; }',
'    .task-status.failed { background: rgba(252,129,129,0.2); color: #fc8181; }',
'    .empty { text-align: center; color: #666; padding: 3rem; }',
'    .refresh { font-size: 0.8rem; color: #555; margin-top: 1rem; }',
'  </style>',
'</head>',
'<body>',
'  <div class="container">',
'    <h1>⚡ TaskForge</h1>',
'    <p class="subtitle">Multi-service task queue — deployed with shipway</p>',
'    <div class="stats" id="stats">',
'      <div class="stat total"><div class="stat-value" id="total">-</div><div class="stat-label">Total</div></div>',
'      <div class="stat pending"><div class="stat-value" id="pending">-</div><div class="stat-label">Pending</div></div>',
'      <div class="stat processing"><div class="stat-value" id="processing">-</div><div class="stat-label">Processing</div></div>',
'      <div class="stat completed"><div class="stat-value" id="completed">-</div><div class="stat-label">Completed</div></div>',
'      <div class="stat failed"><div class="stat-value" id="failed">-</div><div class="stat-label">Failed</div></div>',
'    </div>',
'    <div class="actions">',
'      <button onclick="createTask(\'email\', {to:\'user@example.com\', subject:\'Hello\'})">📧 Send Email</button>',
'      <button onclick="createTask(\'report\', {format:\'pdf\'})">📊 Generate Report</button>',
'      <button onclick="createTask(\'thumbnail\', {url:\'/images/photo.jpg\'})">🖼️ Thumbnail</button>',
'      <button onclick="createTask(\'webhook\', {url:\'https://hooks.example.com\'})">🔗 Webhook</button>',
'    </div>',
'    <div class="tasks-list" id="tasks"></div>',
'    <p class="refresh">Auto-refreshes every 2 seconds</p>',
'  </div>',
'  <script>',
'    const API = "/api";',
'    async function refresh() {',
'      try {',
'        const [sR, tR] = await Promise.all([fetch(API+"/stats"), fetch(API+"/tasks")]);',
'        const stats = await sR.json();',
'        const { tasks } = await tR.json();',
'        document.getElementById("total").textContent = stats.total;',
'        document.getElementById("pending").textContent = stats.pending;',
'        document.getElementById("processing").textContent = stats.processing;',
'        document.getElementById("completed").textContent = stats.completed;',
'        document.getElementById("failed").textContent = stats.failed;',
'        const list = document.getElementById("tasks");',
'        if (tasks.length === 0) { list.innerHTML = \'<div class="empty">No tasks yet. Click a button above!</div>\'; return; }',
'        list.innerHTML = tasks.slice().reverse().slice(0,20).map(function(t) {',
'          return \'<div class="task-item">\'',
'            + \'<span class="task-id">#\' + t.id + \'</span>\'',
'            + \'<span class="task-type">\' + t.type + \'</span>\'',
'            + \'<span>\' + t.priority + \'</span>\'',
'            + \'<span class="task-status \' + t.status + \'">\' + t.status + \'</span>\'',
'            + \'</div>\';',
'        }).join("");',
'      } catch(e) { console.error("Refresh failed:", e); }',
'    }',
'    async function createTask(type, payload) {',
'      await fetch(API+"/tasks", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({type,payload}) });',
'      refresh();',
'    }',
'    refresh();',
'    setInterval(refresh, 2000);',
'  </script>',
'</body>',
'</html>',
].join('\n');

// ── Dashboard server with API proxy ────────────────────────

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:' + PORT);

  // Health check
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'taskforge-dashboard' }));
    return;
  }

  // Proxy /api/* to the API server
  if (url.pathname.startsWith('/api/')) {
    const apiPath = url.pathname.replace('/api', '') + url.search;
    try {
      const apiRes = await fetch(API_URL + apiPath, {
        method: req.method,
        headers: req.headers,
        body: req.method !== 'GET' ? await collectBody(req) : undefined,
      });
      const body = await apiRes.text();
      res.writeHead(apiRes.status, {
        'Content-Type': apiRes.headers.get('content-type') ?? 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(body);
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'API unreachable', message: err.message }));
    }
    return;
  }

  // Serve dashboard HTML
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(HTML);
});

function collectBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
  });
}

server.listen(PORT, () => {
  console.log('TaskForge Dashboard running on http://localhost:' + PORT);
});
