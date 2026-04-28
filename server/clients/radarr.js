/**
 * Radarr REST API v3 Client
 *
 * Communicates with Radarr for movie management, quality profile
 * inspection, and history-based torrent hash matching.
 */

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

    return fetch(url, {
      ...options,
      headers,
    });
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
   * Searches by downloadId (the torrent hash, case-insensitive).
   */
  async function getMovieByHash(torrentHash) {
    const hash = (torrentHash || '').toUpperCase();
    
    // First check the queue for active downloads
    try {
      const queue = await request(`/queue?downloadId=${hash}&includeMovie=true`);
      const records = queue.records || queue;
      if (Array.isArray(records) && records.length > 0) {
        const queueMatch = records[0];
        if (queueMatch && queueMatch.movie) {
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

    // Search history by download ID
    const history = await request(`/history?downloadId=${hash}`);
    const records = history.records || history;

    if (Array.isArray(records) && records.length > 0) {
      // Find the most relevant history item (e.g., imported or grabbed)
      const match = records.find(r => r.eventType === 'downloadFolderImported') || records[0];

      if (match) {
        return {
          source: 'history',
          movieId: match.movieId,
          quality: match.quality,
          eventType: match.eventType,
        };
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
   */
  async function searchMovies(term) {
    const results = await request(`/movie/lookup?term=${encodeURIComponent(term)}`);
    return (results || []).slice(0, 20).map(m => ({
      id: m.id || m.tmdbId,
      internalId: m.id || null,
      tmdbId: m.tmdbId,
      title: m.title,
      year: m.year,
      overview: m.overview ? m.overview.substring(0, 200) : '',
      poster: m.images?.find(i => i.coverType === 'poster')?.remoteUrl || null,
      status: m.status || (m.id ? 'inLibrary' : 'notInLibrary'),
      inLibrary: !!m.id,
    }));
  }

  return {
    testConnection,
    getMovies,
    getMovie,
    getMovieByHash,
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
