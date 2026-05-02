/**
 * Phase 1: Verification & Monitoring
 *
 * 1. Fetch all torrents labeled 'media' from Deluge
 * 2. Match each torrent against Radarr/Sonarr history by hash
 * 3. Verify quality meets the requested quality profile cutoff
 * 4. If matched & quality OK:
 *    - Radarr: Set movie to unmonitored
 *    - Sonarr: Set episode(s) to unmonitored (not the series)
 *    - Deluge: Relabel from 'media' to 'ignore'
 * 5. Torrents continue seeding after relabeling
 */

import { meetsQualityCutoff, getQualityName } from './quality.js';
import { extractSeriesBase, buildSeriesBaseMap, isSeriesPattern, isMoviePattern } from '../utils/seriesParser.js';
import { buildRadarrMetadata, buildSonarrMetadata } from '../utils/metadataBuilders.js';

/**
 * Execute Phase 1.
 *
 * @param {Object} clients - { deluge, radarr, sonarr }
 * @param {Object} options - { dryRun: boolean }
 * @param {Function} log - Logging callback: (level, category, message, metadata)
 * @returns {Object} - Summary of actions taken
 */
export async function executePhase1(clients, settings, options = {}, log) {
  const { deluge, radarr, sonarr } = clients;
  const { minSeedingTime = 259200, minRatio = 1.1 } = settings || {};
  const { dryRun = false, existingMetadata = {} } = options;

  const summary = {
    processed: 0,
    matched: 0,
    unmatched: 0,
    relabeled: 0,
    unmonitored: 0,
    errors: 0,
    details: [],
  };

  log('info', 'engine', 'Phase 1: Starting Verification & Monitoring');

  // 1. Fetch all torrents from Deluge
  let torrents = [];
  try {
    await deluge.connect();
    const allTorrents = await deluge.getAllTorrents();
    
    // Categorize torrents for processing
    // - 'media' or other labels: target for processing/relabeling
    // - 'ignore' or 'fordeletion': only gather metadata
    torrents = allTorrents.map(t => {
      if (t.label === 'ignore' || t.label === 'fordeletion') {
        t._target = 'metadata_only';
      } else {
        t._target = 'process';
      }
      return t;
    });
    
    log('info', 'deluge', `Fetched ${allTorrents.length} torrent(s) from Deluge`);
  } catch (err) {
    log('error', 'deluge', `Failed to fetch torrents: ${err.message}`);
    summary.errors++;
    return summary;
  }

  if (torrents.length === 0) {
    log('info', 'engine', 'No torrents labeled media, ignore or fordeletion. Phase 1 complete.');
    return summary;
  }

  // Build a series-base -> seriesId map from torrents that already have a cached
  // Sonarr match. This lets us match a brand-new episode-style torrent (e.g. the
  // next episode of an already-known series) without needing a Sonarr hash hit
  // or a successful filename parse. Map grows during the run as new matches land.
  const seriesBaseMap = buildSeriesBaseMap(torrents, existingMetadata);

  // Pre-fetch quality profiles for both services
  let radarrProfiles = {};
  let sonarrProfiles = {};

  try {
    const profiles = await radarr.getQualityProfiles();
    for (const p of profiles) radarrProfiles[p.id] = p;
  } catch (err) {
    log('warn', 'radarr', `Could not fetch quality profiles: ${err.message}`);
  }

  try {
    const profiles = await sonarr.getQualityProfiles();
    for (const p of profiles) sonarrProfiles[p.id] = p;
  } catch (err) {
    log('warn', 'sonarr', `Could not fetch quality profiles: ${err.message}`);
  }

  // 2. Process each torrent
  for (const torrent of torrents) {
    summary.processed++;

    try {
      let manager = null;
      let cached = existingMetadata?.[torrent.hash];

      // 2a. Cache shortcut — but ONLY for manual matches (explicit user
      // links via the manual-match modal). Auto-discovered matches are
      // re-validated through the full chain on every run so Run Now /
      // Dry Run produce identical results to Rematch All (which clears
      // the cache before running). Trusting cached auto matches without
      // re-validation was the bug: a torrent matched once via series-base
      // (or any other heuristic) would silently keep that match across
      // future runs even if the *arr's library now disagrees.
      const manualMatchId = cached?.metadata?.manualMatchId;
      if (manualMatchId && cached?.manager) {
        manager = cached.manager;
        log('info', 'engine', `Using manual match id=${manualMatchId} (${manager}) for "${torrent.name}"`);
        if (manager === 'radarr') {
          torrent._match = { source: 'manual', movieId: manualMatchId };
        } else if (manager === 'sonarr') {
          try {
            const episodes = await sonarr.getEpisodes(manualMatchId);
            const episodesWithFiles = episodes.filter(e => e.hasFile);
            torrent._match = {
              source: 'manual',
              seriesId: manualMatchId,
              episodes: episodesWithFiles.map(e => ({ episodeId: e.id, quality: e.episodeFile?.quality, eventType: 'downloadFolderImported' }))
            };
          } catch (err) {
            log('error', 'sonarr', `Failed to fetch episodes for manual match series ${manualMatchId}: ${err.message}`);
            // Manual match references a series that's gone — drop it and
            // let the full chain run.
            manager = null;
            torrent._match = null;
          }
        }
      }

      // Pattern-based routing so series-shaped names skip Radarr (and vice
      // versa). Prevents Radarr's greedy /parse from cross-mapping a torrent
      // like "Greys.Anatomy.S22E17" onto an unrelated movie.
      const seriesShape = isSeriesPattern(torrent.name);
      const movieShape = isMoviePattern(torrent.name);
      const allowRadarr = !seriesShape;
      const allowSonarr = !movieShape;

      // 2b. Try matching (if not cached or cache invalid)
      if (!manager) {
        if (allowRadarr) {
          const radarrMatch = await radarr.getMovieByHash(torrent.hash, torrent.name);
          if (radarrMatch) {
            manager = 'radarr';
            torrent._match = radarrMatch;
            if (radarrMatch.source === 'history-name') {
              log('info', 'radarr', `History sourceTitle fallback matched "${torrent.name}" to movie ID ${radarrMatch.movieId}`);
            }
          }
        }
        if (!manager && allowSonarr) {
          const sonarrMatch = await sonarr.getEpisodesByHash(torrent.hash, torrent.name);
          if (sonarrMatch) {
            manager = 'sonarr';
            torrent._match = sonarrMatch;
            if (sonarrMatch.source === 'history-name') {
              log('info', 'sonarr', `History sourceTitle fallback matched "${torrent.name}" to series ID ${sonarrMatch.seriesId}`);
            }
          }
        }

        // Path-based fallback: scan history for a record whose dropped/imported
        // path includes this torrent's name.
        if (!manager && allowRadarr) {
          try {
            const pathMatch = await radarr.findMovieByPath(torrent.name);
            if (pathMatch?.movieId) {
              manager = 'radarr';
              torrent._match = pathMatch;
              log('info', 'radarr', `History path fallback matched "${torrent.name}" to movie ID ${pathMatch.movieId}`);
            }
          } catch (e) { /* path lookup is best-effort */ }
        }
        if (!manager && allowSonarr) {
          try {
            const pathMatch = await sonarr.findEpisodesByPath(torrent.name);
            if (pathMatch?.seriesId) {
              manager = 'sonarr';
              torrent._match = pathMatch;
              log('info', 'sonarr', `History path fallback matched "${torrent.name}" to series ID ${pathMatch.seriesId}`);
            }
          } catch (e) { /* path lookup is best-effort */ }
        }

        // Fallback: parse filename. Accept a Radarr movie / Sonarr series
        // match as soon as the *arr parser identifies it — even if there
        // are no imported files yet (the torrent may still be downloading
        // or pending import). Previously we required at least one
        // imported episode/file, which is why Run Now / Dry Run missed
        // matches that the per-row Auto-match button (which trusts the
        // parse result directly) was finding.
        if (!manager && allowRadarr) {
          try {
            const parsedRadarr = await radarr.parseFilename(torrent.name);
            if (parsedRadarr?.movie?.id) {
              manager = 'radarr';
              torrent._match = { source: 'parse', movieId: parsedRadarr.movie.id };
              log('info', 'radarr', `Fallback matching via filename successful for "${torrent.name}"`);
            }
          } catch (e) { /* parse fallback is best-effort */ }
        }

        if (!manager && allowSonarr) {
          try {
            const parsedSonarr = await sonarr.parseFilename(torrent.name);
            if (parsedSonarr?.series?.id) {
              const episodes = await sonarr.getEpisodes(parsedSonarr.series.id);
              const episodesWithFiles = (episodes || []).filter(e => e.hasFile);
              manager = 'sonarr';
              torrent._match = {
                source: 'parse',
                seriesId: parsedSonarr.series.id,
                episodes: episodesWithFiles.map(e => ({ episodeId: e.id, quality: e.episodeFile?.quality, eventType: 'downloadFolderImported' }))
              };
              log('info', 'sonarr', `Fallback matching via filename successful for "${torrent.name}" (${episodesWithFiles.length} imported episode(s))`);
            }
          } catch (e) { /* parse fallback is best-effort */ }
        }

        // Fallback: same-series grouping. If another already-matched torrent
        // shares this one's normalized series base name, reuse its seriesId.
        // Same loosening as above — accept the grouping even if the series
        // has no imported files yet, so the manager pill still shows up.
        if (!manager && allowSonarr) {
            const base = extractSeriesBase(torrent.name);
            const seriesId = base ? seriesBaseMap.get(base) : null;
            if (seriesId) {
              try {
                const episodes = await sonarr.getEpisodes(seriesId);
                const episodesWithFiles = (episodes || []).filter(e => e.hasFile);
                manager = 'sonarr';
                torrent._match = {
                  source: 'series-base',
                  seriesId,
                  episodes: episodesWithFiles.map(e => ({ episodeId: e.id, quality: e.episodeFile?.quality, eventType: 'downloadFolderImported' }))
                };
                log('info', 'sonarr', `Series-base fallback matched "${torrent.name}" to series ID ${seriesId} (${episodesWithFiles.length} imported episode(s))`);
              } catch (err) {
                log('warn', 'sonarr', `Series-base fallback failed for "${torrent.name}": ${err.message}`);
              }
            }
        }
      }

      // Check limits early
      const seedingTimeMet = torrent.seedingTime >= minSeedingTime;
      const ratioMet = torrent.ratio >= minRatio;
      const limitMet = seedingTimeMet || ratioMet;

      // ── RADARR BLOCK ──
      if (manager === 'radarr') {
        const radarrMatch = torrent._match || await radarr.getMovieByHash(torrent.hash, torrent.name);
        
        // Handle cache invalidation or mismatch
        if (!radarrMatch) {
           log('warn', 'radarr', `Cache mismatch: Could not find movie for ${torrent.name} in Radarr anymore. Falling back.`);
           manager = null; // Reset and let it fall through to Sonarr or unmatched
        } else {
          log('info', 'radarr', `Matched torrent "${torrent.name}" to movie ID ${radarrMatch.movieId}`);

          // Get movie details and file quality
          const movie = await radarr.getMovie(radarrMatch.movieId);
          const movieFiles = await radarr.getMovieFiles(radarrMatch.movieId);

          let qualityMet = false;
          let fileQualityName = 'N/A';

          if (movieFiles && movieFiles.length > 0) {
            const fileQuality = movieFiles[0].quality;
            fileQualityName = getQualityName(fileQuality);
            const profile = radarrProfiles[movie.qualityProfileId];

            if (profile) {
              qualityMet = meetsQualityCutoff(fileQuality, profile);
              log('info', 'radarr',
                `Quality check: file=${fileQualityName}, cutoff=${profile.cutoff}, meets=${qualityMet}`
              );
            } else {
              qualityMet = true;
              log('warn', 'radarr', 'Quality profile not found, assuming quality is acceptable');
            }

            // Correctly downloaded and imported: Unmonitor regardless of quality cutoff or current label
            if (!dryRun) await radarr.setUnmonitored(radarrMatch.movieId);
            summary.unmonitored++;
            log('info', 'radarr', `${dryRun ? '[DRY RUN] Would ensure unmonitored' : 'Ensuring unmonitored'} movie: ${movie.title}`);

            // Only relabel to 'ignore' if quality cutoff is met OR limit is met
            if (qualityMet || limitMet) {
              summary.matched++;
              
              if (torrent._target === 'process') {
                if (!dryRun) await deluge.setTorrentLabel(torrent.hash, 'ignore');
                summary.relabeled++;
                log('info', 'deluge', `${dryRun ? '[DRY RUN] Would relabel' : 'Relabeled'} "${torrent.name}" → ignore (${qualityMet ? 'Quality met' : 'Limit reached'})`);
              } else {
                log('info', 'radarr', `Metadata gathered for movie: ${movie.title}`);
              }
            } else {
              log('info', 'radarr', `Quality cutoff NOT met and limit NOT reached for "${movie.title}". Keeping in media label for further seeding.`);
            }

            summary.details.push({
              hash: torrent.hash,
              name: torrent.name,
              action: (torrent._target === 'process' && (qualityMet || limitMet)) ? (dryRun ? 'would_process' : 'processed') : (torrent._target === 'process' ? 'unmonitored_only' : 'metadata_only'),
              service: 'radarr',
              manager: 'radarr',
              title: movie.title,
              quality: fileQualityName,
              qualityMet,
              limitMet,
              metadata: { ...buildRadarrMetadata(movie), source: torrent._match?.source || 'hash' },
            });
            continue;
          } else {
            log('warn', 'radarr', `Movie "${movie.title}" has no imported files yet, skipping`);
            summary.details.push({
              hash: torrent.hash,
              name: torrent.name,
              action: 'skipped',
              reason: 'No imported files in Radarr',
              manager: 'radarr',
              metadata: { ...buildRadarrMetadata(movie), source: torrent._match?.source || 'hash' },
            });
            continue;
          }
        }
      }

      // ── SONARR BLOCK ──
      // Fallthrough from Radarr if manager was reset to null
      if (!manager) {
        const sonarrMatch = await sonarr.getEpisodesByHash(torrent.hash, torrent.name);
        if (sonarrMatch) {
            manager = 'sonarr';
            torrent._match = sonarrMatch;
        }
      }

      if (manager === 'sonarr') {
        const sonarrMatch = torrent._match || await sonarr.getEpisodesByHash(torrent.hash, torrent.name);
        
        if (!sonarrMatch) {
          log('warn', 'sonarr', `Cache mismatch or no episodes found for "${torrent.name}" in Sonarr. Skipping.`);
          summary.details.push({
            hash: torrent.hash,
            name: torrent.name,
            action: 'skipped',
            reason: 'Series or episodes not found in Sonarr',
            manager: 'sonarr',
          });
          continue;
        } else {
          log('info', 'sonarr', `Matched torrent "${torrent.name}" to series ID ${sonarrMatch.seriesId}`);

          // Register this torrent's series-base so later torrents in this run
          // can be grouped via the same-series-base fallback.
          const baseKey = extractSeriesBase(torrent.name);
          if (baseKey && sonarrMatch.seriesId && !seriesBaseMap.has(baseKey)) {
            seriesBaseMap.set(baseKey, sonarrMatch.seriesId);
          }

          const series = sonarrMatch.series || await sonarr.getSeriesById(sonarrMatch.seriesId);
          const profile = sonarrProfiles[series.qualityProfileId];

          const episodeIds = [];
          let allQualityMet = true;
          let importedCount = 0;

          for (const ep of sonarrMatch.episodes) {
            if (ep.episodeId) {
              if (ep.eventType === 'downloadFolderImported') {
                episodeIds.push(ep.episodeId);
                importedCount++;
              }

              if (ep.quality) {
                const qualityName = getQualityName(ep.quality);
                if (profile) {
                  const met = meetsQualityCutoff(ep.quality, profile);
                  if (!met) allQualityMet = false;
                  log('info', 'sonarr', `Episode ${ep.episodeId}: quality=${qualityName}, meets=${met} (event=${ep.eventType})`);
                }
              } else if (profile) {
                allQualityMet = false;
                log('warn', 'sonarr', `Episode ${ep.episodeId} has no quality info, assuming quality cutoff not met`);
              }
            }
          }

          if (importedCount > 0) {
            // Correctly downloaded/matched: Unmonitor these episodes regardless of quality cutoff or current label
            if (!dryRun) await sonarr.setEpisodesUnmonitored(episodeIds);
            summary.unmonitored++;
            log('info', 'sonarr', `${dryRun ? '[DRY RUN] Would ensure unmonitored' : 'Ensuring unmonitored'} ${episodeIds.length} episode(s) of "${series.title}"`);

            // Only relabel to 'ignore' if ALL episodes in the torrent meet quality cutoff OR limit is met
            if ((allQualityMet && profile) || limitMet) {
              summary.matched++;
              
              if (torrent._target === 'process') {
                if (!dryRun) await deluge.setTorrentLabel(torrent.hash, 'ignore');
                summary.relabeled++;
                log('info', 'deluge', `${dryRun ? '[DRY RUN] Would relabel' : 'Relabeled'} "${torrent.name}" → ignore (${(allQualityMet && profile) ? 'Quality met' : 'Limit reached'})`);
              } else {
                log('info', 'sonarr', `Metadata gathered for series: ${series.title}`);
              }
            } else if (profile) {
               log('info', 'sonarr', `Quality cutoff NOT met for some episodes and limit NOT reached for "${series.title}". Keeping in media label.`);
            }

            summary.details.push({
              hash: torrent.hash,
              name: torrent.name,
              action: (torrent._target === 'process' && ((allQualityMet && profile) || limitMet)) ? (dryRun ? 'would_process' : 'processed') : (torrent._target === 'process' ? 'unmonitored_only' : 'metadata_only'),
              service: 'sonarr',
              manager: 'sonarr',
              title: series.title,
              episodes: episodeIds.length,
              allQualityMet,
              limitMet,
              metadata: { ...buildSonarrMetadata(series), source: torrent._match?.source || 'hash' },
            });
            continue;
          } else {
            log('warn', 'sonarr', `Series "${series.title}" has no imported files for this torrent yet, skipping`);
            summary.details.push({
              hash: torrent.hash,
              name: torrent.name,
              action: 'skipped',
              reason: 'No imported files in Sonarr',
              manager: 'sonarr',
              metadata: { ...buildSonarrMetadata(series), source: torrent._match?.source || 'hash' },
            });
            continue;
          }
        }
      }

      // 2c. No match found
      summary.unmatched++;
      log('warn', 'engine', `Torrent "${torrent.name}" (${torrent.hash}) not found in Radarr or Sonarr`);
      summary.details.push({
        hash: torrent.hash,
        name: torrent.name,
        action: 'unmatched',
        reason: 'Not found in Radarr or Sonarr history',
      });

    } catch (err) {
      summary.errors++;
      log('error', 'engine', `Error processing torrent "${torrent.name}": ${err.message}`, {
        hash: torrent.hash,
        error: err.stack,
      });
      summary.details.push({
        hash: torrent.hash,
        name: torrent.name,
        action: 'error',
        reason: err.message,
      });
    }
  }

  log('info', 'engine', `Phase 1 complete: ${summary.matched} matched, ${summary.unmatched} unmatched, ${summary.errors} errors`);
  return summary;
}

