/**
 * Radarr REST API v3 Client
 *
 * Communicates with Radarr for movie management, quality profile
 * inspection, and history-based torrent hash matching.
 */

import { hashVariants, normalizeReleaseTitle } from '../utils/metadataBuilders.js';

/**
 * Create a configured Radarr client instance.
 */
export function createRadarrClient({ host, port, apiKey }) {
  const baseUrl = `http://${host}:${port || 7878}`;

  /**
   * Make an authenticated request to the Radarr API and return the raw response.
   */
  async function requestRaw(endpoint, options = {}) {
    const url = `${baseUrl}/api/v3${endpoint}`;
    const headers = {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json, image/*, */*',
      ...options.headers,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      return response;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`Radarr API request timed out (${endpoint}) after 10s`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Make an authenticated request to the Radarr API and parse as JSON.
   */
  async function request(endpoint, options = {}) {
    const response = await requestRaw(endpoint, options);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Radarr API error (${response.status}): ${text}`);
    }

    return response.json();
  }

  /**
   * Test connectivity to Radarr.
   */
  async function testConnection() {
    const status = await request('/system/status');
    return { connected: true, version: status.version };
  }

  /**
   * Get all movies.
   */
  async function getMovies() {
    return request('/movie');
  }

  /**
   * Get a specific movie by ID.
   */
  async function getMovie(movieId) {
    return request(`/movie/${movieId}`);
  }

  /**
   * Search history for a torrent hash and return the associated movie.
   *
   * Lookup order:
   *   1. Queue/history by downloadId, trying as-given / upper / lower hash
   *      (different download clients persist the infohash in different cases).
   *   2. If still no match and torrentName is supplied, scan recent history
   *      and match by sourceTitle (the release title Radarr grabbed).
   *      This rescues cases where Sonarr/Radarr have a localized title
   *      (e.g. "El Encargado") and the torrent has the English release
   *      ("The Boss 2022 ..."): the hash may differ across clients but
   *      Radarr's history sourceTitle will equal the torrent name.
   */
  async function getMovieByHash(torrentHash, torrentName = null) {
    // Radarr's /queue endpoint does NOT support a downloadId filter — passing
    // the param is silently ignored and you get the entire paginated queue.
    // Fetch once, then filter client-side by record.downloadId across every
    // hash case variant.
    const variants = hashVariants(torrentHash);
    const variantSet = new Set(variants.map(v => v.toLowerCase()));
    const matchesAnyVariant = (id) => typeof id === 'string' && variantSet.has(id.toLowerCase());

    try {
      const queue = await request('/queue?pageSize=200&includeMovie=true');
      const records = queue.records || queue;
      if (Array.isArray(records)) {
        const queueMatch = records.find(r => matchesAnyVariant(r.downloadId) && r.movie);
        if (queueMatch) {
          return {
            source: 'queue',
            movieId: queueMatch.movie.id,
            movie: queueMatch.movie,
            quality: queueMatch.quality,
          };
        }
      }
    } catch (e) {
      // Queue check is optional, continue to history
    }

    // /history?downloadId=X does support the server-side filter; we still
    // confirm client-side as a defense against version-specific quirks.
    for (const hash of variants) {
      try {
        const history = await request(`/history?downloadId=${hash}`);
        const records = history.records || history;
        if (Array.isArray(records) && records.length > 0) {
          const filtered = records.filter(r => !r.downloadId || matchesAnyVariant(r.downloadId));
          if (filtered.length > 0) {
            const match = filtered.find(r => r.eventType === 'downloadFolderImported') || filtered[0];
            if (match) {
              return {
                source: 'history',
                movieId: match.movieId,
                quality: match.quality,
                eventType: match.eventType,
              };
            }
          }
        }
      } catch (e) {
        // continue to next variant / fallback
      }
    }

    // Fallback: scan recent history for a matching sourceTitle.
    if (torrentName) {
      try {
        const wanted = normalizeReleaseTitle(torrentName);
        const history = await request('/history?page=1&pageSize=1000&sortKey=date&sortDirection=descending');
        const records = history.records || history;
        if (Array.isArray(records)) {
          const match = records.find(r =>
            r.movieId && r.sourceTitle && normalizeReleaseTitle(r.sourceTitle) === wanted
          );
          if (match) {
            return {
              source: 'history-name',
              movieId: match.movieId,
              quality: match.quality,
              eventType: match.eventType,
            };
          }
        }
      } catch (e) {
        // Fallback scan failed, give up
      }
    }

    return null;
  }

  /**
   * Get movie file(s) for a specific movie, including quality info.
   */
  async function getMovieFiles(movieId) {
    return request(`/moviefile?movieId=${movieId}`);
  }

  /**
   * Path-based history lookup. Scans recent history for a record whose
   * `data.droppedPath` (or `data.importedPath` / `data.path`) contains the
   * torrent's name — i.e. "Radarr's record of where it dropped this download
   * lines up with where Deluge actually has it on disk".
   *
   * Used as a tertiary tie when neither the infohash nor the sourceTitle
   * lookup succeeds.
   */
  async function findMovieByPath(torrentName) {
    if (!torrentName) return null;

    const needle = torrentName.toLowerCase();
    const matchesNeedle = (val) => typeof val === 'string' && val.toLowerCase().includes(needle);

    try {
      const history = await request('/history?page=1&pageSize=1000&sortKey=date&sortDirection=descending');
      const all = history.records || history;
      if (!Array.isArray(all)) return null;

      const match = all.find(r =>
        r.movieId && r.data && (
          matchesNeedle(r.data.droppedPath) ||
          matchesNeedle(r.data.importedPath) ||
          matchesNeedle(r.data.path)
        )
      );
      if (!match) return null;

      return {
        source: 'history-path',
        movieId: match.movieId,
        quality: match.quality,
        eventType: match.eventType,
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Parse a filename to detect quality and movie information.
   */
  async function parseFilename(filename) {
    return request(`/parse?title=${encodeURIComponent(filename)}`);
  }

  /**
   * Set a movie to unmonitored.
   */
  async function setUnmonitored(movieId) {
    const movie = await getMovie(movieId);
    if (movie.monitored === false) return movie; // Already unmonitored
    
    movie.monitored = false;
    return request(`/movie/${movieId}`, {
      method: 'PUT',
      body: JSON.stringify(movie),
    });
  }

  /**
   * Get all quality profiles.
   */
  async function getQualityProfiles() {
    return request('/qualityprofile');
  }

  /**
   * Get a specific quality profile by ID.
   */
  async function getQualityProfile(profileId) {
    return request(`/qualityprofile/${profileId}`);
  }

  /**
   * Search for movies by name using Radarr's lookup endpoint.
   * Library-only: torrents reaching us came from Radarr, so a manual match
   * against a non-library entry would never resolve in subsequent runs.
   */
  async function searchMovies(term) {
    const results = await request(`/movie/lookup?term=${encodeURIComponent(term)}`);
    return (results || [])
      .filter(m => !!m.id)
      .slice(0, 20)
      .map(m => ({
        id: m.id,
        internalId: m.id,
        tmdbId: m.tmdbId,
        title: m.title,
        year: m.year,
        overview: m.overview ? m.overview.substring(0, 200) : '',
        poster: m.images?.find(i => i.coverType === 'poster')?.remoteUrl || null,
        status: m.status || 'inLibrary',
        inLibrary: true,
      }));
  }

  return {
    testConnection,
    getMovies,
    getMovie,
    getMovieByHash,
    findMovieByPath,
    getMovieFiles,
    parseFilename,
    setUnmonitored,
    getQualityProfiles,
    getQualityProfile,
    searchMovies,
    request,
    requestRaw,
  };
}
