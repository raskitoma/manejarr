/**
 * Orchestrator — Main execution flow coordinator
 *
 * Coordinates Phase 1 (Verification & Monitoring) and Phase 2 (Retention & Cleanup).
 * Manages concurrency (singleton lock), run logging, and client initialization.
 */

import { createDelugeClient } from '../clients/deluge.js';
import { createRadarrClient } from '../clients/radarr.js';
import { createSonarrClient } from '../clients/sonarr.js';
import { executePhase1 } from './phase1.js';
import { executePhase2 } from './phase2.js';
import { decrypt } from '../crypto/encryption.js';
import {
  getSetting,
  insertRunLog,
  updateRunLog,
  insertEventLog,
  cleanupOldLogs,
  updateTorrentMetadata
} from '../db/database.js';
import { notifyRunComplete } from '../notifications/notifier.js';

// Singleton lock to prevent concurrent executions
let isRunning = false;
let currentRunId = null;

/**
 * Get current run status.
 */
export function getRunStatus() {
  return {
    running: isRunning,
    runId: currentRunId,
  };
}

/**
 * Build service clients from stored settings.
 */
function buildClients() {
  const delugeHost = getSetting('deluge_host');
  const delugePort = getSetting('deluge_port');
  const delugePassword = getSetting('deluge_password');

  const radarrHost = getSetting('radarr_host');
  const radarrPort = getSetting('radarr_port');
  const radarrApiKey = getSetting('radarr_api_key');

  const sonarrHost = getSetting('sonarr_host');
  const sonarrPort = getSetting('sonarr_port');
  const sonarrApiKey = getSetting('sonarr_api_key');

  if (!delugeHost || !delugePassword) {
    throw new Error('Deluge connection not configured. Go to Settings to configure.');
  }
  if (!radarrHost || !radarrApiKey) {
    throw new Error('Radarr connection not configured. Go to Settings to configure.');
  }
  if (!sonarrHost || !sonarrApiKey) {
    throw new Error('Sonarr connection not configured. Go to Settings to configure.');
  }

  return {
    deluge: createDelugeClient({
      host: delugeHost,
      port: parseInt(delugePort, 10) || 8112,
      password: decrypt(delugePassword),
    }),
    radarr: createRadarrClient({
      host: radarrHost,
      port: parseInt(radarrPort, 10) || 7878,
      apiKey: decrypt(radarrApiKey),
    }),
    sonarr: createSonarrClient({
      host: sonarrHost,
      port: parseInt(sonarrPort, 10) || 8989,
      apiKey: decrypt(sonarrApiKey),
    }),
  };
}

/**
 * Execute the full orchestration flow.
 *
 * @param {Object} options
 * @param {boolean} options.dryRun - If true, simulate without making changes
 * @param {string} options.runType - 'manual' | 'scheduled' | 'dry-run'
 * @returns {Object} - Full run result with Phase 1 and Phase 2 summaries
 */
export async function runFull(options = {}) {
  const { dryRun = false, runType = 'manual' } = options;

  // Concurrency guard
  if (isRunning) {
    throw new Error('A run is already in progress. Please wait for it to complete.');
  }

  isRunning = true;
  const effectiveRunType = dryRun ? 'dry-run' : runType;

  // Create run log entry
  const runId = insertRunLog(effectiveRunType, 'running');
  currentRunId = runId;

  // Log helper that writes to both console and database
  const log = (level, category, message, metadata = null) => {
    const prefix = `[${category.toUpperCase()}]`;
    const logLine = `${prefix} ${message}`;

    if (level === 'error') console.error(logLine);
    else if (level === 'warn') console.warn(logLine);
    else console.log(logLine);

    try {
      insertEventLog(runId, level, category, message, metadata);
    } catch (e) {
      console.error('Failed to write event log:', e.message);
    }
  };

  try {
    log('info', 'engine', `Starting ${effectiveRunType} run (ID: ${runId})`);

    // Build clients
    const clients = buildClients();

    // Get retention settings
    const minSeedingTime = parseInt(getSetting('min_seeding_time'), 10) || 259200; // 3 days
    const minRatio = parseFloat(getSetting('min_ratio')) || 1.1;

    // Get existing persistent metadata to avoid re-matching
    const existingMetadata = getAllTorrentMetadata();

    // ── Phase 1: Verification & Monitoring ──
    log('info', 'engine', '═══ Phase 1: Verification & Monitoring ═══');
    const phase1Result = await executePhase1(clients, { dryRun, existingMetadata }, log);

    // ── Phase 2: Retention & Cleanup ──
    log('info', 'engine', '═══ Phase 2: Retention & Cleanup ═══');
    const phase2Result = await executePhase2(clients, { minSeedingTime, minRatio }, { dryRun }, log);

    // Build summary
    const summary = {
      runType: effectiveRunType,
      phase1: phase1Result,
      phase2: phase2Result,
      totals: {
        processed: phase1Result.processed + phase2Result.processed,
        actions: phase1Result.relabeled + phase2Result.transitioned,
        errors: phase1Result.errors + phase2Result.errors,
      },
    };

    log('info', 'engine', `Run complete. Processed: ${summary.totals.processed}, Actions: ${summary.totals.actions}, Errors: ${summary.totals.errors}`);

    // Update run log
    updateRunLog(runId, 'success', JSON.stringify(summary));

    // Update persistent metadata for discovered torrents
    if (phase1Result.details) {
      for (const detail of phase1Result.details) {
        if (detail.hash && detail.manager && detail.metadata) {
          try {
            updateTorrentMetadata(detail.hash, {
              manager: detail.manager,
              title: detail.title || detail.metadata.title,
              metadata: detail.metadata
            });
          } catch (e) {
            console.error('[ENGINE] Failed to update persistent metadata:', e.message);
          }
        }
      }
    }

    // Send notification (fire-and-forget — don't let notification failure crash the run)
    notifyRunComplete(summary).catch(err => {
      log('warn', 'engine', `Notification dispatch failed: ${err.message}`);
    });

    return summary;

  } catch (err) {
    const errorMsg = err.message || 'Unknown error';
    console.error('[ENGINE] Run failed:', errorMsg);

    try {
      insertEventLog(runId, 'error', 'engine', `Run failed: ${errorMsg}`, { stack: err.stack });
      updateRunLog(runId, 'error', null, errorMsg);
    } catch (e) {
      console.error('Failed to update run log:', e.message);
    }

    throw err;

  } finally {
    isRunning = false;
    currentRunId = null;
    
    // Clean up old logs based on retention policy
    if (!dryRun) {
      try {
        cleanupOldLogs();
      } catch (err) {
        console.error('[ENGINE] Failed to clean up old logs:', err.message);
      }
    }
  }
}
