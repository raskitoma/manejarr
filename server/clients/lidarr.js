/**
 * Lidarr REST API v1 Client
 *
 * Communicates with Lidarr for artist/album management, quality-profile
 * inspection, and history-based torrent-hash matching. Mirrors the Radarr /
 * Sonarr clients, but for Lidarr's /api/v1 surface, which differs in ways that
 * silently break a naive port:
 *   - Fully-imported event is 'downloadImported' (NOT 'downloadFolderImported');
 *     'trackFileImported' is the per-file event and 'albumImportIncomplete' is a
 *     partial import.
 *   - Lidarr stores the torrent infohash UPPERCASE and /history?downloadId= is an
 *     exact string match — hashVariants() already includes the upper form.
 *   - Unmonitor is a single bulk call: PUT /api/v1/album/monitor {albumIds, monitored}.
 *   - One torrent (a discography grab) can span MULTIPLE albums, so matches return
 *     an `albums` list (analogous to Sonarr returning multiple episodes).
 */

import { hashVariants, normalizeReleaseTitle } from '../utils/metadataBuilders.js';

// History eventType strings that mean "this album's files actually landed".
const IMPORTED_EVENTS = new Set(['downloadImported', 'trackFileImported']);

/**
 * Create a configured Lidarr client instance.
 */
export function createLidarrClient({ host, port, apiKey }) {
  const baseUrl = `http://${host}:${port || 8686}`;

  /**
   * Make an authenticated request to the Lidarr API and return the raw response.
   */
  async function requestRaw(endpoint, options = {}) {
    const url = `${baseUrl}/api/v1${endpoint}`;
    const headers = {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json, image/*, */*',
      ...options.headers,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      return response;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`Lidarr API request timed out (${endpoint}) after 20s`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Make an authenticated request to the Lidarr API and parse as JSON.
   */
  async function request(endpoint, options = {}) {
    const response = await requestRaw(endpoint, options);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Lidarr API error (${response.status}): ${text}`);
    }

    return response.json();
  }

  /**
   * Test connectivity to Lidarr.
   */
  async function testConnection() {
    const status = await request('/system/status');
    return { connected: true, version: status.version };
  }

  /**
   * Get all artists.
   */
  async function getArtists() {
    return request('/artist');
  }

  /**
   * Get a specific artist by ID.
   */
  async function getArtistById(artistId) {
    return request(`/artist/${artistId}`);
  }

  /**
   * Get track file(s) for a specific album, including quality info.
   */
  async function getTrackFiles(albumId) {
    return request(`/trackFile?albumId=${albumId}`);
  }

  /**
   * Collapse a set of history records into a per-album map, preferring records
   * that represent a real import (downloadImported / trackFileImported) over
   * grabs so a single torrent's albums each carry their best-known event/quality.
   */
  function buildAlbumMap(records) {
    const albumMap = new Map();
    for (const m of records) {
      if (m.albumId) {
        const existing = albumMap.get(m.albumId);
        const isImported = IMPORTED_EVENTS.has(m.eventType);
        if (!existing || isImported) {
          albumMap.set(m.albumId, {
            albumId: m.albumId,
            artistId: m.artistId,
            quality: m.quality,
            eventType: m.eventType,
          });
        }
      }
    }
    return albumMap;
  }

  /**
   * Search queue/history for a torrent hash and return associated album(s).
   * A single torrent can contain multiple albums (e.g. a discography pack).
   *
   * Lookup order mirrors the Radarr/Sonarr clients:
   *   1. Queue by downloadId (client-side filter — the queue ignores the param),
   *      trying every hash case variant.
   *   2. History by downloadId (server-side exact match; the upper-cased variant
   *      matters because Lidarr persists torrent hashes uppercase).
   *   3. sourceTitle fallback: scan recent history and match the grabbed release
   *      title against the torrent name (rescues localized-artist cases).
   */
  async function getAlbumsByHash(torrentHash, torrentName = null) {
    const variants = hashVariants(torrentHash);
    const variantSet = new Set(variants.map(v => v.toLowerCase()));
    const matchesAnyVariant = (id) => typeof id === 'string' && variantSet.has(id.toLowerCase());

    // 1. Queue — no server-side downloadId filter, so fetch and filter in memory.
    try {
      const queue = await request('/queue?pageSize=200&includeAlbum=true&includeArtist=true');
      const records = queue.records || queue;
      if (Array.isArray(records)) {
        const matched = records.filter(r => matchesAnyVariant(r.downloadId));
        if (matched.length > 0) {
          const first = matched[0];
          return {
            source: 'queue',
            artistId: first.artistId || first.artist?.id,
            artist: first.artist || null,
            // Queue items are still importing — no import event yet, so phase1
            // will treat them as not-yet-imported and revisit next run.
            albums: matched.map(m => ({
              albumId: m.albumId || m.album?.id,
              album: m.album,
              quality: m.quality,
              eventType: 'queue',
            })),
          };
        }
      }
    } catch (e) {
      // Queue check is optional, continue to history
    }

    // 2. History by downloadId (exact server-side match; confirm client-side too).
    for (const hash of variants) {
      try {
        const history = await request(`/history?downloadId=${hash}`);
        const records = history.records || history;
        if (Array.isArray(records) && records.length > 0) {
          const filtered = records.filter(r => !r.downloadId || matchesAnyVariant(r.downloadId));
          const albumMap = buildAlbumMap(filtered);
          if (albumMap.size > 0) {
            const seed = filtered.find(r => r.artistId);
            return {
              source: 'history',
              artistId: seed?.artistId,
              albums: Array.from(albumMap.values()),
            };
          }
        }
      } catch (e) {
        // continue to next variant / fallback
      }
    }

    // 3. Fallback: scan recent history for a matching sourceTitle.
    if (torrentName) {
      try {
        const wanted = normalizeReleaseTitle(torrentName);
        const history = await request('/history?page=1&pageSize=1000&sortKey=date&sortDirection=descending');
        const all = history.records || history;
        if (Array.isArray(all)) {
          const seed = all.find(r =>
            r.albumId && r.artistId && r.sourceTitle &&
            normalizeReleaseTitle(r.sourceTitle) === wanted
          );
          if (seed) {
            const matched = all.filter(r =>
              r.artistId === seed.artistId &&
              r.sourceTitle &&
              normalizeReleaseTitle(r.sourceTitle) === wanted
            );
            const albumMap = buildAlbumMap(matched);
            return {
              source: 'history-name',
              artistId: seed.artistId,
              albums: Array.from(albumMap.values()),
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
   * Path-based history lookup. Scans recent history for a record whose
   * `data.droppedPath` / `data.importedPath` contains the torrent's name —
   * the tertiary tie when neither infohash nor sourceTitle matched.
   */
  async function findAlbumsByPath(torrentName) {
    if (!torrentName) return null;

    const needle = torrentName.toLowerCase();
    const matchesNeedle = (val) => typeof val === 'string' && val.toLowerCase().includes(needle);

    try {
      const history = await request('/history?page=1&pageSize=1000&sortKey=date&sortDirection=descending');
      const all = history.records || history;
      if (!Array.isArray(all)) return null;

      const seed = all.find(r =>
        r.albumId && r.artistId && r.data && (
          matchesNeedle(r.data.droppedPath) ||
          matchesNeedle(r.data.importedPath) ||
          matchesNeedle(r.data.path)
        )
      );
      if (!seed) return null;

      const matched = all.filter(r =>
        r.artistId === seed.artistId && r.data && (
          matchesNeedle(r.data.droppedPath) ||
          matchesNeedle(r.data.importedPath) ||
          matchesNeedle(r.data.path)
        )
      );

      const albumMap = buildAlbumMap(matched);
      return {
        source: 'history-path',
        artistId: seed.artistId,
        albums: Array.from(albumMap.values()),
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Set specific albums to unmonitored via Lidarr's bulk monitor endpoint.
   * Only changes album-level monitoring, not the artist.
   */
  async function setAlbumsUnmonitored(albumIds) {
    if (!albumIds || albumIds.length === 0) return null;
    return request('/album/monitor', {
      method: 'PUT',
      body: JSON.stringify({
        albumIds,
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
    getArtists,
    getArtistById,
    getTrackFiles,
    getAlbumsByHash,
    findAlbumsByPath,
    setAlbumsUnmonitored,
    getQualityProfiles,
    getQualityProfile,
    request,
    requestRaw,
  };
}
