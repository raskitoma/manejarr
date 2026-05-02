/**
 * Sonarr REST API v3 Client
 *
 * Communicates with Sonarr for series/episode management, quality profile
 * inspection, and history-based torrent hash matching.
 */

import { hashVariants, normalizeReleaseTitle } from '../utils/metadataBuilders.js';

/**
 * Create a configured Sonarr client instance.
 */
export function createSonarrClient({ host, port, apiKey }) {
  const baseUrl = `http://${host}:${port || 8989}`;

  /**
   * Make an authenticated request to the Sonarr API and return the raw response.
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
        throw new Error(`Sonarr API request timed out (${endpoint}) after 10s`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Make an authenticated request to the Sonarr API and parse as JSON.
   */
  async function request(endpoint, options = {}) {
    const response = await requestRaw(endpoint, options);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Sonarr API error (${response.status}): ${text}`);
    }

    return response.json();
  }

  /**
   * Test connectivity to Sonarr.
   */
  async function testConnection() {
    const status = await request('/system/status');
    return { connected: true, version: status.version };
  }

  /**
   * Get all series.
   */
  async function getSeries() {
    return request('/series');
  }

  /**
   * Get a specific series by ID.
   */
  async function getSeriesById(seriesId) {
    return request(`/series/${seriesId}`);
  }

  /**
   * Get episodes for a specific series.
   */
  async function getEpisodes(seriesId) {
    return request(`/episode?seriesId=${seriesId}`);
  }

  /**
   * Get a specific episode by ID.
   */
  async function getEpisode(episodeId) {
    return request(`/episode/${episodeId}`);
  }

  /**
   * Search history for a torrent hash and return associated episode(s).
   * A single torrent can contain multiple episodes (e.g., season pack).
   *
   * Lookup order:
   *   1. Queue/history by downloadId, trying as-given / upper / lower hash
   *      (different download clients persist the infohash in different cases).
   *   2. If still no match and torrentName is supplied, scan recent history
   *      and match by sourceTitle (the release title Sonarr grabbed).
   *      Rescues the localized-title case: a series stored in Sonarr as
   *      "El Encargado" but downloaded as "The Boss 2022 ..." — sourceTitle
   *      will equal the torrent name regardless of the series's display title.
   */
  async function getEpisodesByHash(torrentHash, torrentName = null) {
    const buildEpisodeMap = (records) => {
      const episodeMap = new Map();
      for (const m of records) {
        if (m.episodeId) {
          const existing = episodeMap.get(m.episodeId);
          if (!existing || m.eventType === 'downloadFolderImported') {
            episodeMap.set(m.episodeId, {
              episodeId: m.episodeId,
              seriesId: m.seriesId,
              quality: m.quality,
              eventType: m.eventType,
            });
          }
        }
      }
      return episodeMap;
    };

    // Sonarr's /queue endpoint does NOT support a downloadId filter — passing
    // the param is silently ignored and you get the entire paginated queue
    // back. Fetch once, then filter client-side by record.downloadId across
    // every hash case variant.
    const variants = hashVariants(torrentHash);
    const variantSet = new Set(variants.map(v => v.toLowerCase()));
    const matchesAnyVariant = (id) => typeof id === 'string' && variantSet.has(id.toLowerCase());

    try {
      const queue = await request('/queue?pageSize=200&includeSeries=true&includeEpisode=true');
      const records = queue.records || queue;
      if (Array.isArray(records)) {
        const matched = records.filter(r => matchesAnyVariant(r.downloadId));
        if (matched.length > 0) {
          return {
            source: 'queue',
            seriesId: matched[0].seriesId,
            series: matched[0].series,
            episodes: matched.map(m => ({
              episodeId: m.episodeId || m.episode?.id,
              episode: m.episode,
              quality: m.quality,
            })),
          };
        }
      }
    } catch (e) {
      // Queue check is optional
    }

    // /history?downloadId=X does support the server-side filter, but we still
    // confirm client-side as a defense against version-specific quirks.
    for (const hash of variants) {
      try {
        const history = await request(`/history?downloadId=${hash}`);
        const records = history.records || history;
        if (Array.isArray(records) && records.length > 0) {
          const filtered = records.filter(r => !r.downloadId || matchesAnyVariant(r.downloadId));
          if (filtered.length > 0) {
            const episodeMap = buildEpisodeMap(filtered);
            return {
              source: 'history',
              seriesId: filtered[0].seriesId,
              episodes: Array.from(episodeMap.values()),
            };
          }
        }
      } catch (e) {
        // continue to next variant / fallback
      }
    }

    // Fallback: scan recent history for matching sourceTitle.
    if (torrentName) {
      try {
        const wanted = normalizeReleaseTitle(torrentName);
        const history = await request('/history?page=1&pageSize=1000&sortKey=date&sortDirection=descending');
        const all = history.records || history;
        if (Array.isArray(all)) {
          // Find the seriesId of the first matching record, then collect every
          // history record sharing that downloadId/sourceTitle so season packs
          // still report their full episode set.
          const seed = all.find(r =>
            r.episodeId && r.seriesId && r.sourceTitle &&
            normalizeReleaseTitle(r.sourceTitle) === wanted
          );
          if (seed) {
            const matched = all.filter(r =>
              r.seriesId === seed.seriesId &&
              r.sourceTitle &&
              normalizeReleaseTitle(r.sourceTitle) === wanted
            );
            const episodeMap = buildEpisodeMap(matched);
            return {
              source: 'history-name',
              seriesId: seed.seriesId,
              episodes: Array.from(episodeMap.values()),
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
   * Get episode file(s) for a specific series, including quality info.
   */
  async function getEpisodeFiles(seriesId) {
    return request(`/episodefile?seriesId=${seriesId}`);
  }

  /**
   * Path-based history lookup. Scans recent history for a record whose
   * `data.droppedPath` (the path Sonarr handed off to the download client)
   * contains the torrent's name — i.e. "Sonarr's record of where it dropped
   * this download lines up with where Deluge actually has it on disk".
   *
   * This survives cases where the infohash and the sourceTitle both miss
   * (e.g. download client recorded a normalized hash, or sourceTitle has
   * minor punctuation differences from the torrent name).
   */
  async function findEpisodesByPath(torrentName) {
    if (!torrentName) return null;

    const needle = torrentName.toLowerCase();
    const matchesNeedle = (val) => typeof val === 'string' && val.toLowerCase().includes(needle);

    try {
      const history = await request('/history?page=1&pageSize=1000&sortKey=date&sortDirection=descending');
      const all = history.records || history;
      if (!Array.isArray(all)) return null;

      const seed = all.find(r =>
        r.episodeId && r.seriesId && r.data && (
          matchesNeedle(r.data.droppedPath) ||
          matchesNeedle(r.data.importedPath) ||
          matchesNeedle(r.data.path)
        )
      );
      if (!seed) return null;

      const matched = all.filter(r =>
        r.seriesId === seed.seriesId && r.data && (
          matchesNeedle(r.data.droppedPath) ||
          matchesNeedle(r.data.importedPath) ||
          matchesNeedle(r.data.path)
        )
      );

      const episodeMap = new Map();
      for (const m of matched) {
        if (m.episodeId) {
          const existing = episodeMap.get(m.episodeId);
          if (!existing || m.eventType === 'downloadFolderImported') {
            episodeMap.set(m.episodeId, {
              episodeId: m.episodeId,
              seriesId: m.seriesId,
              quality: m.quality,
              eventType: m.eventType,
            });
          }
        }
      }

      return {
        source: 'history-path',
        seriesId: seed.seriesId,
        episodes: Array.from(episodeMap.values()),
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Parse a filename to detect quality and episode information.
   */
  async function parseFilename(filename) {
    return request(`/parse?title=${encodeURIComponent(filename)}`);
  }

  /**
   * Set specific episodes to unmonitored.
   * Only changes episode-level monitoring, not series-level.
   */
  async function setEpisodesUnmonitored(episodeIds) {
    return request('/episode/monitor', {
      method: 'PUT',
      body: JSON.stringify({
        episodeIds,
        monitored: false,
      }),
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
   * Search for series by name using Sonarr's lookup endpoint.
   * Library-only: torrents reaching us came from Sonarr, so a manual match
   * against a non-library entry would never resolve in subsequent runs.
   */
  async function searchSeries(term) {
    const results = await request(`/series/lookup?term=${encodeURIComponent(term)}`);
    return (results || [])
      .filter(s => !!s.id)
      .slice(0, 20)
      .map(s => ({
        id: s.id,
        internalId: s.id,
        tvdbId: s.tvdbId,
        title: s.title,
        year: s.year,
        overview: s.overview ? s.overview.substring(0, 200) : '',
        poster: s.images?.find(i => i.coverType === 'poster')?.remoteUrl || null,
        status: s.status || 'inLibrary',
        inLibrary: true,
        seasonCount: s.seasonCount || s.statistics?.seasonCount || null,
      }));
  }

  return {
    testConnection,
    getSeries,
    getSeriesById,
    getEpisodes,
    getEpisode,
    getEpisodesByHash,
    findEpisodesByPath,
    getEpisodeFiles,
    parseFilename,
    setEpisodesUnmonitored,
    getQualityProfiles,
    getQualityProfile,
    searchSeries,
    request,
    requestRaw,
  };
}
