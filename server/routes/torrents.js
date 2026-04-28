import { Router } from 'express';
import { updateTorrentMetadata, getSetting } from '../db/database.js';
import { createRadarrClient } from '../clients/radarr.js';
import { createSonarrClient } from '../clients/sonarr.js';
import { decrypt } from '../crypto/encryption.js';

export const torrentsRouter = Router();

/**
 * GET /api/torrents/search?q=<term>
 * Searches both Radarr and Sonarr for matching media by name.
 * Returns combined results tagged with their source manager.
 */
torrentsRouter.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.json({ results: [] });
    }

    const results = [];

    // Try Radarr
    const radarrHost = getSetting('radarr_host');
    const radarrApiKey = getSetting('radarr_api_key');
    if (radarrHost && radarrApiKey) {
      try {
        const radarr = createRadarrClient({
          host: radarrHost,
          port: parseInt(getSetting('radarr_port'), 10) || 7878,
          apiKey: decrypt(radarrApiKey),
        });
        const movies = await radarr.searchMovies(q.trim());
        results.push(...movies.map(m => ({ ...m, manager: 'radarr' })));
      } catch (err) {
        console.warn('[SEARCH] Radarr search failed:', err.message);
      }
    }

    // Try Sonarr
    const sonarrHost = getSetting('sonarr_host');
    const sonarrApiKey = getSetting('sonarr_api_key');
    if (sonarrHost && sonarrApiKey) {
      try {
        const sonarr = createSonarrClient({
          host: sonarrHost,
          port: parseInt(getSetting('sonarr_port'), 10) || 8989,
          apiKey: decrypt(sonarrApiKey),
        });
        const series = await sonarr.searchSeries(q.trim());
        results.push(...series.map(s => ({ ...s, manager: 'sonarr' })));
      } catch (err) {
        console.warn('[SEARCH] Sonarr search failed:', err.message);
      }
    }

    // Sort: in-library items first, then alphabetically
    results.sort((a, b) => {
      if (a.inLibrary && !b.inLibrary) return -1;
      if (!a.inLibrary && b.inLibrary) return 1;
      return a.title.localeCompare(b.title);
    });

    res.json({ results: results.slice(0, 30) });
  } catch (err) {
    console.error('[SEARCH] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/torrents/:hash/match
 * Manually link a torrent to a Radarr movie or Sonarr series.
 */
torrentsRouter.post('/:hash/match', async (req, res) => {
  try {
    const { hash } = req.params;
    const { manager, id, title } = req.body;
    
    if (!hash || !manager || !id) {
      return res.status(400).json({ error: 'Missing hash, manager, or id' });
    }
    
    if (manager !== 'radarr' && manager !== 'sonarr') {
      return res.status(400).json({ error: 'Invalid manager. Must be radarr or sonarr' });
    }
    
    updateTorrentMetadata(hash, {
      manager,
      title: title || `Manual Match (${manager} ID: ${id})`,
      metadata: {
        manualMatchId: parseInt(id, 10),
      }
    });
    
    res.json({ success: true, message: 'Torrent manually linked successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
