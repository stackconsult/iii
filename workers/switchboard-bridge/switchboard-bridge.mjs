#!/usr/bin/env node
/**
 * Switchboard → iii Bridge Worker
 *
 * Exposes Switchboard workflow state via iii HTTP triggers,
 * and logs agent activity into iii's OpenTelemetry pipeline.
 *
 * Usage:
 *   node switchboard-bridge.mjs
 *
 * Requires:
 *   - iii engine running on ws://localhost:49134
 *   - iii-sdk built (sdk/packages/node/iii/dist/)
 */

import { registerWorker } from '../../sdk/packages/node/iii/dist/index.mjs'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createRequire } from 'node:module'

// ── Configuration ───────────────────────────────────────────────────────────

const ENGINE_URL = process.env.III_ENGINE_URL || 'ws://localhost:49134'
const SWITCHBOARD_DIR = process.env.SWITCHBOARD_DIR || './.switchboard'
const BRIDGE_WORKER_NAME = process.env.III_WORKER_NAME || 'switchboard-bridge'

// ── Helper: read Switchboard DB safely ──────────────────────────────────────

async function queryKanban(sql) {
  const { DatabaseSync } = await import('node:sqlite').catch(() => ({}))
  if (!DatabaseSync) {
    // Fallback: use sqlite3 CLI
    const { execSync } = await import('node:child_process')
    const dbPath = join(SWITCHBOARD_DIR, 'kanban.db')
    try {
      return execSync(`sqlite3 "${dbPath}" "${sql.replace(/"/g, '""')}" 2>/dev/null`, { encoding: 'utf8' })
    } catch {
      return ''
    }
  }
  const dbPath = join(SWITCHBOARD_DIR, 'kanban.db')
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true })
    const stmt = db.prepare(sql)
    const rows = stmt.all()
    db.close()
    return JSON.stringify(rows)
  } catch (e) {
    return JSON.stringify({ error: e.message })
  }
}

// ── Helper: read directory contents ───────────────────────────────────────────

async function listDir(subdir) {
  const dirPath = join(SWITCHBOARD_DIR, subdir)
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    return entries.map((e) => ({
      name: e.name,
      type: e.isDirectory() ? 'dir' : 'file',
    }))
  } catch {
    return []
  }
}

// ── Register worker ─────────────────────────────────────────────────────────

const iii = registerWorker(ENGINE_URL, { worker_name: BRIDGE_WORKER_NAME })

// ── Functions ───────────────────────────────────────────────────────────────

iii.registerFunction('switchboard::kanban-state', async () => {
  const rows = await queryKanban(
    "SELECT kanban_column, status, COUNT(*) as count FROM plans GROUP BY kanban_column, status"
  )
  return { body: { source: 'switchboard.kanban.db', query: 'column_summary', rows } }
})

iii.registerFunction('switchboard::plans', async (input) => {
  const limit = input?.limit || 50
  const offset = input?.offset || 0
  const column = input?.column || null
  const sql = column
    ? `SELECT plan_id, session_id, topic, kanban_column, status, complexity, tags, created_at, updated_at FROM plans WHERE kanban_column = '${column.replace(/'/g, "''")}' ORDER BY updated_at DESC LIMIT ${limit} OFFSET ${offset}`
    : `SELECT plan_id, session_id, topic, kanban_column, status, complexity, tags, created_at, updated_at FROM plans ORDER BY updated_at DESC LIMIT ${limit} OFFSET ${offset}`
  const rows = await queryKanban(sql)
  return { body: { source: 'switchboard.kanban.db', query: 'plans', rows } }
})

iii.registerFunction('switchboard::plan-events', async (input) => {
  const sessionId = input?.session_id
  const limit = input?.limit || 100
  if (!sessionId) return { body: { error: 'session_id required' } }
  const sql = `SELECT event_id, event_type, workflow, action, timestamp, payload FROM plan_events WHERE session_id = '${sessionId.replace(/'/g, "''")}' ORDER BY timestamp DESC LIMIT ${limit}`
  const rows = await queryKanban(sql)
  return { body: { source: 'switchboard.kanban.db', query: 'plan_events', rows } }
})

iii.registerFunction('switchboard::activity', async (input) => {
  const limit = input?.limit || 100
  const sql = `SELECT id, timestamp, event_type, payload, correlation_id, session_id FROM activity_log ORDER BY timestamp DESC LIMIT ${limit}`
  const rows = await queryKanban(sql)
  return { body: { source: 'switchboard.kanban.db', query: 'activity_log', rows } }
})

iii.registerFunction('switchboard::handoffs', async () => {
  const items = await listDir('handoff')
  return { body: { source: 'switchboard.handoff/', type: 'directory_listing', items } }
})

iii.registerFunction('switchboard::inbox', async () => {
  const items = await listDir('inbox')
  return { body: { source: 'switchboard.inbox/', type: 'directory_listing', items } }
})

iii.registerFunction('switchboard::plans-files', async () => {
  const items = await listDir('plans')
  return { body: { source: 'switchboard.plans/', type: 'directory_listing', items } }
})

iii.registerFunction('switchboard::log', async (input) => {
  const body = input?.body || input || {}
  const { event_type, payload, correlation_id, session_id } = body
  if (!event_type) return { body: { error: 'event_type required' } }

  // Also write to the local kanban activity_log if possible
  try {
    const { execSync } = await import('node:child_process')
    const dbPath = join(SWITCHBOARD_DIR, 'kanban.db')
    const ts = new Date().toISOString()
    const payloadJson = JSON.stringify(payload || {})
    const corr = correlation_id || ''
    const sess = session_id || ''
    execSync(
      `sqlite3 "${dbPath}" "INSERT INTO activity_log (timestamp, event_type, payload, correlation_id, session_id) VALUES ('${ts}', '${event_type.replace(/'/g, "''")}', '${payloadJson.replace(/'/g, "''")}', '${corr}', '${sess}');" 2>/dev/null`,
      { encoding: 'utf8' }
    )
  } catch {
    // Swallow — iii trace is the primary sink
  }

  return { body: { accepted: true, event_type, timestamp: new Date().toISOString() } }
})

// ── Triggers ────────────────────────────────────────────────────────────────

iii.registerTrigger({
  type: 'http',
  function_id: 'switchboard::kanban-state',
  config: { api_path: '/switchboard/kanban', http_method: 'GET' },
})

iii.registerTrigger({
  type: 'http',
  function_id: 'switchboard::plans',
  config: { api_path: '/switchboard/plans', http_method: 'GET' },
})

iii.registerTrigger({
  type: 'http',
  function_id: 'switchboard::plan-events',
  config: { api_path: '/switchboard/events', http_method: 'GET' },
})

iii.registerTrigger({
  type: 'http',
  function_id: 'switchboard::activity',
  config: { api_path: '/switchboard/activity', http_method: 'GET' },
})

iii.registerTrigger({
  type: 'http',
  function_id: 'switchboard::handoffs',
  config: { api_path: '/switchboard/handoffs', http_method: 'GET' },
})

iii.registerTrigger({
  type: 'http',
  function_id: 'switchboard::inbox',
  config: { api_path: '/switchboard/inbox', http_method: 'GET' },
})

iii.registerTrigger({
  type: 'http',
  function_id: 'switchboard::plans-files',
  config: { api_path: '/switchboard/plans-files', http_method: 'GET' },
})

iii.registerTrigger({
  type: 'http',
  function_id: 'switchboard::log',
  config: { api_path: '/switchboard/log', http_method: 'POST' },
})

// ── Connect ─────────────────────────────────────────────────────────────────

console.log('[bridge] Connecting to iii engine at', ENGINE_URL)
await iii.connect()
console.log('[bridge] Connected. Registered functions:')
console.log('  GET  /switchboard/kanban      → kanban column summary')
console.log('  GET  /switchboard/plans       → plans list (limit, offset, column)')
console.log('  GET  /switchboard/events       → plan events (session_id required)')
console.log('  GET  /switchboard/activity     → activity log')
console.log('  GET  /switchboard/handoffs     → handoff directory')
console.log('  GET  /switchboard/inbox        → inbox directory')
console.log('  GET  /switchboard/plans-files  → plans directory')
console.log('  POST /switchboard/log          → log event into switchboard + iii OTel')
