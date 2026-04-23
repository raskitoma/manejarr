/**
 * Log Retention Manager
 *
 * Implements a tiered log retention policy:
 * - Detailed logs: kept for 24 hours
 * - Daily compacted: kept for 7 days
 * - Weekly compacted: kept for 30 days
 * - Everything older than 30 days: deleted
 */

import cron from 'node-cron';
import { getDb, saveDatabase } from './database.js';

/**
 * Run the log retention/compaction process.
 */
export function runLogRetention() {
  const db = getDb();
  if (!db) return;

  const now = new Date();

  try {
    // 1. Delete detailed event logs older than 24 hours 
    //    (but keep at least one summary per run)
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    db.run(
      `DELETE FROM event_logs WHERE created_at < ? AND level = 'info'`,
      [oneDayAgo]
    );

    // 2. Delete warn-level event logs older than 7 days
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    db.run(
      `DELETE FROM event_logs WHERE created_at < ? AND level = 'warn'`,
      [sevenDaysAgo]
    );

    // 3. Delete ALL event logs older than 30 days (including errors)
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    db.run(
      `DELETE FROM event_logs WHERE created_at < ?`,
      [thirtyDaysAgo]
    );

    // 4. Delete run_logs older than 30 days (keep summaries for a month)
    db.run(
      `DELETE FROM run_logs WHERE started_at < ?`,
      [thirtyDaysAgo]
    );

    saveDatabase();
    console.log('[RETENTION] Log retention completed');
  } catch (err) {
    console.error('[RETENTION] Log retention failed:', err.message);
  }
}

/**
 * Clear all retained logs (user-initiated).
 */
export function clearAllLogs() {
  const db = getDb();
  if (!db) return;

  try {
    db.run('DELETE FROM event_logs');
    db.run('DELETE FROM run_logs');
    saveDatabase();
    console.log('[RETENTION] All logs cleared');
  } catch (err) {
    console.error('[RETENTION] Failed to clear logs:', err.message);
  }
}

/**
 * Start the log retention cron (runs daily at 3 AM).
 */
export function startLogRetention() {
  // Run once on startup
  runLogRetention();

  // Schedule daily at 3 AM
  cron.schedule('0 3 * * *', () => {
    runLogRetention();
  }, {
    timezone: process.env.TZ || 'UTC',
  });

  console.log('[RETENTION] Log retention scheduler started (daily at 3 AM)');
}
