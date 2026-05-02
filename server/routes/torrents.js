import { Router } from 'express';
import { updateTorrentMetadata, deleteTorrentMetadata, clearAllTorrentMetadata, getAllTorrentMetadata, getSetting } from '../db/database.js';
import { runFull, getRunStatus } from '../engine/orchestrator.js';
import { createRadarrClient } from '../clients/radarr.js';
import { createSonarrClient } from '../clients/sonarr.js';
import { decrypt } from '../crypto/encryption.js';
import { extractSeriesBase, isSeriesPattern, isMoviePattern } from '../utils/seriesParser.js';
import { buildRadarrMetadata, buildSonarrMetadata } from '../utils/metadataBuilders.js';

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

    // Metadata-only run: re-discover matches and refresh persisted metadata
    // for every torrent. NO Deluge relabel, NO *arr unmonitor, NO Phase 2.
    // Rematch All must never trigger the side effects that Run Now does.
    const runPromise = runFull({
      metadataOnly: true,
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

    // Build a full metadata block (with images / infoUrl / managerUrl) so the
    // dashboard hover card shows the poster immediately, before the next run.
    let primaryMetadata = { manualMatchId: mediaId };
    let resolvedTitle = title;
    try {
      if (manager === 'radarr') {
        const radarrHost = getSetting('radarr_host');
        const radarrApiKey = getSetting('radarr_api_key');
        if (radarrHost && radarrApiKey) {
          const radarr = createRadarrClient({
            host: radarrHost,
            port: parseInt(getSetting('radarr_port'), 10) || 7878,
            apiKey: decrypt(radarrApiKey),
          });
          const movie = await radarr.getMovie(mediaId);
          if (movie) {
            primaryMetadata = { ...buildRadarrMetadata(movie), manualMatchId: mediaId };
            resolvedTitle = resolvedTitle || movie.title;
          }
        }
      } else {
        const sonarrHost = getSetting('sonarr_host');
        const sonarrApiKey = getSetting('sonarr_api_key');
        if (sonarrHost && sonarrApiKey) {
          const sonarr = createSonarrClient({
            host: sonarrHost,
            port: parseInt(getSetting('sonarr_port'), 10) || 8989,
            apiKey: decrypt(sonarrApiKey),
          });
          const series = await sonarr.getSeriesById(mediaId);
          if (series) {
            primaryMetadata = { ...buildSonarrMetadata(series), manualMatchId: mediaId };
            resolvedTitle = resolvedTitle || series.title;
          }
        }
      }
    } catch (err) {
      // Best-effort enrichment — fall back to the bare manualMatchId if it fails
      console.warn('[MATCH] Metadata enrichment failed:', err.message);
    }

    // Save the primary match
    updateTorrentMetadata(hash, {
      manager,
      title: resolvedTitle || `Manual Match (${manager} ID: ${mediaId})`,
      metadata: primaryMetadata,
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
                    title: resolvedTitle || `Auto Match (sonarr ID: ${mediaId})`,
                    metadata: primaryMetadata,
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

/**
 * POST /api/torrents/:hash/rematch
 * Run the matching pipeline for a single torrent without doing a full
 * orchestration run: clears any cached match, then tries hash lookup,
 * filename parse, and series-base grouping (against other already-matched
 * Sonarr torrents). Saves the new metadata if anything sticks.
 */
torrentsRouter.post('/:hash/rematch', async (req, res) => {
  try {
    const { hash } = req.params;
    if (!hash) {
      return res.status(400).json({ error: 'Missing hash' });
    }

    // Need Deluge to look up the torrent's name (and to seed the series-base map)
    const delugeHost = getSetting('deluge_host');
    const delugePassword = getSetting('deluge_password');
    if (!delugeHost || !delugePassword) {
      return res.status(400).json({ error: 'Deluge is not configured' });
    }

    const radarrHost = getSetting('radarr_host');
    const radarrApiKey = getSetting('radarr_api_key');
    const sonarrHost = getSetting('sonarr_host');
    const sonarrApiKey = getSetting('sonarr_api_key');

    const { createDelugeClient } = await import('../clients/deluge.js');
    const deluge = createDelugeClient({
      host: delugeHost,
      port: parseInt(getSetting('deluge_port'), 10) || 8112,
      password: decrypt(delugePassword),
    });
    await deluge.connect();

    const torrent = await deluge.getTorrentDetails(hash);
    if (!torrent) {
      return res.status(404).json({ error: 'Torrent not found in Deluge' });
    }

    const radarr = (radarrHost && radarrApiKey)
      ? createRadarrClient({
          host: radarrHost,
          port: parseInt(getSetting('radarr_port'), 10) || 7878,
          apiKey: decrypt(radarrApiKey),
        })
      : null;

    const sonarr = (sonarrHost && sonarrApiKey)
      ? createSonarrClient({
          host: sonarrHost,
          port: parseInt(getSetting('sonarr_port'), 10) || 8989,
          apiKey: decrypt(sonarrApiKey),
        })
      : null;

    // Wipe any prior match so a stale id doesn't poison the same-series map
    deleteTorrentMetadata(hash);

    // Pattern-based routing so a series-shaped name (S01E05, 1x05, etc.)
    // never gets handed to Radarr's lookup/parser, which is greedy and will
    // happily map "Greys.Anatomy.S22E17" to some unrelated movie title.
    const seriesShape = isSeriesPattern(torrent.name);
    const movieShape = isMoviePattern(torrent.name);
    const allowRadarr = !!radarr && !seriesShape;
    const allowSonarr = !!sonarr && !movieShape;

    let matched = null; // { manager, title, metadata }

    // 1. Hash → Radarr (with sourceTitle history fallback)
    if (!matched && allowRadarr) {
      try {
        const movieMatch = await radarr.getMovieByHash(hash, torrent.name);
        if (movieMatch?.movieId) {
          const movie = await radarr.getMovie(movieMatch.movieId);
          matched = {
            manager: 'radarr',
            title: movie.title,
            metadata: { ...buildRadarrMetadata(movie), source: movieMatch.source || 'hash' },
          };
        }
      } catch (err) {
        console.warn('[REMATCH] Radarr hash lookup failed:', err.message);
      }
    }

    // 2. Hash → Sonarr (with sourceTitle history fallback)
    if (!matched && allowSonarr) {
      try {
        const epMatch = await sonarr.getEpisodesByHash(hash, torrent.name);
        if (epMatch?.seriesId) {
          const series = epMatch.series || await sonarr.getSeriesById(epMatch.seriesId);
          matched = {
            manager: 'sonarr',
            title: series.title,
            metadata: { ...buildSonarrMetadata(series), source: epMatch.source || 'hash' },
          };
        }
      } catch (err) {
        console.warn('[REMATCH] Sonarr hash lookup failed:', err.message);
      }
    }

    // 2b. Download path → Radarr/Sonarr history.
    // Tertiary authoritative tie: the path Radarr/Sonarr reported when
    // handing the download to Deluge should contain the torrent name.
    if (!matched && allowRadarr) {
      try {
        const pathMatch = await radarr.findMovieByPath(torrent.name);
        if (pathMatch?.movieId) {
          const movie = await radarr.getMovie(pathMatch.movieId);
          matched = {
            manager: 'radarr',
            title: movie.title,
            metadata: { ...buildRadarrMetadata(movie), source: pathMatch.source },
          };
        }
      } catch (err) {
        console.warn('[REMATCH] Radarr path lookup failed:', err.message);
      }
    }

    if (!matched && allowSonarr) {
      try {
        const pathMatch = await sonarr.findEpisodesByPath(torrent.name);
        if (pathMatch?.seriesId) {
          const series = await sonarr.getSeriesById(pathMatch.seriesId);
          matched = {
            manager: 'sonarr',
            title: series.title,
            metadata: { ...buildSonarrMetadata(series), source: pathMatch.source },
          };
        }
      } catch (err) {
        console.warn('[REMATCH] Sonarr path lookup failed:', err.message);
      }
    }

    // 3. Filename parse → Radarr
    if (!matched && allowRadarr) {
      try {
        const parsed = await radarr.parseFilename(torrent.name);
        if (parsed?.movie?.id) {
          const movieFiles = await radarr.getMovieFiles(parsed.movie.id);
          if (movieFiles && movieFiles.length > 0) {
            const movie = await radarr.getMovie(parsed.movie.id);
            matched = {
              manager: 'radarr',
              title: movie.title,
              metadata: { ...buildRadarrMetadata(movie), source: 'parse' },
            };
          }
        }
      } catch (err) {
        console.warn('[REMATCH] Radarr parse failed:', err.message);
      }
    }

    // 4. Filename parse → Sonarr
    if (!matched && allowSonarr) {
      try {
        const parsed = await sonarr.parseFilename(torrent.name);
        if (parsed?.series?.id) {
          const series = await sonarr.getSeriesById(parsed.series.id);
          matched = {
            manager: 'sonarr',
            title: series.title,
            metadata: { ...buildSonarrMetadata(series), source: 'parse' },
          };
        }
      } catch (err) {
        console.warn('[REMATCH] Sonarr parse failed:', err.message);
      }
    }

    // 5. Series-base grouping fallback (Sonarr only)
    if (!matched && allowSonarr) {
      const base = extractSeriesBase(torrent.name);
      if (base) {
        try {
          const allTorrents = await deluge.getAllTorrents();
          const existingMetadata = getAllTorrentMetadata();
          for (const other of allTorrents) {
            if (other.hash === hash) continue;
            const cached = existingMetadata[other.hash];
            if (!cached || cached.manager !== 'sonarr') continue;
            const seriesId = cached.metadata?.manualMatchId || cached.metadata?.id;
            if (!seriesId) continue;
            if (extractSeriesBase(other.name) !== base) continue;

            const series = await sonarr.getSeriesById(seriesId);
            matched = {
              manager: 'sonarr',
              title: series.title,
              metadata: { ...buildSonarrMetadata(series), manualMatchId: seriesId, source: 'series-base' },
            };
            break;
          }
        } catch (err) {
          console.warn('[REMATCH] Series-base fallback failed:', err.message);
        }
      }
    }

    if (!matched) {
      return res.json({
        success: true,
        matched: false,
        message: 'No match found via hash, filename parse, or series-base grouping.',
      });
    }

    updateTorrentMetadata(hash, {
      manager: matched.manager,
      title: matched.title,
      metadata: matched.metadata,
    });

    res.json({
      success: true,
      matched: true,
      manager: matched.manager,
      title: matched.title,
      source: matched.metadata.source,
      message: `Matched to ${matched.title} via ${matched.metadata.source}`,
    });
  } catch (err) {
    console.error('[REMATCH] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
