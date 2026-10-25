/**
 * Quality Comparison Utilities
 *
 * Compares file quality against *arr quality profile cutoffs to determine
 * if a download meets or exceeds the requested quality.
 */

/**
 * Known quality resolution hierarchy (higher index = higher quality).
 * Used as a fallback when quality profile ordering isn't available.
 */
const QUALITY_HIERARCHY = [
  'unknown',
  'sdtv',
  'dvd',
  'webdl-480p',
  'webrip-480p',
  'bluray-480p',
  'hdtv-720p',
  'webdl-720p',
  'webrip-720p',
  'bluray-720p',
  'hdtv-1080p',
  'webdl-1080p',
  'webrip-1080p',
  'bluray-1080p',
  'remux-1080p',
  'hdtv-2160p',
  'webdl-2160p',
  'webrip-2160p',
  'bluray-2160p',
  'remux-2160p',
];

/**
 * Flatten a quality profile's items array to get an ordered list of quality IDs.
 * Quality profiles can have nested groups; this extracts all individual qualities.
 *
 * @param {Object} profile - The quality profile from *arr API
 * @returns {number[]} - Ordered array of quality IDs (index 0 = lowest priority)
 */
export function flattenProfileQualities(profile) {
  const qualities = [];

  if (!profile || !profile.items) return qualities;

  for (const item of profile.items) {
    if (item.quality) {
      // Single quality item
      if (item.allowed) {
        qualities.push(item.quality.id);
      }
    } else if (item.items && item.allowed !== false) {
      // Quality group
      for (const subItem of item.items) {
        if (subItem.quality && subItem.allowed !== false) {
          qualities.push(subItem.quality.id);
        }
      }
    }
  }

  return qualities;
}

/**
 * Build a Map<id, rank> for a quality profile where each allowed profile step
 * gets an increasing rank, and quality groups assign the same rank to both the
 * group's own `item.id` (used when `profile.cutoff` points at a group such as
 * Lidarr's "Lossless" id=1005 or Radarr/Sonarr's "WEB 1080p" id=1000) and all
 * of its member `subItem.quality.id` values.
 *
 * @param {Object} profile - The quality profile from *arr API
 * @returns {Map<number, number>}
 */
function buildProfileRankMap(profile) {
  const rankById = new Map();
  if (!profile || !Array.isArray(profile.items)) return rankById;

  let rank = 0;
  for (const item of profile.items) {
    if (item.quality) {
      if (item.allowed) {
        rankById.set(item.quality.id, rank++);
      }
    } else if (Array.isArray(item.items) && item.allowed !== false) {
      const groupRank = rank++;
      if (item.id !== undefined) {
        rankById.set(item.id, groupRank);
      }
      for (const subItem of item.items) {
        if (subItem.quality && subItem.allowed !== false) {
          rankById.set(subItem.quality.id, groupRank);
        }
      }
    }
  }

  return rankById;
}

/**
 * Check if a file's quality meets or exceeds the profile's cutoff.
 *
 * In *arr quality profiles:
 * - Items are ordered from lowest to highest preference
 * - The "cutoff" is a quality ID (or quality group ID) that represents "good enough"
 * - Once a file meets or exceeds the cutoff, no further upgrades are sought
 *
 * @param {Object} fileQuality - The quality object from the file (has .quality.id)
 * @param {Object} profile - The quality profile from *arr API
 * @returns {boolean} - True if the file meets or exceeds the cutoff
 */
export function meetsQualityCutoff(fileQuality, profile) {
  if (!fileQuality || !profile) return false;

  const fileQualityId = fileQuality?.quality?.id ?? fileQuality?.id;
  const cutoffId = profile.cutoff;

  if (fileQualityId === undefined || cutoffId === undefined) return false;

  // If file quality matches the cutoff exactly, it passes
  if (fileQualityId === cutoffId) return true;

  const rankMap = buildProfileRankMap(profile);
  const fileRank = rankMap.get(fileQualityId);
  const cutoffRank = rankMap.get(cutoffId);

  // If either quality isn't found in the profile, use fallback hierarchy
  if (fileRank === undefined || cutoffRank === undefined) {
    return fileQualityId >= cutoffId; // Higher ID generally means higher quality
  }

  // File quality is at or above the cutoff in the ordered profile steps
  return fileRank >= cutoffRank;
}

/**
 * Get a human-readable quality name from a quality object.
 */
export function getQualityName(quality) {
  if (!quality) return 'Unknown';
  if (quality.quality?.name) return quality.quality.name;
  if (quality.name) return quality.name;
  return 'Unknown';
}

/**
 * Compare two quality names using the fallback hierarchy.
 * Returns: positive if a > b, negative if a < b, 0 if equal.
 */
export function compareQualityNames(a, b) {
  const normalize = name => (name || '').toLowerCase().replace(/\s+/g, '-');
  const indexA = QUALITY_HIERARCHY.indexOf(normalize(a));
  const indexB = QUALITY_HIERARCHY.indexOf(normalize(b));
  return (indexA === -1 ? -1 : indexA) - (indexB === -1 ? -1 : indexB);
}
