-- Manejarr Database Schema

-- Service connection settings (credentials are AES-256-GCM encrypted)
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Cron schedules for automated runs
CREATE TABLE IF NOT EXISTS schedules (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    cron_expr  TEXT NOT NULL,
    enabled    INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Execution run history
CREATE TABLE IF NOT EXISTS run_logs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    run_type     TEXT NOT NULL,
    status       TEXT NOT NULL,
    started_at   TEXT DEFAULT (datetime('now')),
    finished_at  TEXT,
    summary      TEXT,
    error        TEXT
);

-- Granular event log entries
CREATE TABLE IF NOT EXISTS event_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id     INTEGER REFERENCES run_logs(id),
    level      TEXT NOT NULL,
    category   TEXT NOT NULL,
    message    TEXT NOT NULL,
    metadata   TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
