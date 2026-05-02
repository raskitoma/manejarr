/**
 * Shared metadata builders for Radarr movies and Sonarr series.
 *
 * Used by the engine's phase1 (during a run) and by the route handlers for
 * manual match / per-torrent auto-rematch so that the persisted metadata
 * always carries the same shape — title, year, images, infoUrl, managerUrl —
 * regardless of how the match was made. That way the dashboard hover card
 * always has a poster to show even before the next orchestration run.
 */

export function buildRadarrMetadata(movie) {
  if (!movie) return null;
  let infoUrl = null;
  if (movie.imdbId) {
    infoUrl = `https://www.imdb.com/title/${movie.imdbId}`;
  } else if (movie.tmdbId) {
    infoUrl = `https://www.themoviedb.org/movie/${movie.tmdbId}`;
  }

  return {
    title: movie.title,
    year: movie.year,
    images: movie.images || [],
    infoUrl,
    managerUrl: `/movie/${movie.id}`,
    id: movie.id,
    // External IDs persisted so the hover card can fall back to TMDB/IMDb
    // posters/info pages when the *arr's local image is missing.
    imdbId: movie.imdbId || null,
    tmdbId: movie.tmdbId || null,
  };
}

export function buildSonarrMetadata(series) {
  if (!series) return null;
  let infoUrl = null;
  if (series.imdbId) {
    infoUrl = `https://www.imdb.com/title/${series.imdbId}`;
  } else if (series.tvdbId) {
    infoUrl = `https://www.thetvdb.com/series/${series.tvdbId}`;
  }

  return {
    title: series.title,
    year: series.year,
    images: series.images || [],
    infoUrl,
    managerUrl: `/series/${series.id}`,
    id: series.id,
    // External IDs persisted so the hover card can fall back to TVDB/IMDb
    // posters/info pages when the *arr's local image is missing.
    tvdbId: series.tvdbId || null,
    imdbId: series.imdbId || null,
    tmdbId: series.tmdbId || null,
  };
}

/**
 * Normalize a torrent / release title for case-insensitive comparison
 * across Sonarr/Radarr history sourceTitle fields.
 *
 * Strips the file extension, collapses dot/underscore/dash to spaces,
 * lowercases, and trims so "The.Boss.2022.S04E06.1080p.WEB-DL.mkv"
 * and "The Boss 2022 S04E06 1080p WEB-DL" compare as equal.
 */
export function normalizeReleaseTitle(name) {
  if (!name) return '';
  return String(name)
    .replace(/\.(mkv|avi|mp4|wmv|flv|mov|m4v|ts|webm)$/i, '')
    .replace(/[._-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Hash variants used to defensively probe Sonarr/Radarr history.
 * Different download clients store the infohash in different cases,
 * and Sonarr/Radarr persist whatever the client reported, so we try
 * the as-given value plus upper/lower forms, deduplicated.
 */
export function hashVariants(hash) {
  if (!hash) return [];
  const seen = new Set();
  const out = [];
  for (const v of [hash, hash.toUpperCase(), hash.toLowerCase()]) {
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}
