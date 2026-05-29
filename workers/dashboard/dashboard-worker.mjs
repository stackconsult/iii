#!/usr/bin/env node
/**
 * Switchboard Dashboard Worker
 *
 * Serves an HTML dashboard at /dashboard aggregating Switchboard state
 * from the bridge worker endpoints.
 *
 * Usage:
 *   node dashboard-worker.mjs
 *
 * Then open http://localhost:3111/dashboard
 */

import { registerWorker } from '../../sdk/packages/node/iii/dist/index.mjs'

const ENGINE_URL = process.env.III_ENGINE_URL || 'ws://localhost:49134'

const iii = registerWorker(ENGINE_URL, { worker_name: 'switchboard-dashboard' })

// Helper: fetch from local bridge endpoints
async function bridge(path) {
  try {
    const res = await fetch(`http://localhost:3111${path}`)
    return await res.json()
  } catch (e) {
    return { error: e.message }
  }
}

function renderDashboard(data) {
  const { kanban, activity, inbox, handoffs } = data

  const parseRows = (val) => {
    if (Array.isArray(val)) return val
    if (typeof val === 'string') try { return JSON.parse(val) } catch { return [] }
    return []
  }

  const kanbanRows = parseRows(kanban?.rows)
    .map(
      (r) => `<tr>
        <td>${r.kanban_column || 'N/A'}</td>
        <td>${r.status || 'N/A'}</td>
        <td style="text-align:right">${r.count || 0}</td>
      </tr>`
    )
    .join('')

  const activityRows = parseRows(activity?.rows)
    .slice(0, 20)
    .map(
      (r) => `<tr>
        <td>${r.timestamp?.slice(0, 19) || 'N/A'}</td>
        <td>${r.event_type || 'N/A'}</td>
        <td><code>${(r.payload || '').slice(0, 80)}</code></td>
      </tr>`
    )
    .join('')

  const inboxItems = (inbox?.items || [])
    .map((i) => `<li>${i.name} <span class="badge">${i.type}</span></li>`
    )
    .join('')

  const handoffItems = (handoffs?.items || [])
    .map((i) => `<li>${i.name} <span class="badge">${i.type}</span></li>`
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Switchboard Dashboard — iii</title>
<style>
  :root { --bg: #0f0f11; --card: #18181b; --text: #e4e4e7; --muted: #a1a1aa; --accent: #22c55e; --border: #27272a; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); }
  header { padding: 1.5rem 2rem; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 1rem; }
  header h1 { margin: 0; font-size: 1.25rem; }
  header .badge { background: var(--accent); color: #000; padding: 0.15rem 0.5rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1rem; padding: 1.5rem 2rem; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 0.5rem; padding: 1rem; }
  .card h2 { margin: 0 0 0.75rem; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
  table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
  th, td { padding: 0.4rem 0.5rem; text-align: left; border-bottom: 1px solid var(--border); }
  th { color: var(--muted); font-weight: 500; }
  ul { margin: 0; padding-left: 1.2rem; font-size: 0.8125rem; }
  li { margin: 0.3rem 0; }
  .badge { background: var(--border); color: var(--muted); padding: 0.1rem 0.4rem; border-radius: 0.25rem; font-size: 0.7rem; }
  .empty { color: var(--muted); font-style: italic; }
  code { background: var(--bg); padding: 0.1rem 0.3rem; border-radius: 0.25rem; font-size: 0.75rem; }
  .refresh { margin-left: auto; background: var(--card); border: 1px solid var(--border); color: var(--text); padding: 0.4rem 0.75rem; border-radius: 0.375rem; cursor: pointer; font-size: 0.8125rem; }
  .refresh:hover { border-color: var(--accent); }
</style>
</head>
<body>
<header>
  <h1>Switchboard Dashboard</h1>
  <span class="badge">iii</span>
  <button class="refresh" onclick="location.reload()">Refresh</button>
</header>
<div class="grid">
  <div class="card">
    <h2>Kanban Columns</h2>
    <table>
      <thead><tr><th>Column</th><th>Status</th><th style="text-align:right">Count</th></tr></thead>
      <tbody>${kanbanRows || '<tr><td colspan="3" class="empty">No data</td></tr>'}</tbody>
    </table>
  </div>
  <div class="card">
    <h2>Recent Activity</h2>
    <table>
      <thead><tr><th>Time</th><th>Event</th><th>Payload</th></tr></thead>
      <tbody>${activityRows || '<tr><td colspan="3" class="empty">No activity</td></tr>'}</tbody>
    </table>
  </div>
  <div class="card">
    <h2>Inbox Agents</h2>
    <ul>${inboxItems || '<li class="empty">No agents registered</li>'}</ul>
  </div>
  <div class="card">
    <h2>Handoffs</h2>
    <ul>${handoffItems || '<li class="empty">No handoffs</li>'}</ul>
  </div>
</div>
<footer style="padding: 1rem 2rem; font-size: 0.75rem; color: var(--muted); border-top: 1px solid var(--border);">
  Powered by <a href="https://iii.dev" style="color: var(--accent); text-decoration: none;">iii</a> —
  Data from <code>switchboard-bridge</code> worker
</footer>
</body>
</html>`
}

iii.registerFunction('dashboard::render', async () => {
  const [kanban, activity, inbox, handoffs] = await Promise.all([
    bridge('/switchboard/kanban'),
    bridge('/switchboard/activity'),
    bridge('/switchboard/inbox'),
    bridge('/switchboard/handoffs'),
  ])

  const html = renderDashboard({ kanban, activity, inbox, handoffs })

  return {
    status_code: 200,
    headers: ['Content-Type: text/html'],
    body: html,
  }
})

iii.registerTrigger({
  type: 'http',
  function_id: 'dashboard::render',
  config: { api_path: '/dashboard', http_method: 'GET' },
})

console.log('[dashboard] Connecting to iii engine at', ENGINE_URL)
await iii.connect()
console.log('[dashboard] Connected. Open http://localhost:3111/dashboard')
