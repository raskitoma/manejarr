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
  updateTorrentMetadata,
  getAllTorrentMetadata
} from '../db/database.js';
import { notifyRunComplete } from '../notifications/notifier.js';

// Singleton lock to prevent concurrent executions
let isRunning = false;
let currentRunId = null;
let currentRunType = null;

/**
 * Get current run status.
 */
export function getRunStatus() {
  return {
    running: isRunning,
    runId: currentRunId,
    runType: currentRunType,
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
 * @param {boolean} options.metadataOnly - If true, only re-discover matches and
 *   refresh metadata. NO side effects: no Deluge relabel, no *arr unmonitor,
 *   no Phase 2. Used by Rematch All — that button must never produce the
 *   side effects of Run Now / Dry Run, only refresh the match cache.
 * @param {string} options.runType - 'manual' | 'scheduled' | 'dry-run' | 'rematch'
 * @returns {Object} - Full run result with Phase 1 and Phase 2 summaries
 */
export async function runFull(options = {}) {
  const { dryRun = false, runType = 'manual', metadataOnly = false } = options;

  // Concurrency guard
  if (isRunning) {
    throw new Error('A run is already in progress. Please wait for it to complete.');
  }

  isRunning = true;
  // Phase 1 side-effects are gated on its `dryRun` parameter, so a
  // metadata-only run forces phase1's dryRun to true while keeping its
  // own runType label so the UI / logs can distinguish it.
  const phase1DryRun = dryRun || metadataOnly;
  let effectiveRunType;
  if (metadataOnly) effectiveRunType = 'rematch';
  else if (dryRun) effectiveRunType = 'dry-run';
  else effectiveRunType = runType;
  currentRunType = effectiveRunType;

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

    // Ensure labels exist in Deluge — only when we're going to write to it.
    if (!phase1DryRun) {
      try {
        await clients.deluge.connect();
        await clients.deluge.addLabel('media');
        await clients.deluge.addLabel('ignore');
        await clients.deluge.addLabel('fordeletion');
      } catch (err) {
        log('warn', 'deluge', `Failed to ensure labels exist: ${err.message}`);
      }
    }

    // Get retention settings
    const minSeedingTime = parseInt(getSetting('min_seeding_time'), 10) || 259200; // 3 days
    const minRatio = parseFloat(getSetting('min_ratio')) || 1.1;

    // Get existing persistent metadata. For Rematch All the cache was just
    // cleared by the route, so this is empty — phase1 falls through to the
    // full match chain for every torrent.
    const existingMetadata = getAllTorrentMetadata();

    // ── Phase 1: Verification & Monitoring ──
    // metadataOnly forces phase1DryRun=true so phase1 still discovers
    // matches and builds metadata but does NOT relabel torrents in Deluge
    // and does NOT unmonitor anything in Radarr/Sonarr.
    log('info', 'engine', metadataOnly
      ? '═══ Phase 1: Match discovery (metadata-only) ═══'
      : '═══ Phase 1: Verification & Monitoring ═══');
    const phase1Result = await executePhase1(clients, { minSeedingTime, minRatio }, { dryRun: phase1DryRun, existingMetadata }, log);

    // ── Phase 2: Retention & Cleanup ──
    // Skipped entirely for metadata-only runs. Rematch All must never
    // transition torrents to fordeletion or run cleanup.
    let phase2Result = { processed: 0, transitioned: 0, errors: 0, details: [] };
    if (metadataOnly) {
      log('info', 'engine', '═══ Phase 2 skipped (metadata-only run) ═══');
    } else {
      log('info', 'engine', '═══ Phase 2: Retention & Cleanup ═══');
      phase2Result = await executePhase2(clients, { minSeedingTime, minRatio }, { dryRun }, log);
    }

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
    currentRunType = null;
    
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
