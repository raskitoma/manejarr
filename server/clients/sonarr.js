/**
 * Sonarr REST API v3 Client
 *
 * Communicates with Sonarr for series/episode management, quality profile
 * inspection, and history-based torrent hash matching.
 */

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

    return fetch(url, {
      ...options,
      headers,
    });
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
   */
  async function getEpisodesByHash(torrentHash) {
    const hash = (torrentHash || '').toUpperCase();

    // Check queue first
    try {
      const queue = await request(`/queue?downloadId=${hash}&includeSeries=true&includeEpisode=true`);
      const records = queue.records || queue;
      if (Array.isArray(records) && records.length > 0) {
        return {
          source: 'queue',
          seriesId: records[0].seriesId,
          series: records[0].series,
          episodes: records.map(m => ({
            episodeId: m.episodeId || m.episode?.id,
            episode: m.episode,
            quality: m.quality,
          })),
        };
      }
    } catch (e) {
      // Queue check is optional
    }

    // Search history
    const history = await request(`/history?downloadId=${hash}`);
    const records = history.records || history;

    if (Array.isArray(records) && records.length > 0) {
      const episodeMap = new Map();
      // Prioritize 'downloadFolderImported' events to ensure we only match imported episodes
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

      return {
        source: 'history',
        seriesId: records[0].seriesId,
        episodes: Array.from(episodeMap.values()),
      };
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

  return {
    testConnection,
    getSeries,
    getSeriesById,
    getEpisodes,
    getEpisode,
    getEpisodesByHash,
    getEpisodeFiles,
    parseFilename,
    setEpisodesUnmonitored,
    getQualityProfiles,
    getQualityProfile,
    request,
    requestRaw,
  };
}
