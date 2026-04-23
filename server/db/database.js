import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import config from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db = null;

/**
 * Initialize the SQLite database and run schema migrations.
 */
export async function initDatabase() {
  const SQL = await initSqlJs();

  // Ensure data directory exists
  if (!existsSync(config.dataDir)) {
    mkdirSync(config.dataDir, { recursive: true });
  }

  // Load existing database or create new one
  if (existsSync(config.dbPath)) {
    const buffer = readFileSync(config.dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Run schema
  const schema = readFileSync(resolve(__dirname, 'schema.sql'), 'utf-8');
  db.run(schema);

  // Persist after schema init
  saveDatabase();

  console.log('[DB] Database initialized at', config.dbPath);
  return db;
}

/**
 * Persist the in-memory database to disk.
 */
export function saveDatabase() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  writeFileSync(config.dbPath, buffer);
}

/**
 * Get the raw database instance.
 */
export function getDb() {
  return db;
}

// ── Settings helpers ──

export function getSetting(key) {
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  stmt.bind([key]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row.value;
  }
  stmt.free();
  return null;
}

export function setSetting(key, value) {
  db.run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?',
    [key, value, value]
  );
  saveDatabase();
}

export function getAllSettings() {
  const results = {};
  const stmt = db.prepare('SELECT key, value FROM settings');
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results[row.key] = row.value;
  }
  stmt.free();
  return results;
}

// ── Run log helpers ──

export function insertRunLog(runType, status) {
  db.run(
    'INSERT INTO run_logs (run_type, status) VALUES (?, ?)',
    [runType, status]
  );
  saveDatabase();

  // Get the last inserted id
  const stmt = db.prepare('SELECT last_insert_rowid() as id');
  stmt.step();
  const row = stmt.getAsObject();
  stmt.free();
  return row.id;
}

export function updateRunLog(id, status, summary, error = null) {
  db.run(
    "UPDATE run_logs SET status = ?, summary = ?, error = ?, finished_at = datetime('now') WHERE id = ?",
    [status, summary, error, id]
  );
  saveDatabase();
}

export function getRunLogs(page = 1, pageSize = 20) {
  const offset = (page - 1) * pageSize;

  // Total count
  const countStmt = db.prepare('SELECT COUNT(*) as total FROM run_logs');
  countStmt.step();
  const total = countStmt.getAsObject().total;
  countStmt.free();

  // Paginated results
  const stmt = db.prepare(
    'SELECT * FROM run_logs ORDER BY started_at DESC LIMIT ? OFFSET ?'
  );
  stmt.bind([pageSize, offset]);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();

  return { rows, total, page, pageSize };
}

export function getRunLog(id) {
  const stmt = db.prepare('SELECT * FROM run_logs WHERE id = ?');
  stmt.bind([id]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

// ── Event log helpers ──

export function insertEventLog(runId, level, category, message, metadata = null) {
  db.run(
    'INSERT INTO event_logs (run_id, level, category, message, metadata) VALUES (?, ?, ?, ?, ?)',
    [runId, level, category, message, metadata ? JSON.stringify(metadata) : null]
  );
  saveDatabase();
}

export function getEventLogs({ page = 1, pageSize = 50, level, category, runId, startDate, endDate } = {}) {
  let where = '1=1';
  const params = [];

  if (level) {
    where += ' AND level = ?';
    params.push(level);
  }
  if (category) {
    where += ' AND category = ?';
    params.push(category);
  }
  if (runId) {
    where += ' AND run_id = ?';
    params.push(runId);
  }
  if (startDate) {
    where += ' AND created_at >= ?';
    params.push(startDate);
  }
  if (endDate) {
    where += ' AND created_at <= ?';
    params.push(endDate);
  }

  // Total count
  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM event_logs WHERE ${where}`);
  countStmt.bind(params);
  countStmt.step();
  const total = countStmt.getAsObject().total;
  countStmt.free();

  // Paginated results
  const offset = (page - 1) * pageSize;
  const stmt = db.prepare(
    `SELECT * FROM event_logs WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  );
  stmt.bind([...params, pageSize, offset]);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();

  return { rows, total, page, pageSize };
}

// ── Cleanup helpers ──

export function cleanupOldLogs() {
  const retentionDays = parseInt(getSetting('log_retention_days'), 10) || 30;
  db.run(`DELETE FROM event_logs WHERE created_at < datetime('now', '-${retentionDays} days')`);
  db.run(`DELETE FROM run_logs WHERE started_at < datetime('now', '-${retentionDays} days')`);
  saveDatabase();
}

export function clearAllLogs() {
  db.run('DELETE FROM event_logs');
  db.run('DELETE FROM run_logs');
  saveDatabase();
}

// ── Schedule helpers ──

export function getSchedules() {
  const stmt = db.prepare('SELECT * FROM schedules ORDER BY created_at ASC');
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

export function getSchedule(id) {
  const stmt = db.prepare('SELECT * FROM schedules WHERE id = ?');
  stmt.bind([id]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

export function insertSchedule(name, cronExpr) {
  db.run(
    'INSERT INTO schedules (name, cron_expr) VALUES (?, ?)',
    [name, cronExpr]
  );
  saveDatabase();

  const stmt = db.prepare('SELECT last_insert_rowid() as id');
  stmt.step();
  const row = stmt.getAsObject();
  stmt.free();
  return row.id;
}

export function updateSchedule(id, data) {
  const fields = [];
  const params = [];

  if (data.name !== undefined) {
    fields.push('name = ?');
    params.push(data.name);
  }
  if (data.cron_expr !== undefined) {
    fields.push('cron_expr = ?');
    params.push(data.cron_expr);
  }
  if (data.enabled !== undefined) {
    fields.push('enabled = ?');
    params.push(data.enabled ? 1 : 0);
  }

  fields.push("updated_at = datetime('now')");
  params.push(id);

  db.run(`UPDATE schedules SET ${fields.join(', ')} WHERE id = ?`, params);
  saveDatabase();
}

export function deleteSchedule(id) {
  db.run('DELETE FROM schedules WHERE id = ?', [id]);
  saveDatabase();
}
