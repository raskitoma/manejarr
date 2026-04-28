/**
 * Connection Health Monitor
 *
 * Runs every 15 minutes to check connectivity to Deluge, Radarr, and Sonarr.
 * Sends a notification if any connection is lost (one-shot alert, resets on recovery).
 */

import cron from 'node-cron';
import { getSetting } from '../db/database.js';
import { decrypt } from '../crypto/encryption.js';
import { createDelugeClient } from '../clients/deluge.js';
import { createRadarrClient } from '../clients/radarr.js';
import { createSonarrClient } from '../clients/sonarr.js';
import { notifyRunComplete } from '../notifications/notifier.js';

// Track previous alert state to avoid repeated alerts
const alertState = {
  deluge: { down: false, lastCheck: null },
  radarr: { down: false, lastCheck: null },
  sonarr: { down: false, lastCheck: null },
};

// Current connection status (readable by dashboard)
let currentStatus = {
  deluge: { connected: false, error: null, version: null, lastCheck: null, labels: [] },
  radarr: { connected: false, error: null, version: null, lastCheck: null },
  sonarr: { connected: false, error: null, version: null, lastCheck: null },
};

/**
 * Get the current cached connection status.
 */
export function getConnectionStatus() {
  return { ...currentStatus };
}

/**
 * Run a health check on all configured services.
 */
export async function runHealthCheck() {
  const now = new Date().toISOString();
  console.log(`[HEALTH] Starting health check at ${now}...`);
  
  const newlyDown = [];
  const recovered = [];

  // ── Deluge ──
  try {
    const host = getSetting('deluge_host');
    const port = getSetting('deluge_port');
    const password = getSetting('deluge_password');

    if (host && password) {
      const client = createDelugeClient({
        host,
        port: parseInt(port, 10) || 8112,
        password: decrypt(password),
      });
      const info = await client.testConnection();
      const labels = await client.getLabels();
      currentStatus.deluge = { connected: true, version: info.version, error: null, lastCheck: now, labels };

      if (alertState.deluge.down) {
        recovered.push('Deluge');
        alertState.deluge.down = false;
      }
    } else {
      currentStatus.deluge = { connected: false, error: 'Not configured', lastCheck: now };
    }
  } catch (err) {
    currentStatus.deluge = { connected: false, error: err.message, lastCheck: now };
    if (!alertState.deluge.down) {
      newlyDown.push({ service: 'Deluge', error: err.message });
      alertState.deluge.down = true;
    }
  }

  // ── Radarr ──
  try {
    const host = getSetting('radarr_host');
    const port = getSetting('radarr_port');
    const apiKey = getSetting('radarr_api_key');

    if (host && apiKey) {
      const client = createRadarrClient({
        host,
        port: parseInt(port, 10) || 7878,
        apiKey: decrypt(apiKey),
      });
      const info = await client.testConnection();
      currentStatus.radarr = { connected: true, version: info.version, error: null, lastCheck: now };

      if (alertState.radarr.down) {
        recovered.push('Radarr');
        alertState.radarr.down = false;
      }
    } else {
      currentStatus.radarr = { connected: false, error: 'Not configured', lastCheck: now };
    }
  } catch (err) {
    currentStatus.radarr = { connected: false, error: err.message, lastCheck: now };
    if (!alertState.radarr.down) {
      newlyDown.push({ service: 'Radarr', error: err.message });
      alertState.radarr.down = true;
    }
  }

  // ── Sonarr ──
  try {
    const host = getSetting('sonarr_host');
    const port = getSetting('sonarr_port');
    const apiKey = getSetting('sonarr_api_key');

    if (host && apiKey) {
      const client = createSonarrClient({
        host,
        port: parseInt(port, 10) || 8989,
        apiKey: decrypt(apiKey),
      });
      const info = await client.testConnection();
      currentStatus.sonarr = { connected: true, version: info.version, error: null, lastCheck: now };

      if (alertState.sonarr.down) {
        recovered.push('Sonarr');
        alertState.sonarr.down = false;
      }
    } else {
      currentStatus.sonarr = { connected: false, error: 'Not configured', lastCheck: now };
    }
  } catch (err) {
    currentStatus.sonarr = { connected: false, error: err.message, lastCheck: now };
    if (!alertState.sonarr.down) {
      newlyDown.push({ service: 'Sonarr', error: err.message });
      alertState.sonarr.down = true;
    }
  }

  // Send alert notification if any service just went down
  if (newlyDown.length > 0) {
    const alertSummary = {
      runType: 'health-check',
      alert: true,
      phase1: { processed: 0, matched: 0, unmatched: 0, relabeled: 0, errors: newlyDown.length },
      phase2: { processed: 0, transitioned: 0, retained: 0, errors: 0 },
      totals: { processed: 0, actions: 0, errors: newlyDown.length },
      healthAlert: {
        down: newlyDown,
        recovered: [],
      },
    };
    try {
      await notifyRunComplete(alertSummary);
    } catch (e) {
      console.error('[HEALTH] Failed to send alert notification:', e.message);
    }
  }

  // Notify on recovery too
  if (recovered.length > 0) {
    console.log(`[HEALTH] Services recovered: ${recovered.join(', ')}`);
  }

  console.log(`[HEALTH] Check complete: Deluge=${currentStatus.deluge.connected}, Radarr=${currentStatus.radarr.connected}, Sonarr=${currentStatus.sonarr.connected}`);
}

/**
 * Reset alert state for a service (called when user acknowledges).
 */
export function resetAlert(service) {
  if (alertState[service]) {
    alertState[service].down = false;
  }
}

/**
 * Start the health monitor cron (every 15 minutes).
 */
export function startHealthMonitor() {
  // Run immediately on startup
  runHealthCheck().catch(err => console.error('[HEALTH] Initial check failed:', err.message));

  // Schedule every 15 minutes
  cron.schedule('*/15 * * * *', () => {
    console.log('[HEALTH] Running scheduled health check...');
    runHealthCheck().catch(err => console.error('[HEALTH] Scheduled check failed:', err.message));
  }, {
    timezone: process.env.TZ || 'UTC',
  });

  console.log('[HEALTH] Monitor started (Interval: 15m)');
}
