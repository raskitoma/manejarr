/**
 * Series filename parsing helpers.
 *
 * Used by both the manual-match endpoint and the orchestrator engine
 * so a single torrent matched by the user can group with related episodes
 * sharing the same base name.
 */

/**
 * Extract the base series name from a torrent filename.
 *
 * Strips episode identifiers (S01E05, 1x05, "Season X", "Complete"), brackets,
 * and quality/release-group cruft to produce a normalized lowercase key
 * suitable for grouping torrents from the same series.
 *
 * Examples:
 *   "The Boss 2022 S04E07 The Bosses House 1080p" -> "the boss 2022"
 *   "Greys.Anatomy.S22E17.1080p.WEB.h264"          -> "greys anatomy"
 *   "Some.Show.1x05.HDTV"                          -> "some show"
 *   "Series.Name.Season.4.Complete"                -> "series name"
 *
 * @param {string} name
 * @returns {string|null} normalized base, or null if not extractable
 */
export function extractSeriesBase(name) {
  if (!name) return null;

  const cleaned = name
    .replace(/[._\-]/g, ' ')
    .replace(/\b(S\d{1,2})(E\d{1,3})?\b.*/i, '')
    .replace(/\b\d{1,2}x\d{1,3}\b.*/i, '')
    .replace(/\b(Season|Complete|COMPLETE)\b.*/i, '')
    .replace(/\((\d{4})\)/g, '$1')
    .replace(/[\[\](){}]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .toLowerCase();

  return cleaned.length >= 2 ? cleaned : null;
}

/**
 * True if the name has an unambiguous series marker: S01E05 / S01 /
 * 1x05 / 1x05x06 / "Season X" / "Episode X" / anime absolute episode
 * forms like "- 12 [1080p]". Used to route to Sonarr-only paths.
 */
export function isSeriesPattern(name) {
  if (!name) return false;
  return /\b(S\d{1,2}(E\d{1,3})?|\d{1,2}x\d{1,3}|Season\s*\d+|Episode\s*\d+)\b/i.test(name);
}

/**
 * True if the name looks like a movie release: has a 4-digit year and
 * no series markers. Used to route to Radarr-only paths.
 */
export function isMoviePattern(name) {
  if (!name) return false;
  if (isSeriesPattern(name)) return false;
  return /\b(19|20)\d{2}\b/.test(name);
}

/**
 * Build a Map<seriesBase, seriesId> from a list of torrents whose hashes
 * appear in the provided metadata cache as Sonarr matches.
 *
 * @param {Array<{hash: string, name: string}>} torrents
 * @param {Object} existingMetadata - keyed by hash, values from getAllTorrentMetadata()
 * @returns {Map<string, number>}
 */
export function buildSeriesBaseMap(torrents, existingMetadata = {}) {
  const map = new Map();
  if (!torrents || !existingMetadata) return map;

  for (const torrent of torrents) {
    const cached = existingMetadata[torrent.hash];
    if (!cached || cached.manager !== 'sonarr') continue;

    const seriesId = cached.metadata?.manualMatchId || cached.metadata?.id;
    if (!seriesId) continue;

    const base = extractSeriesBase(torrent.name);
    if (base && !map.has(base)) {
      map.set(base, seriesId);
    }
  }

  return map;
}
