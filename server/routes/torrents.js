import { Router } from 'express';
import { updateTorrentMetadata, deleteTorrentMetadata, clearAllTorrentMetadata, getAllTorrentMetadata, getSetting } from '../db/database.js';
import { runFull, getRunStatus } from '../engine/orchestrator.js';
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
 * POST /api/torrents/rematch-all
 * Clears all cached torrent metadata and triggers a fresh orchestration run.
 * This forces re-matching of ALL torrents against Radarr/Sonarr.
 * IMPORTANT: This static route must be defined BEFORE the /:hash param routes.
 */
torrentsRouter.post('/rematch-all', async (req, res) => {
  try {
    // Check if already running
    const status = getRunStatus();
    if (status.running) {
      return res.status(409).json({
        error: 'A run is already in progress. Please wait for it to complete.',
        runId: status.runId,
      });
    }

    // Clear all cached metadata so the next run re-discovers everything
    const cleared = clearAllTorrentMetadata();

    // Start a fresh run (non-blocking)
    const runPromise = runFull({
      dryRun: false,
      runType: 'manual',
    });

    res.json({
      success: true,
      message: `Cleared ${cleared.deleted} cached match(es). Fresh matching run started.`,
      cleared: cleared.deleted,
    });

    // Let the run continue in the background
    runPromise.catch(err => {
      console.error('[REMATCH-ALL] Background run failed:', err.message);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/torrents/:hash/match
 * Manually link a torrent to a Radarr movie or Sonarr series.
 * For Sonarr series: also auto-matches other unmatched torrents that appear to be
 * from the same series (e.g., other episodes from the same season).
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
    
    const mediaId = parseInt(id, 10);
    
    // Save the primary match
    updateTorrentMetadata(hash, {
      manager,
      title: title || `Manual Match (${manager} ID: ${mediaId})`,
      metadata: {
        manualMatchId: mediaId,
      }
    });
    
    let alsoMatched = 0;
    
    // For Sonarr series: try to auto-match related episode torrents
    if (manager === 'sonarr') {
      try {
        // Build Deluge client to get all torrents
        const delugeHost = getSetting('deluge_host');
        const delugePassword = getSetting('deluge_password');
        
        if (delugeHost && delugePassword) {
          const { createDelugeClient } = await import('../clients/deluge.js');
          const deluge = createDelugeClient({
            host: delugeHost,
            port: parseInt(getSetting('deluge_port'), 10) || 8112,
            password: decrypt(delugePassword),
          });
          
          await deluge.connect();
          const allTorrents = await deluge.getAllTorrents();
          
          // Get the name of the matched torrent to extract the series pattern
          const matchedTorrent = allTorrents.find(t => t.hash === hash);
          if (matchedTorrent) {
            const seriesBase = extractSeriesBase(matchedTorrent.name);
            
            if (seriesBase) {
              // Get existing metadata to skip already-matched torrents
              const existingMetadata = getAllTorrentMetadata();
              
              for (const torrent of allTorrents) {
                // Skip the torrent we just matched and already-matched ones
                if (torrent.hash === hash) continue;
                if (existingMetadata[torrent.hash]) continue;
                
                // Check if this torrent shares the same series base name
                const otherBase = extractSeriesBase(torrent.name);
                if (otherBase && otherBase === seriesBase) {
                  updateTorrentMetadata(torrent.hash, {
                    manager: 'sonarr',
                    title: title || `Auto Match (sonarr ID: ${mediaId})`,
                    metadata: {
                      manualMatchId: mediaId,
                    }
                  });
                  alsoMatched++;
                }
              }
            }
          }
        }
      } catch (err) {
        // Auto-matching is best-effort — don't fail the primary match
        console.warn('[MATCH] Auto-match related episodes failed:', err.message);
      }
    }
    
    const message = alsoMatched > 0
      ? `Linked successfully. Also matched ${alsoMatched} related episode(s) from the same series.`
      : 'Torrent manually linked successfully';
    
    res.json({ success: true, message, alsoMatched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Extract the base series name from a torrent filename.
 * Strips episode identifiers (S01E05, etc.), quality tags, and release group info
 * to get just the series name for comparison.
 * 
 * Examples:
 *   "The Boss 2022 S04E07 The Bosses House 1080p" → "the boss 2022"
 *   "Greys.Anatomy.S22E17.1080p.WEB.h264" → "greys anatomy"
 */
function extractSeriesBase(name) {
  if (!name) return null;
  
  const cleaned = name
    // Replace dots, underscores, hyphens with spaces
    .replace(/[\.\-_]/g, ' ')
    // Find where the season/episode marker starts and take everything before it
    .replace(/\b(S\d{1,2})(E\d{1,2})?\b.*/i, '')
    // Also handle "Season X" or "Complete" patterns
    .replace(/\b(Season|Complete|COMPLETE)\b.*/i, '')
    // Remove year in parentheses but keep standalone years (they help identify the series)
    .replace(/\((\d{4})\)/g, '$1')
    // Remove any remaining brackets
    .replace(/[\[\](){}]/g, '')
    // Collapse whitespace
    .replace(/\s{2,}/g, ' ')
    .trim()
    .toLowerCase();
  
  // Must have at least 2 characters to be useful
  return cleaned.length >= 2 ? cleaned : null;
}

/**
 * DELETE /api/torrents/:hash/match
 * Unlink a torrent from its current match so it can be re-matched.
 */
torrentsRouter.delete('/:hash/match', (req, res) => {
  try {
    const { hash } = req.params;
    if (!hash) {
      return res.status(400).json({ error: 'Missing hash' });
    }

    deleteTorrentMetadata(hash);
    res.json({ success: true, message: 'Torrent unlinked successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
