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

/**
 * Execute Phase 1.
 *
 * @param {Object} clients - { deluge, radarr, sonarr }
 * @param {Object} options - { dryRun: boolean }
 * @param {Function} log - Logging callback: (level, category, message, metadata)
 * @returns {Object} - Summary of actions taken
 */
export async function executePhase1(clients, options = {}, log) {
  const { deluge, radarr, sonarr } = clients;
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

  // 1. Fetch torrents labeled 'media', 'ignore', or 'fordeletion'
  let torrents = [];
  try {
    await deluge.connect();
    const mediaTorrents = await deluge.getTorrentsByLabel('media');
    const ignoreTorrents = await deluge.getTorrentsByLabel('ignore');
    const deletionTorrents = await deluge.getTorrentsByLabel('fordeletion');
    
    // Add a marker to distinguish them
    mediaTorrents.forEach(t => t._target = 'process');
    ignoreTorrents.forEach(t => t._target = 'metadata_only');
    deletionTorrents.forEach(t => t._target = 'metadata_only');
    
    torrents = [...mediaTorrents, ...ignoreTorrents, ...deletionTorrents];
    log('info', 'deluge', `Found ${mediaTorrents.length} 'media', ${ignoreTorrents.length} 'ignore', and ${deletionTorrents.length} 'fordeletion' torrent(s)`);
  } catch (err) {
    log('error', 'deluge', `Failed to fetch torrents: ${err.message}`);
    summary.errors++;
    return summary;
  }

  if (torrents.length === 0) {
    log('info', 'engine', 'No torrents labeled media, ignore or fordeletion. Phase 1 complete.');
    return summary;
  }

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

      // 2a. Determine manager (check cache first)
      if (cached && cached.manager) {
        manager = cached.manager;
        log('info', 'engine', `Using cached manager "${manager}" for torrent "${torrent.name}"`);
      }

      // 2b. Try matching (if not cached or cache invalid)
      if (!manager) {
        const radarrMatch = await radarr.getMovieByHash(torrent.hash);
        if (radarrMatch) {
          manager = 'radarr';
          torrent._match = radarrMatch; 
        } else {
          const sonarrMatch = await sonarr.getEpisodesByHash(torrent.hash);
          if (sonarrMatch) {
            manager = 'sonarr';
            torrent._match = sonarrMatch;
          }
        }
      }

      // ── RADARR BLOCK ──
      if (manager === 'radarr') {
        const radarrMatch = torrent._match || await radarr.getMovieByHash(torrent.hash);
        
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

            // Only relabel to 'ignore' if quality cutoff is met
            if (qualityMet) {
              summary.matched++;
              
              if (torrent._target === 'process') {
                if (!dryRun) await deluge.setTorrentLabel(torrent.hash, 'ignore');
                summary.relabeled++;
                log('info', 'deluge', `${dryRun ? '[DRY RUN] Would relabel' : 'Relabeled'} "${torrent.name}" → ignore`);
              } else {
                log('info', 'radarr', `Metadata gathered for movie: ${movie.title}`);
              }
            } else {
              log('info', 'radarr', `Quality cutoff NOT met for "${movie.title}". Keeping in media label for further seeding.`);
            }

            summary.details.push({
              hash: torrent.hash,
              name: torrent.name,
              action: (torrent._target === 'process' && qualityMet) ? (dryRun ? 'would_process' : 'processed') : (torrent._target === 'process' ? 'unmonitored_only' : 'metadata_only'),
              service: 'radarr',
              manager: 'radarr',
              title: movie.title,
              quality: fileQualityName,
              qualityMet,
              metadata: buildRadarrMetadata(movie),
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
              metadata: buildRadarrMetadata(movie),
            });
            continue;
          }
        }
      }

      // ── SONARR BLOCK ──
      // Fallthrough from Radarr if manager was reset to null
      if (!manager) {
        const sonarrMatch = await sonarr.getEpisodesByHash(torrent.hash);
        if (sonarrMatch) {
            manager = 'sonarr';
            torrent._match = sonarrMatch;
        }
      }

      if (manager === 'sonarr') {
        const sonarrMatch = torrent._match || await sonarr.getEpisodesByHash(torrent.hash);
        
        if (!sonarrMatch) {
          log('warn', 'sonarr', `Cache mismatch: Could not find episodes for ${torrent.name} in Sonarr anymore. Skipping.`);
          // Not falling back further for now as Sonarr is the last check
        } else {
          log('info', 'sonarr', `Matched torrent "${torrent.name}" to series ID ${sonarrMatch.seriesId}`);

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

            // Only relabel to 'ignore' if ALL episodes in the torrent meet quality cutoff
            if (allQualityMet && profile) {
              summary.matched++;
              
              if (torrent._target === 'process') {
                if (!dryRun) await deluge.setTorrentLabel(torrent.hash, 'ignore');
                summary.relabeled++;
                log('info', 'deluge', `${dryRun ? '[DRY RUN] Would relabel' : 'Relabeled'} "${torrent.name}" → ignore`);
              } else {
                log('info', 'sonarr', `Metadata gathered for series: ${series.title}`);
              }
            } else if (profile) {
               log('info', 'sonarr', `Quality cutoff NOT met for some episodes of "${series.title}". Keeping in media label.`);
            }

            summary.details.push({
              hash: torrent.hash,
              name: torrent.name,
              action: (torrent._target === 'process' && allQualityMet) ? (dryRun ? 'would_process' : 'processed') : (torrent._target === 'process' ? 'unmonitored_only' : 'metadata_only'),
              service: 'sonarr',
              manager: 'sonarr',
              title: series.title,
              episodes: episodeIds.length,
              allQualityMet,
              metadata: buildSonarrMetadata(series),
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

/**
 * Build rich metadata for Radarr movies.
 */
function buildRadarrMetadata(movie) {
  let infoUrl = null;
  if (movie.imdbId) {
    infoUrl = `https://www.imdb.com/title/${movie.imdbId}`;
  } else if (movie.tmdbId) {
    infoUrl = `https://www.themoviedb.org/movie/${movie.tmdbId}`;
  }

  return {
    title: movie.title,
    year: movie.year,
    images: movie.images,
    infoUrl: infoUrl,
    managerUrl: `/movie/${movie.id}`,
    id: movie.id,
  };
}

/**
 * Build rich metadata for Sonarr series.
 */
function buildSonarrMetadata(series) {
  let infoUrl = null;
  if (series.imdbId) {
    infoUrl = `https://www.imdb.com/title/${series.imdbId}`;
  } else if (series.tvdbId) {
    infoUrl = `https://www.thetvdb.com/series/${series.tvdbId}`;
  }

  return {
    title: series.title,
    year: series.year,
    images: series.images,
    infoUrl: infoUrl,
    managerUrl: `/series/${series.id}`,
    id: series.id,
  };
}
