import { Router } from 'express';
import { createDelugeClient } from '../clients/deluge.js';
import { createRadarrClient } from '../clients/radarr.js';
import { createSonarrClient } from '../clients/sonarr.js';
import { getSetting, getRunLogs, getAllTorrentMetadata } from '../db/database.js';
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

    // Get persistent metadata for all known torrents
    const persistentMetadata = getAllTorrentMetadata();
    
    // Get last run info for recent reasons/actions
    const recentRuns = getRunLogs(1, 5); 
    const lastRun = recentRuns.rows.find(r => r.status === 'success' && r.summary);
    
    let recentDetails = {};
    if (lastRun && lastRun.summary) {
      try {
        const summary = JSON.parse(lastRun.summary);
        const details = [
          ...(summary.phase1?.details || []),
          ...(summary.phase2?.details || [])
        ];
        
        details.forEach(detail => {
          if (detail.hash) {
            recentDetails[detail.hash] = {
              action: detail.action,
              reason: detail.reason
            };
          }
        });
      } catch (err) {
        console.error('[DASHBOARD] Failed to parse last run summary:', err.message);
      }
    }
    
    // Base URLs for manager links
    const radarrBase = `http://${getSetting('radarr_host')}:${getSetting('radarr_port') || 7878}`;
    const sonarrBase = `http://${getSetting('sonarr_host')}:${getSetting('sonarr_port') || 8989}`;

    // Enrich torrents
    const enrichedTorrents = allTorrents.map(t => {
      const pm = persistentMetadata[t.hash] || {};
      const rd = recentDetails[t.hash] || {};
      
      let managerUrl = null;
      if (pm.metadata?.managerUrl) {
        managerUrl = pm.manager === 'radarr' ? `${radarrBase}${pm.metadata.managerUrl}` : `${sonarrBase}${pm.metadata.managerUrl}`;
      }

      return {
        ...t,
        manager: pm.manager || null,
        title: pm.title || null,
        metadata: pm.metadata || null,
        action: rd.action || null,
        reason: rd.reason || null,
        managerUrl: managerUrl
      };
    });

    // Get run status
    const runStatus = getRunStatus();

    // Get connection info (minimal, for manager identification)
    const connectionInfo = {
      radarr: { active: !!getSetting('radarr_host') },
      sonarr: { active: !!getSetting('sonarr_host') }
    };

    res.json({
      configured: true,
      torrents: enrichedTorrents,
      connectionInfo,
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
 * GET /api/dashboard/proxy-image
 * Proxies image requests to Radarr/Sonarr. 
 * Prevents API key exposure and bypasses network restrictions.
 */
router.get('/proxy-image', async (req, res) => {
  try {
    const { manager, url } = req.query;

    if (!manager || !url) {
      return res.status(400).json({ error: 'Missing manager or url' });
    }

    // Build client based on manager
    let client;
    const host = getSetting(`${manager}_host`);
    const port = getSetting(`${manager}_port`) || (manager === 'radarr' ? 7878 : 8989);
    const apiKey = decrypt(getSetting(`${manager}_api_key`) || '');

    if (!host || !apiKey) {
      return res.status(500).json({ error: 'Service not configured' });
    }

    if (manager === 'radarr') {
      client = createRadarrClient({ host, port, apiKey });
    } else if (manager === 'sonarr') {
      client = createSonarrClient({ host, port, apiKey });
    } else {
      return res.status(400).json({ error: 'Invalid manager' });
    }

    // Forward the request to the *arr instance
    // Note: url already contains the path including api/v3/mediacover if from metadata
    // We strip /api/v3 if it's dual-included by the client request helper
    const targetUrl = url.replace(/^\/api\/v3/, '');
    const response = await client.requestRaw(targetUrl);

    if (!response.ok) {
      return res.status(response.status).send('Failed to fetch image from service');
    }

    // Set headers and pipe response
    res.set('Content-Type', response.headers.get('Content-Type'));
    res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24h
    
    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));

  } catch (err) {
    console.error('[PROXY] Error:', err.message);
    res.status(500).send('Internal Server Error');
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
