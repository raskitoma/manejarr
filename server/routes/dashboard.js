import { Router } from 'express';
import { createDelugeClient } from '../clients/deluge.js';
import { createRadarrClient } from '../clients/radarr.js';
import { createSonarrClient } from '../clients/sonarr.js';
import { getSetting, getRunLogs } from '../db/database.js';
import { decrypt } from '../crypto/encryption.js';
import { getRunStatus } from '../engine/orchestrator.js';
import { getConnectionStatus } from '../monitors/healthCheck.js';

const router = Router();

/**
 * GET /api/dashboard
 * Returns aggregated dashboard data: torrents, stats, connections.
 */
router.get('/', async (req, res) => {
  try {
    // Build Deluge client
    const delugeHost = getSetting('deluge_host');
    const delugePort = getSetting('deluge_port');
    const delugePassword = getSetting('deluge_password');

    if (!delugeHost || !delugePassword) {
      return res.json({
        configured: false,
        torrents: [],
        stats: { mediaCount: 0, ignoreCount: 0, forDeletionCount: 0 },
      });
    }

    const deluge = createDelugeClient({
      host: delugeHost,
      port: parseInt(delugePort, 10) || 8112,
      password: decrypt(delugePassword),
    });

    await deluge.connect();

    // Fetch torrents by label
    const [mediaTorrents, ignoreTorrents, forDeletionTorrents] = await Promise.all([
      deluge.getTorrentsByLabel('media'),
      deluge.getTorrentsByLabel('ignore'),
      deluge.getTorrentsByLabel('fordeletion'),
    ]);

    const allTorrents = [
      ...mediaTorrents,
      ...ignoreTorrents,
      ...forDeletionTorrents,
    ];

    // Get last run info
    const recentRuns = getRunLogs(1, 1);
    const lastRun = recentRuns.rows.length > 0 ? recentRuns.rows[0] : null;

    // Get run status
    const runStatus = getRunStatus();

    res.json({
      configured: true,
      torrents: allTorrents,
      stats: {
        mediaCount: mediaTorrents.length,
        ignoreCount: ignoreTorrents.length,
        forDeletionCount: forDeletionTorrents.length,
        lastRunAt: lastRun?.finished_at || null,
        lastRunStatus: lastRun?.status || null,
      },
      runStatus,
    });
  } catch (err) {
    console.error('[DASHBOARD] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/dashboard/connections
 * Returns cached connection status from the health monitor.
 * The health monitor checks every 15 minutes and on startup.
 */
router.get('/connections', (req, res) => {
  const status = getConnectionStatus();
  res.json(status);
});

export default router;
