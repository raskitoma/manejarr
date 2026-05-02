/**
 * Torrent Card Component
 */

import { formatSize, formatDuration, formatRatio, formatDate, getLabelBadgeClass } from '../utils/formatters.js';

const SOURCE_LABELS = {
  hash:           { label: 'hash',     tier: 'authoritative', desc: 'Matched by infohash recorded in the *arr history. Authoritative.' },
  queue:          { label: 'queue',    tier: 'authoritative', desc: 'Found in the *arr active downloads queue — the *arr is currently downloading or importing this torrent. Authoritative.' },
  history:        { label: 'history',  tier: 'authoritative', desc: 'Matched by infohash recorded in the *arr import history. Authoritative.' },
  'history-name': { label: 'name',     tier: 'strong',        desc: 'Matched by release name (sourceTitle) in the *arr import history.' },
  'history-path': { label: 'path',     tier: 'strong',        desc: 'Matched by download path in the *arr import history.' },
  parse:          { label: 'parse',    tier: 'heuristic',     desc: 'Matched by *arr filename parser. Heuristic — verify before trusting.' },
  'series-base':  { label: 'grouped',  tier: 'inferred',      desc: 'Inferred from another already-matched episode of the same series.' },
  manual:         { label: 'manual',   tier: 'manual',        desc: 'Manually linked by you.' },
};

const escAttr = (s) => String(s ?? '').replace(/"/g, '&quot;');
const escHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * Pull the SxxExx episode marker out of a torrent name. Returns null if
 * none can be extracted (e.g. season pack, anime absolute numbering).
 *
 * Recognized forms:
 *   "Show.S04E07.1080p..."   → "S04E07"
 *   "Show 4x07 ..."          → "S04E07"
 *   "Show.S04.Complete..."   → "S04"
 */
function extractEpisodeTag(name) {
  if (!name) return null;
  const m = /\b[Ss](\d{1,2})[Ee](\d{1,3})\b/.exec(name);
  if (m) {
    const s = String(parseInt(m[1], 10)).padStart(2, '0');
    const e = String(parseInt(m[2], 10)).padStart(2, '0');
    return `S${s}E${e}`;
  }
  const x = /\b(\d{1,2})x(\d{1,3})\b/.exec(name);
  if (x) {
    const s = String(parseInt(x[1], 10)).padStart(2, '0');
    const e = String(parseInt(x[2], 10)).padStart(2, '0');
    return `S${s}E${e}`;
  }
  const seasonOnly = /\b[Ss](\d{1,2})\b/.exec(name);
  if (seasonOnly) {
    return `S${String(parseInt(seasonOnly[1], 10)).padStart(2, '0')}`;
  }
  return null;
}

/**
 * Build an external info URL for a matched item.
 * Radarr → TMDB → IMDb
 * Sonarr → TVDB → IMDb → TMDB
 */
function externalInfoUrl(manager, metadata) {
  if (!metadata) return null;
  const m = (manager || '').toLowerCase();
  if (m === 'radarr') {
    if (metadata.tmdbId) return { url: `https://www.themoviedb.org/movie/${metadata.tmdbId}`, label: 'TMDB' };
    if (metadata.imdbId) return { url: `https://www.imdb.com/title/${metadata.imdbId}`, label: 'IMDb' };
  } else if (m === 'sonarr') {
    if (metadata.tvdbId) return { url: `https://www.thetvdb.com/dereferrer/series/${metadata.tvdbId}`, label: 'TVDB' };
    if (metadata.imdbId) return { url: `https://www.imdb.com/title/${metadata.imdbId}`, label: 'IMDb' };
    if (metadata.tmdbId) return { url: `https://www.themoviedb.org/tv/${metadata.tmdbId}`, label: 'TMDB' };
  }
  return null;
}

export function renderTorrentRow(torrent) {
  const labelClass = getLabelBadgeClass(torrent.label);

  const hasReason = torrent.reason && torrent.reason !== 'Criteria not met';

  // Resolve match source (handles legacy manual matches that lack metadata.source)
  let sourceKey = torrent.metadata?.source || null;
  if (!sourceKey && torrent.metadata?.manualMatchId) sourceKey = 'manual';
  const sourceInfo = sourceKey ? SOURCE_LABELS[sourceKey] : null;

  const managerAttr = torrent.manager ? `data-manager="${torrent.manager}"` : '';
  const nameAttr = escAttr(torrent.name);

  // ── Match actions: compact toggle + dropdown menu ────────────────────────
  let toggleInner;
  let toggleVariantClass;
  let menuInner;
  let menuExtraClass = '';

  if (torrent.manager) {
    const mgrCap = torrent.manager.charAt(0).toUpperCase() + torrent.manager.slice(1);
    const mgrLower = torrent.manager.toLowerCase();
    toggleVariantClass = `match-actions-toggle--${mgrLower}`;
    toggleInner = `
      <span class="match-actions-label">${torrent.manager.toUpperCase()}</span>
      <span class="match-actions-chevron">▾</span>
    `;

    // Poster column — moves to the RIGHT of the entire menu. Three-tier
    // poster source chain:
    //   1. Persisted *arr image URL via the proxy (fast, local cache).
    //   2. The image's `remoteUrl` (TMDB / TVDB CDN — set as data-remote
    //      and used by the onerror handler when 1 fails).
    //   3. NEW: a server-side live fallback at /api/dashboard/poster that
    //      re-queries getMovie/getSeriesById and pipes the current poster.
    //      Used when the persisted `images` array is empty (older matches
    //      saved before images were stored, or items the *arr has since
    //      re-cached). Set as `data-live`; onerror promotes to it after
    //      the proxy + remote fallbacks are exhausted.
    const md = torrent.metadata || {};
    const poster = md.images?.find(img => img.coverType === 'poster');
    const fanart = md.images?.find(img => img.coverType === 'fanart');
    const fallbackImg = poster || fanart;
    const liveFallbackUrl = md.id ? `/api/dashboard/poster?manager=${mgrLower}&id=${md.id}` : '';

    let posterHtml;
    if (fallbackImg && fallbackImg.url) {
      const proxy = `/api/dashboard/proxy-image?manager=${mgrLower}&url=${encodeURIComponent(fallbackImg.url)}`;
      const remote = fallbackImg.remoteUrl || '';
      posterHtml = `<img class="match-menu-poster"
                         src="${proxy}"
                         data-remote="${escAttr(remote)}"
                         data-live="${escAttr(liveFallbackUrl)}"
                         onerror="window.__manejarrMenuPosterFallback(this)">`;
    } else if (liveFallbackUrl) {
      // No persisted images at all — go straight to the live endpoint.
      posterHtml = `<img class="match-menu-poster"
                         src="${liveFallbackUrl}"
                         data-live-tried="1"
                         onerror="window.__manejarrMenuPosterFallback(this)">`;
    } else {
      posterHtml = `<div class="match-menu-poster empty">No Poster</div>`;
    }
    menuExtraClass = 'has-poster';

    const titleText = md.title || torrent.title || '—';
    const yearText = md.year ? ` <span class="match-hero-year">(${md.year})</span>` : '';

    const hero = `
      <div class="match-hero">
        <div class="match-hero-title">${escHtml(titleText)}${yearText}</div>
        <div class="match-hero-mgr">${mgrCap}</div>
      </div>
    `;

    const sourceBlock = sourceInfo ? `
      <div class="match-actions-divider"></div>
      <div class="match-source-info">
        <div class="match-source-info-row">
          <span class="match-source-pill match-source-${sourceInfo.tier}">${sourceInfo.label}</span>
          <span class="match-source-info-label">Match source</span>
        </div>
        <div class="match-source-desc">${sourceInfo.desc}</div>
      </div>
    ` : '';

    const reasonBlock = hasReason ? `
      <div class="match-actions-divider"></div>
      <div class="match-source-info">
        <div class="match-source-info-label">Last run</div>
        <div class="match-source-desc">${escHtml(torrent.reason)}</div>
      </div>
    ` : '';

    const viewLink = torrent.managerUrl
      ? `<a class="match-actions-item" href="${torrent.managerUrl}" target="_blank" rel="noopener">
           <span class="match-actions-icon">🔗</span><span>View in ${mgrCap}</span>
         </a>`
      : '';

    const ext = externalInfoUrl(torrent.manager, md);
    const externalLink = ext
      ? `<a class="match-actions-item" href="${ext.url}" target="_blank" rel="noopener">
           <span class="match-actions-icon">🌐</span><span>View on ${ext.label}</span>
         </a>`
      : '';

    menuInner = `
      <div class="match-menu-content">
        ${hero}
        ${sourceBlock}
        ${reasonBlock}
        <div class="match-actions-divider"></div>
        ${viewLink}
        ${externalLink}
        <button type="button" class="match-actions-item link-torrent-btn" data-hash="${torrent.hash}" data-name="${nameAttr}">
          <span class="match-actions-icon">🔄</span><span>Edit match</span>
        </button>
        <button type="button" class="match-actions-item auto-rematch-btn" data-hash="${torrent.hash}" data-name="${nameAttr}">
          <span class="match-actions-icon">⚡</span><span>Auto-match</span>
        </button>
        <div class="match-actions-divider"></div>
        <button type="button" class="match-actions-item match-actions-danger unlink-torrent-btn" data-hash="${torrent.hash}" data-name="${nameAttr}">
          <span class="match-actions-icon">❌</span><span>Remove match</span>
        </button>
      </div>
      ${posterHtml}
    `;
  } else {
    toggleVariantClass = 'match-actions-toggle--no-match';
    toggleInner = `
      <span class="match-actions-label">MATCH</span>
      <span class="match-actions-chevron">▾</span>
    `;

    const reasonBlock = hasReason ? `
      <div class="match-source-info">
        <div class="match-source-info-label">Last run</div>
        <div class="match-source-desc">${escHtml(torrent.reason)}</div>
      </div>
      <div class="match-actions-divider"></div>
    ` : '';

    menuInner = `
      ${reasonBlock}
      <button type="button" class="match-actions-item link-torrent-btn" data-hash="${torrent.hash}" data-name="${nameAttr}">
        <span class="match-actions-icon">🔗</span><span>Manual match</span>
      </button>
      <button type="button" class="match-actions-item auto-rematch-btn" data-hash="${torrent.hash}" data-name="${nameAttr}">
        <span class="match-actions-icon">⚡</span><span>Auto-match</span>
      </button>
    `;
  }

  // ── Primary / secondary name lines ───────────────────────────────────
  // Matched: primary = "<Movie Title> (Year)" for Radarr,
  //          "<Series Title> (Year) SxxExx" for Sonarr.
  //          secondary = torrent name (muted, smaller).
  // Unmatched: primary = torrent name, no secondary.
  let primaryText;
  let secondaryText = '';
  if (torrent.manager) {
    const md = torrent.metadata || {};
    const matchedTitle = md.title || torrent.title || torrent.name;
    const yearStr = md.year ? ` (${md.year})` : '';
    if (torrent.manager.toLowerCase() === 'sonarr') {
      const tag = extractEpisodeTag(torrent.name);
      primaryText = `${matchedTitle}${yearStr}${tag ? ` ${tag}` : ''}`;
    } else {
      primaryText = `${matchedTitle}${yearStr}`;
    }
    secondaryText = torrent.name;
  } else {
    primaryText = torrent.name;
  }

  const primaryAttr = escAttr(primaryText);
  const secondaryAttr = escAttr(secondaryText);
  const secondaryHtml = secondaryText
    ? `<span class="torrent-name-secondary" title="${secondaryAttr}">${escHtml(secondaryText)}</span>`
    : '';

  return `
    <tr data-hash="${torrent.hash}" ${managerAttr}>
      <td class="text-primary-col">
        <div class="torrent-name-stack">
          <span class="torrent-name-text" title="${primaryAttr}">${escHtml(primaryText)}</span>
          ${secondaryHtml}
        </div>
      </td>
      <td>
        <div class="match-actions" data-mc-id="${torrent.hash}">
          <button type="button" class="match-actions-toggle ${toggleVariantClass}">
            ${toggleInner}
          </button>
          <div class="match-actions-menu ${menuExtraClass} hidden" data-match-home="${torrent.hash}">
            ${menuInner}
          </div>
        </div>
      </td>
      <td><span class="badge ${labelClass}">${torrent.label || 'none'}</span></td>
      <td class="text-mono" data-val="${torrent.ratio}">${formatRatio(torrent.ratio)}</td>
      <td class="text-mono" data-val="${torrent.seedingTime}">${formatDuration(torrent.seedingTime)}</td>
      <td data-val="${torrent.totalSize}">${formatSize(torrent.totalSize)}</td>
      <td data-val="${torrent.timeAdded}">${formatDate(torrent.timeAdded)}</td>
      <td class="text-mono" style="max-width: 120px; overflow: hidden; text-overflow: ellipsis;" title="${torrent.trackerHost || ''}">${torrent.trackerHost || '—'}</td>
      <td><span class="badge badge-${torrent.state === 'Seeding' ? 'success' : torrent.state === 'Paused' ? 'warning' : 'info'}">${torrent.state || '—'}</span></td>
    </tr>
  `;
}
