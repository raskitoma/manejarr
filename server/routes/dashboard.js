import { Router } from 'express';
import { createDelugeClient } from '../clients/deluge.js';
import { createRadarrClient } from '../clients/radarr.js';
import { createSonarrClient } from '../clients/sonarr.js';
import { createLidarrClient } from '../clients/lidarr.js';
import { getSetting, getRunLogs, getAllTorrentMetadata, insertEventLog } from '../db/database.js';
import { decrypt } from '../crypto/encryption.js';
import { getRunStatus } from '../engine/orchestrator.js';
import { getConnectionStatus } from '../monitors/healthCheck.js';

const router = Router();

// Working (pre-processing) labels: torrents Deluge hands off with an *arr
// download-client label, before Phase 1 relabels them to 'ignore'. Historically
// just 'media' (shared by Radarr+Sonarr); the per-app split adds 'radarr'/'sonarr'.
// All are surfaced together as the dashboard's "media"/working bucket so split-
// labeled torrents stay visible before Phase 1 processes them.
const WORKING_LABELS = ['media', 'radarr', 'sonarr'];

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

    // Fetch all relevant torrents in one optimized step to prevent massive payload transmission and timeouts on Deluge WebUI
    const delugeTorrents = await deluge.getTorrentsByLabels([...WORKING_LABELS, 'ignore', 'fordeletion']);
    // "media" bucket = any working label (media/radarr/sonarr), i.e. matched-but-not-yet-processed torrents
    const mediaTorrents = delugeTorrents.filter(t => WORKING_LABELS.includes(t.label));
    const ignoreTorrents = delugeTorrents.filter(t => t.label === 'ignore');
    const forDeletionTorrents = delugeTorrents.filter(t => t.label === 'fordeletion');

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
        insertEventLog(null, 'warn', 'dashboard', `Failed to parse last run summary: ${err.message}`);
      }
    }
    
    // Base URLs for manager links
    const radarrBase = `http://${getSetting('radarr_host')}:${getSetting('radarr_port') || 7878}`;
    const sonarrBase = `http://${getSetting('sonarr_host')}:${getSetting('sonarr_port') || 8989}`;
    const lidarrBase = `http://${getSetting('lidarr_host')}:${getSetting('lidarr_port') || 8686}`;
    const baseByManager = { radarr: radarrBase, sonarr: sonarrBase, lidarr: lidarrBase };

    // Enrich torrents
    const enrichedTorrents = allTorrents.map(t => {
      const pm = persistentMetadata[t.hash] || {};
      const rd = recentDetails[t.hash] || {};

      let managerUrl = null;
      if (pm.metadata?.managerUrl && baseByManager[pm.manager]) {
        managerUrl = `${baseByManager[pm.manager]}${pm.metadata.managerUrl}`;
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
      sonarr: { active: !!getSetting('sonarr_host') },
      lidarr: { active: !!getSetting('lidarr_host') }
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
    insertEventLog(null, 'error', 'dashboard', `Dashboard error: ${err.message}`, { stack: err.stack });
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/dashboard/poster?manager=sonarr|radarr&id=123
 *
 * Live-fetch fallback for the poster of a matched item. Used by the row
 * action menu when the persisted metadata.images array is empty (older
 * matches saved before images were persisted, or items where the *arr's
 * MediaCover URL has rotated). Calls getMovie/getSeriesById, picks the
 * poster image, and pipes it via the existing proxy logic — falling back
 * to the remote (TMDB/TVDB) CDN URL if the *arr's local cache 404s.
 */
router.get('/poster', async (req, res) => {
  try {
    const { manager, id } = req.query;
    if (!manager || !id) return res.status(400).json({ error: 'Missing manager or id' });

    const host = getSetting(`${manager}_host`);
    const port = getSetting(`${manager}_port`) || (manager === 'radarr' ? 7878 : manager === 'lidarr' ? 8686 : 8989);
    const apiKey = decrypt(getSetting(`${manager}_api_key`) || '');
    if (!host || !apiKey) return res.status(404).send('Service not configured');

    let images = null;
    if (manager === 'radarr') {
      const client = createRadarrClient({ host, port, apiKey });
      const movie = await client.getMovie(parseInt(id, 10));
      images = movie?.images || [];
      const poster = images.find(i => i.coverType === 'poster') || images.find(i => i.coverType === 'fanart');
      if (!poster) return res.status(404).send('No poster available');
      const targetUrl = (poster.url || '').replace(/^\/api\/v3/, '');
      if (targetUrl) {
        try {
          const r = await client.requestRaw(targetUrl);
          if (r.ok) {
            res.set('Content-Type', r.headers.get('Content-Type') || 'image/jpeg');
            res.set('Cache-Control', 'public, max-age=86400');
            const buf = await r.arrayBuffer();
            return res.send(Buffer.from(buf));
          }
        } catch (e) { /* fall through to remoteUrl */ }
      }
      // Fall back to the TMDB CDN remoteUrl — no API key required.
      if (poster.remoteUrl) return res.redirect(poster.remoteUrl);
      return res.status(404).send('No poster available');
    }

    if (manager === 'sonarr') {
      const client = createSonarrClient({ host, port, apiKey });
      const series = await client.getSeriesById(parseInt(id, 10));
      images = series?.images || [];
      const poster = images.find(i => i.coverType === 'poster') || images.find(i => i.coverType === 'fanart');
      if (!poster) return res.status(404).send('No poster available');
      const targetUrl = (poster.url || '').replace(/^\/api\/v3/, '');
      if (targetUrl) {
        try {
          const r = await client.requestRaw(targetUrl);
          if (r.ok) {
            res.set('Content-Type', r.headers.get('Content-Type') || 'image/jpeg');
            res.set('Cache-Control', 'public, max-age=86400');
            const buf = await r.arrayBuffer();
            return res.send(Buffer.from(buf));
          }
        } catch (e) { /* fall through to remoteUrl */ }
      }
      // Fall back to the TVDB CDN remoteUrl — no API key required.
      if (poster.remoteUrl) return res.redirect(poster.remoteUrl);
      return res.status(404).send('No poster available');
    }

    if (manager === 'lidarr') {
      const client = createLidarrClient({ host, port, apiKey });
      const artist = await client.getArtistById(parseInt(id, 10));
      images = artist?.images || [];
      const poster = images.find(i => i.coverType === 'poster') || images.find(i => i.coverType === 'fanart');
      if (!poster) return res.status(404).send('No poster available');
      const targetUrl = (poster.url || '').replace(/^\/api\/v1/, '');
      if (targetUrl) {
        try {
          const r = await client.requestRaw(targetUrl);
          if (r.ok) {
            res.set('Content-Type', r.headers.get('Content-Type') || 'image/jpeg');
            res.set('Cache-Control', 'public, max-age=86400');
            const buf = await r.arrayBuffer();
            return res.send(Buffer.from(buf));
          }
        } catch (e) { /* fall through to remoteUrl */ }
      }
      // Fall back to the MusicBrainz/fanart CDN remoteUrl — no API key required.
      if (poster.remoteUrl) return res.redirect(poster.remoteUrl);
      return res.status(404).send('No poster available');
    }

    return res.status(400).json({ error: 'Invalid manager' });
  } catch (err) {
    console.error('[POSTER] Error:', err.message);
    insertEventLog(null, 'error', 'dashboard', `Poster fetch error: ${err.message}`, { stack: err.stack });
    res.status(500).send('Internal Server Error');
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
    const port = getSetting(`${manager}_port`) || (manager === 'radarr' ? 7878 : manager === 'lidarr' ? 8686 : 8989);
    const apiKey = decrypt(getSetting(`${manager}_api_key`) || '');

    if (!host || !apiKey) {
      return res.status(500).json({ error: 'Service not configured' });
    }

    if (manager === 'radarr') {
      client = createRadarrClient({ host, port, apiKey });
    } else if (manager === 'sonarr') {
      client = createSonarrClient({ host, port, apiKey });
    } else if (manager === 'lidarr') {
      client = createLidarrClient({ host, port, apiKey });
    } else {
      return res.status(400).json({ error: 'Invalid manager' });
    }

    // Forward the request to the *arr instance
    // Note: url already contains the path including api/vN/mediacover if from metadata
    // We strip the /api/vN prefix if it's dual-included by the client request helper
    // (v3 for Radarr/Sonarr, v1 for Lidarr).
    const targetUrl = url.replace(/^\/api\/v[13]/, '');
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
    insertEventLog(null, 'error', 'dashboard', `Proxy image error: ${err.message}`, { stack: err.stack });
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
