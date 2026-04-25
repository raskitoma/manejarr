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

  // 1. Fetch all torrents labeled 'media'
  let torrents;
  try {
    await deluge.connect();
    torrents = await deluge.getTorrentsByLabel('media');
    log('info', 'deluge', `Found ${torrents.length} torrent(s) labeled 'media'`);
  } catch (err) {
    log('error', 'deluge', `Failed to fetch media torrents: ${err.message}`);
    summary.errors++;
    return summary;
  }

  if (torrents.length === 0) {
    log('info', 'engine', 'No torrents labeled media. Phase 1 complete.');
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

      // 2b. Try matching (if not cached)
      if (!manager) {
        const radarrMatch = await radarr.getMovieByHash(torrent.hash);
        if (radarrMatch) {
          manager = 'radarr';
          // Pre-fetch for the check below
          torrent._match = radarrMatch; 
        } else {
          const sonarrMatch = await sonarr.getEpisodesByHash(torrent.hash);
          if (sonarrMatch) {
            manager = 'sonarr';
            torrent._match = sonarrMatch;
          }
        }
      }

      if (manager === 'radarr') {
        const radarrMatch = torrent._match || await radarr.getMovieByHash(torrent.hash);
        if (!radarrMatch) {
           log('warn', 'radarr', `Cache mismatch: Could not find movie for ${torrent.name} by hash anymore`);
           continue; 
        }
        
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
            // No profile found — assume quality is acceptable
            qualityMet = true;
            log('warn', 'radarr', 'Quality profile not found, assuming quality is acceptable');
          }
        } else {
          // No files yet — the download might not be imported
          log('warn', 'radarr', `Movie "${movie.title}" has no imported files yet, skipping`);
          summary.details.push({
            hash: torrent.hash,
            name: torrent.name,
            action: 'skipped',
            reason: 'No imported files in Radarr',
            service: 'radarr',
            manager: 'radarr',
            metadata: {
              title: movie.title,
              year: movie.year,
              images: movie.images,
              infoUrl: `https://www.imdb.com/title/${movie.imdbId}`,
              managerUrl: `/movie/${movie.id}`,
              id: movie.id,
            },
          });
          continue;
        }

        if (qualityMet) {
          summary.matched++;

          // Unmonitor the movie
          if (!dryRun) {
            await radarr.setUnmonitored(radarrMatch.movieId);
          }
          summary.unmonitored++;
          log('info', 'radarr', `${dryRun ? '[DRY RUN] Would unmonitor' : 'Unmonitored'} movie: ${movie.title}`);

          // Relabel torrent from 'media' to 'ignore'
          if (!dryRun) {
            await deluge.setTorrentLabel(torrent.hash, 'ignore');
          }
          summary.relabeled++;
          log('info', 'deluge', `${dryRun ? '[DRY RUN] Would relabel' : 'Relabeled'} "${torrent.name}" → ignore`);

          summary.details.push({
            hash: torrent.hash,
            name: torrent.name,
            action: dryRun ? 'would_process' : 'processed',
            service: 'radarr',
            manager: 'radarr',
            title: movie.title,
            quality: fileQualityName,
            metadata: {
              title: movie.title,
              year: movie.year,
              images: movie.images,
              infoUrl: `https://www.imdb.com/title/${movie.imdbId}`,
              managerUrl: `/movie/${movie.id}`,
              id: movie.id,
            },
          });
          continue;
        }
      }

      if (manager === 'sonarr') {
        const sonarrMatch = torrent._match || await sonarr.getEpisodesByHash(torrent.hash);
        if (!sonarrMatch) {
          log('warn', 'sonarr', `Cache mismatch: Could not find episodes for ${torrent.name} by hash anymore`);
          continue; 
        }

        log('info', 'sonarr', `Matched torrent "${torrent.name}" to series ID ${sonarrMatch.seriesId}`);

        // Get series details for quality profile
        const series = sonarrMatch.series || await sonarr.getSeriesById(sonarrMatch.seriesId);
        const profile = sonarrProfiles[series.qualityProfileId];

        // Check quality for each matched episode
        const episodeIds = [];
        let allQualityMet = true;

        for (const ep of sonarrMatch.episodes) {
          if (ep.quality) {
            const qualityName = getQualityName(ep.quality);
            if (profile) {
              const met = meetsQualityCutoff(ep.quality, profile);
              if (!met) allQualityMet = false;
              log('info', 'sonarr', `Episode ${ep.episodeId}: quality=${qualityName}, meets=${met}`);
            }
          }
          if (ep.episodeId) episodeIds.push(ep.episodeId);
        }

        if (!allQualityMet && profile) {
          log('warn', 'sonarr', `Quality not met for some episodes, skipping torrent`);
          summary.details.push({
            hash: torrent.hash,
            name: torrent.name,
            action: 'skipped',
            reason: 'Quality not met',
            service: 'sonarr',
            manager: 'sonarr',
            metadata: {
              title: series.title,
              year: series.year,
              images: series.images,
              infoUrl: `https://www.tvmaze.com/shows/${series.tvMazeId}`,
              managerUrl: `/series/${series.id}`,
              id: series.id,
            },
          });
          continue;
        }

        if (episodeIds.length > 0) {
          summary.matched++;

          // Unmonitor episodes (NOT the series)
          if (!dryRun) {
            await sonarr.setEpisodesUnmonitored(episodeIds);
          }
          summary.unmonitored++;
          log('info', 'sonarr',
            `${dryRun ? '[DRY RUN] Would unmonitor' : 'Unmonitored'} ${episodeIds.length} episode(s) of "${series.title}"`
          );

          // Relabel torrent
          if (!dryRun) {
            await deluge.setTorrentLabel(torrent.hash, 'ignore');
          }
          summary.relabeled++;
          log('info', 'deluge', `${dryRun ? '[DRY RUN] Would relabel' : 'Relabeled'} "${torrent.name}" → ignore`);

          summary.details.push({
            hash: torrent.hash,
            name: torrent.name,
            action: dryRun ? 'would_process' : 'processed',
            service: 'sonarr',
            manager: 'sonarr',
            title: series.title,
            episodes: episodeIds.length,
            metadata: {
              title: series.title,
              year: series.year,
              images: series.images,
              infoUrl: `https://www.tvmaze.com/shows/${series.tvMazeId}`,
              managerUrl: `/series/${series.id}`,
              id: series.id,
            },
          });
          continue;
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
