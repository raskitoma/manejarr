/**
 * Dashboard Page
 */

import { api } from '../utils/api.js';
import { formatSize, formatDuration, formatRatio, formatDate, getLabelBadgeClass } from '../utils/formatters.js';
import { renderRunButtons, setRunButtonsEnabled } from '../components/runButton.js';
import { updateRunPill } from '../components/navbar.js';
import { renderTorrentRow } from '../components/torrentCard.js';
import { showToast } from '../components/toast.js';
import { t } from '../utils/i18n.js';
import { renderCustomSelect, attachCustomSelect } from '../components/customSelect.js';

let refreshInterval = null;
let rematchPollInterval = null;
let allTorrents = [];
let connectionInfo = null;
let currentDashboardPage = 1;
let sortField = 'timeAdded';
let sortDirection = 'desc';
let searchQuery = '';
let labelFilterValue = '';
const DASHBOARD_PAGE_SIZE = 10;

function clearRematchPoll() {
  if (rematchPollInterval) {
    clearInterval(rematchPollInterval);
    rematchPollInterval = null;
  }
}

/**
 * Mutually-exclusive action-button state. When ANY of Rematch All /
 * Run Now / Dry Run is in flight, all three are disabled. Only the button
 * that *started* the run shows the spinner.
 *
 * The server reports rematch runs with `runType: 'manual'` (same as
 * Run Now) so we mask that to a synthetic `'rematch'` runType when the
 * caller passes `originator: 'rematch'` OR the rematch poller is active
 * — that prevents Run Now from getting animated during a rematch run.
 */
function syncActionButtons(runStatus, hasTorrents, originator = null) {
  const running = !!runStatus?.running;
  const isRematch = originator === 'rematch' || !!rematchPollInterval;

  const rematchBtn = document.getElementById('rematch-all-btn');
  if (rematchBtn) {
    rematchBtn.disabled = running;
    if (!running && !rematchPollInterval) {
      rematchBtn.innerHTML = `<span class="btn-icon">🔄</span> ${t('rematch_all')}`;
    }
  }

  // Mask runType so setRunButtonsEnabled sees 'rematch' (unrecognized →
  // disable both run/dry buttons without animating either).
  const effectiveStatus = (running && isRematch)
    ? { ...runStatus, runType: 'rematch' }
    : (runStatus || { running: false });
  setRunButtonsEnabled(hasTorrents, effectiveStatus);

  // Live-update the topbar pill so it reflects the run state within ~2s
  // (poll cadence) instead of waiting for the 30s connection refresh.
  updateRunPill(runStatus || { running: false });
}

/**
 * Build a URL to the external info site for a given match — used as the
 * "view on source" link inside the "No Poster" placeholder. Radarr falls
 * back through TMDB → IMDb; Sonarr falls back through TVDB → IMDb → TMDB.
 */
function buildExternalPosterPage(manager, metadata) {
  if (!metadata) return null;
  const m = manager?.toLowerCase();
  if (m === 'radarr') {
    if (metadata.tmdbId) return `https://www.themoviedb.org/movie/${metadata.tmdbId}`;
    if (metadata.imdbId) return `https://www.imdb.com/title/${metadata.imdbId}`;
  } else if (m === 'sonarr') {
    if (metadata.tvdbId) return `https://www.thetvdb.com/dereferrer/series/${metadata.tvdbId}`;
    if (metadata.imdbId) return `https://www.imdb.com/title/${metadata.imdbId}`;
    if (metadata.tmdbId) return `https://www.themoviedb.org/tv/${metadata.tmdbId}`;
  }
  return metadata.infoUrl || null;
}

// Global poster-error handler. Called inline by the hover card's <img onerror>.
// First miss → swap to the image's `remoteUrl` (TMDB/TVDB CDN). Second miss →
// replace the broken <img> with a clickable "No Poster" tile that links to
// the external info page when one is known.
if (!window.__manejarrPosterFallback) {
  window.__manejarrPosterFallback = function (img) {
    if (!img) return;
    if (img.dataset.fallbackTried !== '1' && img.dataset.remote) {
      img.dataset.fallbackTried = '1';
      img.src = img.dataset.remote;
      return;
    }
    img.onerror = null;
    const ext = img.dataset.external;
    const html = ext
      ? `<a class="hover-card-poster empty-poster" href="${ext}" target="_blank" rel="noopener">No Poster<br><small>View on source</small></a>`
      : `<div class="hover-card-poster empty-poster">No Poster</div>`;
    img.outerHTML = html;
  };
}

// Three-tier fallback for the in-menu poster: proxy (cached *arr image)
// → remote (TMDB / TVDB CDN) → live (`/api/dashboard/poster?…` which
// re-queries getMovie/getSeriesById on the *arr) → "No Poster" tile.
// Keeps the right-column layout intact when *every* source 404s.
if (!window.__manejarrMenuPosterFallback) {
  window.__manejarrMenuPosterFallback = function (img) {
    if (!img) return;
    // 1 → 2: cached proxy URL failed, try the remote CDN URL.
    if (img.dataset.fallbackTried !== '1' && img.dataset.remote) {
      img.dataset.fallbackTried = '1';
      img.src = img.dataset.remote;
      return;
    }
    // 2 → 3: remote also failed, try live re-fetch from the *arr.
    if (img.dataset.liveTried !== '1' && img.dataset.live) {
      img.dataset.liveTried = '1';
      img.src = img.dataset.live;
      return;
    }
    img.onerror = null;
    img.outerHTML = '<div class="match-menu-poster empty">No Poster</div>';
  };
}

export async function renderDashboard() {
  const container = document.getElementById('page-content');
  if (!container) return;

  container.innerHTML = `
    <div class="stats-grid" id="stats-grid">
      ${renderStatsSkeleton()}
    </div>

    <div class="section-header">
      <div class="section-title-block">
        <h2 class="section-title">
          <span class="section-title-icon">🌀</span>
          <span class="section-title-text">${t('torrent_overview')}</span>
          <span class="section-title-count" id="torrent-overview-count">—</span>
        </h2>
        <div class="section-title-sub" id="torrent-overview-sub">${t('connecting') || 'Loading…'}</div>
      </div>
      <div class="flex items-center gap-md">
        <div class="search-container">
          <span class="search-icon">🔍</span>
          <input type="text" id="torrent-search" class="form-input search-input" placeholder="${t('search')}...">
        </div>
        <button class="btn btn-accent" id="rematch-all-btn" title="Clear all cached matches and re-run matching">
          <span class="btn-icon">🔄</span> ${t('rematch_all')}
        </button>
        <div id="run-buttons"></div>
        ${renderCustomSelect({
          id: 'label-filter',
          value: '',
          options: [
            { value: '',           label: t('all_labels') },
            { value: 'media',      label: t('media'),       icon: '📥' },
            { value: 'ignore',     label: t('ignore'),      icon: '⏳' },
            { value: 'fordeletion',label: t('for_deletion'),icon: '🗑️' },
          ],
          minWidth: '160px',
        })}
      </div>
    </div>

    <div class="table-container" id="torrent-table-container">
      <table class="table">
        <thead>
          <tr>
            <th class="th-sortable" data-sort="name">${t('name')}</th>
            <th class="th-sortable" data-sort="manager">Manager</th>
            <th class="th-sortable" data-sort="label">${t('label')}</th>
            <th class="th-sortable" data-sort="ratio">${t('ratio')}</th>
            <th class="th-sortable" data-sort="seedingTime">${t('seed_time')}</th>
            <th class="th-sortable" data-sort="totalSize">${t('size')}</th>
            <th class="th-sortable" data-sort="timeAdded">${t('added')}</th>
            <th>Tracker</th>
            <th class="th-sortable" data-sort="state">State</th>
          </tr>
        </thead>
        <tbody id="torrent-table-body">
          <tr><td colspan="9" class="text-center text-muted" style="padding: var(--space-2xl);">
            <div class="spinner-lg" style="margin: 0 auto var(--space-md);"></div>
            ${t('connecting')}
          </td></tr>
        </tbody>
      </table>
    </div>
    
    <!-- Pagination -->
    <div id="dashboard-pagination" class="pagination"></div>

    <!-- Persistent Hover Card -->
    <div id="hover-card" class="hover-card"></div>
  `;

  initDashboardEvents();
  await loadDashboardData();

  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(loadDashboardData, 30000);

  clearRematchPoll();
}

function initDashboardEvents() {
  // Label filter
  attachCustomSelect('label-filter', (value) => {
    labelFilterValue = value;
    // Reflect the new selection in the visible toggle so it updates without
    // a full re-render. Re-rendering would tear down other component state.
    const toggle = document.querySelector('.custom-select[data-cs-id="label-filter"] .custom-select-value');
    if (toggle) {
      const opt = [
        { value: '',           label: t('all_labels') },
        { value: 'media',      label: t('media') },
        { value: 'ignore',     label: t('ignore') },
        { value: 'fordeletion',label: t('for_deletion') },
      ].find(o => o.value === value);
      if (opt) toggle.textContent = opt.label;
    }
    currentDashboardPage = 1;
    renderFilteredTorrents();
  });

  // Search input
  document.getElementById('torrent-search')?.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
    currentDashboardPage = 1;
    renderFilteredTorrents();
  });

  // Sorting
  document.querySelectorAll('.th-sortable').forEach(th => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (sortField === field) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        sortField = field;
        sortDirection = 'asc';
      }
      
      // Update UI classes
      document.querySelectorAll('.th-sortable').forEach(el => {
        el.classList.remove('sort-asc', 'sort-desc');
      });
      th.classList.add(`sort-${sortDirection}`);
      
      renderFilteredTorrents();
    });
    
    // Set initial sort class
    if (th.dataset.sort === sortField) {
      th.classList.add(`sort-${sortDirection}`);
    }
  });

  // Hover Card Logic
  const hoverCard = document.getElementById('hover-card');
  const tableBody = document.getElementById('torrent-table-body');
  let hideTimeout = null;
  
  if (tableBody && hoverCard) {
    const showCard = (metadata, manager, targetTr, mouseX, mouseY) => {
      if (hideTimeout) clearTimeout(hideTimeout);

      // Three-tier poster fallback:
      //   1. *arr-cached image fetched via the server-side proxy (avoids CORS,
      //      uses the manager's API key on the way back).
      //   2. The same image's `remoteUrl` directly from TMDB/TVDB's CDN — set
      //      automatically via window.__manejarrPosterFallback when (1) errors.
      //   3. A clickable "No Poster" tile linking out to the external info
      //      page (IMDb/TMDB for Radarr, TVDB/IMDb for Sonarr) so the user
      //      can still verify the match visually on the source site.
      const poster = metadata.images?.find(img => img.coverType === 'poster');
      const fanart = metadata.images?.find(img => img.coverType === 'fanart');
      const fallbackImg = poster || fanart;

      const externalUrl = buildExternalPosterPage(manager, metadata);

      let imgHtml;
      if (fallbackImg && fallbackImg.url) {
        const proxy = `/api/dashboard/proxy-image?manager=${manager.toLowerCase()}&url=${encodeURIComponent(fallbackImg.url)}`;
        const remote = fallbackImg.remoteUrl || '';
        imgHtml = `<img class="hover-card-poster"
                       src="${proxy}"
                       data-remote="${remote.replace(/"/g, '&quot;')}"
                       data-external="${(externalUrl || '').replace(/"/g, '&quot;')}"
                       onerror="window.__manejarrPosterFallback(this)">`;
      } else if (externalUrl) {
        imgHtml = `<a class="hover-card-poster empty-poster" href="${externalUrl}" target="_blank" rel="noopener">No Poster<br><small>View on source</small></a>`;
      } else {
        imgHtml = `<div class="hover-card-poster empty-poster">No Poster</div>`;
      }

      hoverCard.innerHTML = `
        ${imgHtml}
        <div class="hover-card-content">
          <div class="hover-card-title">${metadata.title} (${metadata.year || 'N/A'})</div>
          <div class="hover-card-meta">${manager} &bull; ${metadata.infoUrl ? `<a href="${metadata.infoUrl}" target="_blank">View Info</a>` : ''}</div>
        </div>
      `;
      
      hoverCard.classList.add('visible');
      
      // Position card: offset from cursor to not block it
      const cardHeight = 380;
      const cardWidth = 200;
      
      let top = mouseY - 100; // Center slightly vertically
      let left = mouseX + 20; // 20px to the right of cursor
      
      // Adjust if off screen
      if (top + cardHeight > window.innerHeight) top = window.innerHeight - cardHeight - 20;
      if (top < 20) top = 20;
      
      if (left + cardWidth > window.innerWidth) {
        left = mouseX - cardWidth - 20; // Show on left if no room on right
      }

      hoverCard.style.top = `${top}px`;
      hoverCard.style.left = `${left}px`;
    };

    const hideCard = () => {
      hideTimeout = setTimeout(() => {
        hoverCard.classList.remove('visible');
        hoverCard.dataset.currentTr = '';
      }, 100);
    };

    tableBody.addEventListener('mousemove', (e) => {
      const tr = e.target.closest('tr');
      if (!tr || !tr.dataset.metadata) {
        hideCard();
        return;
      }
      
      const metadata = JSON.parse(tr.dataset.metadata);
      const manager = tr.dataset.manager;
      
      // Update position even if already visible for same TR
      showCard(metadata, manager, tr, e.clientX, e.clientY);
      hoverCard.dataset.currentTr = tr.dataset.hash;
    });

    tableBody.addEventListener('mouseleave', () => {
      hideCard();
    });

    // Allow clicking links in the hover card
    hoverCard.addEventListener('mouseenter', () => {
      if (hideTimeout) clearTimeout(hideTimeout);
    });

    hoverCard.addEventListener('mouseleave', () => {
      hideCard();
    });
  }

  // Compact match-actions: toggle the dropdown menu when the badge/MATCH
  // button is clicked, and close any other open menu.
  //
  // When opening, the menu is switched to `position: fixed` and absolutely
  // positioned using the toggle's bounding rect. `position: fixed` escapes
  // every ancestor's overflow context, so the menu is immune to the table
  // boundary — it cannot be clipped by the table card, the page, or any
  // wrapper. The menu STAYS in its original DOM location so the existing
  // event delegation on tableBody still catches Link / Unlink / Auto-match
  // button clicks.
  const closeAllMatchMenus = (except = null) => {
    document.querySelectorAll('.match-actions-menu:not(.hidden)').forEach(m => {
      if (m === except) return;
      m.classList.add('hidden');
      m.classList.remove('match-actions-menu--up', 'match-actions-menu--right', 'match-actions-menu--floating');
      m.style.top = '';
      m.style.left = '';
      m.style.right = '';
      m.style.bottom = '';
      m.style.maxHeight = '';
    });
  };

  // Position the floating menu via position: fixed using the toggle's
  // viewport-relative coordinates. Because the menu is rendered as fixed
  // (not absolute), it escapes every ancestor's overflow / clip / transform
  // context — it can render anywhere on the viewport regardless of the
  // table's scroll boundaries.
  //
  // Strategy: prefer the side with more available space (40px hysteresis).
  // Cap max-height to that side's available pixels so the menu's internal
  // scrollbar takes over if content is taller. Re-runs on the next
  // animation frame so the menu's actual rendered width (from the
  // has-poster grid + image) is measured correctly.
  const positionMatchMenu = (toggleBtn, menu) => {
    const apply = () => {
      menu.classList.remove('match-actions-menu--up');
      // Reset previous coords so width measurement is clean.
      menu.style.top = '';
      menu.style.left = '';
      menu.style.right = '';
      menu.style.bottom = '';
      menu.style.maxHeight = '';

      const t = toggleBtn.getBoundingClientRect();
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const buffer = 12;

      const spaceBelow = vh - t.bottom - buffer;
      const spaceAbove = t.top - buffer;
      const flipUp = spaceAbove > spaceBelow + 40;

      // Vertical: anchor to the toggle's edge in viewport coords.
      if (flipUp) {
        // bottom edge sits 4px above the toggle's top edge
        menu.style.bottom = `${vh - t.top + 4}px`;
        menu.classList.add('match-actions-menu--up');
      } else {
        menu.style.top = `${t.bottom + 4}px`;
      }
      menu.style.maxHeight = `${Math.max(220, flipUp ? spaceAbove : spaceBelow)}px`;

      // Horizontal: align with toggle, flip to right edge if it would
      // overflow the right side of the viewport.
      const menuWidth = menu.offsetWidth;
      let leftPx = t.left;
      if (leftPx + menuWidth + buffer > vw) {
        leftPx = Math.max(buffer, vw - menuWidth - buffer);
      }
      menu.style.left = `${leftPx}px`;
    };
    apply();
    // Re-position once post-layout sizes (poster, fonts) settle.
    requestAnimationFrame(apply);
  };

  // One global outside-click listener that closes any open match menu when
  // the user clicks anywhere outside .match-actions. Guarded so repeated
  // dashboard renders don't stack listeners.
  if (!window.__manejarrMatchMenuListener) {
    window.__manejarrMatchMenuListener = true;
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.match-actions')) {
        closeAllMatchMenus();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAllMatchMenus();
    });
    // Close on scroll/resize: a flipped-up menu is anchored to a row that's
    // about to move — easier to close than to keep repositioning.
    window.addEventListener('scroll', () => closeAllMatchMenus(), { passive: true, capture: true });
    window.addEventListener('resize', () => closeAllMatchMenus());
  }

  // Torrent Actions (Link / Unlink / Auto / toggle)
  if (tableBody) {
    tableBody.addEventListener('click', async (e) => {
      const toggleBtn = e.target.closest('.match-actions-toggle');
      if (toggleBtn) {
        const menu = toggleBtn.parentElement.querySelector('.match-actions-menu');
        if (!menu) return;
        const wasHidden = menu.classList.contains('hidden');
        closeAllMatchMenus();
        if (wasHidden) {
          menu.classList.remove('hidden');
          menu.classList.add('match-actions-menu--floating');
          positionMatchMenu(toggleBtn, menu);
        }
        return;
      }

      const linkBtn = e.target.closest('.link-torrent-btn');
      if (linkBtn) {
        const hash = linkBtn.dataset.hash;
        const name = linkBtn.dataset.name;
        closeAllMatchMenus();
        openLinkModal(hash, name);
        return;
      }
      
      const unlinkBtn = e.target.closest('.unlink-torrent-btn');
      if (unlinkBtn) {
        const hash = unlinkBtn.dataset.hash;
        const name = unlinkBtn.dataset.name;
        if (!confirm(`${t('unlink_confirm') || 'Unlink this torrent from its current match?'}\n\n${name}`)) return;
        try {
          unlinkBtn.disabled = true;
          await api.delete(`/torrents/${hash}/match`);
          closeAllMatchMenus();
          showToast(t('unlink_success') || 'Torrent unlinked. It will be re-matched on the next run.', 'success');
          await loadDashboardData();
        } catch (err) {
          showToast(err.message, 'error');
          unlinkBtn.disabled = false;
        }
        return;
      }

      const autoBtn = e.target.closest('.auto-rematch-btn');
      if (autoBtn) {
        const hash = autoBtn.dataset.hash;
        const originalHtml = autoBtn.innerHTML;
        try {
          autoBtn.disabled = true;
          autoBtn.innerHTML = '<span class="spinner"></span>';
          const result = await api.post(`/torrents/${hash}/rematch`);
          closeAllMatchMenus();
          if (result.matched) {
            showToast(
              `${t('auto_rematch_success') || 'Matched to'} ${result.title} (${result.source})`,
              'success'
            );
          } else {
            showToast(t('auto_rematch_no_match') || 'No match found for this torrent.', 'warning');
          }
          await loadDashboardData();
        } catch (err) {
          showToast(err.message, 'error');
          autoBtn.disabled = false;
          autoBtn.innerHTML = originalHtml;
        }
        return;
      }
    });
  }

  // Rematch All Button
  document.getElementById('rematch-all-btn')?.addEventListener('click', async () => {
    if (!confirm(t('rematch_all_confirm') || 'This will clear ALL cached matches and re-run the matching process.\n\nAre you sure?')) return;

    const btn = document.getElementById('rematch-all-btn');
    try {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span> ${t('running') || 'Running...'}`;
      // Lock the run-now / dry-run buttons immediately. Pass originator
      // 'rematch' so syncActionButtons masks the runType — Run Now must
      // not get the spinner during a rematch.
      syncActionButtons({ running: true, runType: 'rematch' }, allTorrents.length > 0, 'rematch');

      const result = await api.post('/torrents/rematch-all');
      showToast(result.message || 'Rematch started', 'success');

      // Poll status; on completion, syncActionButtons re-enables all three.
      clearRematchPoll();
      rematchPollInterval = setInterval(async () => {
        try {
          const status = await api.get('/run/status');
          if (!status.running) {
            clearRematchPoll();
            syncActionButtons(status, allTorrents.length > 0, 'rematch');
            await loadDashboardData();
            showToast(t('rematch_complete') || 'Rematch complete! Check results below.', 'success');
          } else {
            // While running, keep the rematch-only mask alive so Run Now
            // doesn't pick up the server-reported 'manual'/'rematch' label
            // and start animating.
            syncActionButtons(status, allTorrents.length > 0, 'rematch');
          }
        } catch (e) {
          clearRematchPoll();
          syncActionButtons({ running: false }, allTorrents.length > 0);
        }
      }, 2000);
    } catch (err) {
      showToast(err.message, 'error');
      syncActionButtons({ running: false }, allTorrents.length > 0);
    }
  });

  // Render run buttons. The status callback fires from runButton's own
  // poller, which runs alongside our rematch poller — both feed
  // syncActionButtons so all three buttons stay in lockstep regardless of
  // who started the run.
  renderRunButtons('run-buttons', (status) => {
    syncActionButtons(status, allTorrents.length > 0);
    if (!status.running) loadDashboardData();
  });
}

async function loadDashboardData() {
  try {
    const data = await api.get('/dashboard');

    allTorrents = data.torrents || [];
    connectionInfo = data.connectionInfo;

    // Live count + sub-title for the section heading.
    const total = allTorrents.length;
    const matched = allTorrents.filter(x => x.manager).length;
    const countEl = document.getElementById('torrent-overview-count');
    const subEl = document.getElementById('torrent-overview-sub');
    if (countEl) countEl.textContent = total;
    if (subEl) {
      subEl.innerHTML = total === 0
        ? `No torrents tracked`
        : `<span class="section-title-sub-strong">${matched}</span> matched · <span class="section-title-sub-strong">${total - matched}</span> unmatched`;
    }

    // Update stats
    const grid = document.getElementById('stats-grid');
    if (grid) {
      grid.innerHTML = `
        <div class="stat-card">
          <div class="stat-card-icon" style="background: var(--label-media-bg); color: var(--label-media);">📥</div>
          <div class="stat-card-body">
            <div class="stat-card-value">${data.stats?.mediaCount ?? 0}</div>
            <div class="stat-card-label">Media</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon" style="background: var(--label-ignore-bg); color: var(--label-ignore);">⏳</div>
          <div class="stat-card-body">
            <div class="stat-card-value">${data.stats?.ignoreCount ?? 0}</div>
            <div class="stat-card-label">Seeding</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon" style="background: var(--label-fordeletion-bg); color: var(--label-fordeletion);">🗑️</div>
          <div class="stat-card-body">
            <div class="stat-card-value">${data.stats?.forDeletionCount ?? 0}</div>
            <div class="stat-card-label">For Deletion</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon" style="background: var(--status-info-bg); color: var(--status-info);">🕐</div>
          <div class="stat-card-body">
            <div class="stat-card-value" style="font-size: 0.95rem;">${data.stats?.lastRunAt ? formatDate(data.stats.lastRunAt) : 'Never'}</div>
            <div class="stat-card-label">Last Run</div>
          </div>
        </div>
      `;
    }

    renderFilteredTorrents();
    syncActionButtons(data.runStatus, allTorrents.length > 0);

  } catch (err) {
    if (err.message !== 'Authentication required') {
      showToast('Failed to load dashboard data', 'error');
    }
  }
}

function renderFilteredTorrents() {
  const labelFilter = labelFilterValue;
  
  // Apply Filter & Search
  let filtered = allTorrents.filter(t => {
    const matchesLabel = !labelFilter || t.label === labelFilter;
    const matchesSearch = !searchQuery || 
                          t.name.toLowerCase().includes(searchQuery) || 
                          (t.trackerHost && t.trackerHost.toLowerCase().includes(searchQuery)) ||
                          (t.manager && t.manager.toLowerCase().includes(searchQuery));
    return matchesLabel && matchesSearch;
  });

  // Apply Sort
  filtered.sort((a, b) => {
    let valA = a[sortField];
    let valB = b[sortField];
    
    // Handle string comparison
    if (typeof valA === 'string') {
      valA = valA.toLowerCase();
      valB = (valB || '').toLowerCase();
    }
    
    // Handle nulls
    if (valA === null || valA === undefined) return 1;
    if (valB === null || valB === undefined) return -1;

    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const tbody = document.getElementById('torrent-table-body');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="9">
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <div class="empty-state-title">No torrents found</div>
          <div class="empty-state-text">${labelFilter || searchQuery ? 'No items match your filters.' : 'No tracked torrents in Deluge.'}</div>
        </div>
      </td></tr>
    `;
    renderDashboardPagination(0);
    return;
  }

  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / DASHBOARD_PAGE_SIZE);
  if (currentDashboardPage > totalPages) currentDashboardPage = Math.max(1, totalPages);
  
  const startIndex = (currentDashboardPage - 1) * DASHBOARD_PAGE_SIZE;
  const pageItems = filtered.slice(startIndex, startIndex + DASHBOARD_PAGE_SIZE);

  // Pad with empty placeholder rows so the table always reserves a full
  // page's worth of height. This keeps the page geometry stable and gives
  // bottom-row dropdowns somewhere to render without spilling off-screen.
  const realRows = pageItems.map(renderTorrentRow).join('');
  const padCount = Math.max(0, DASHBOARD_PAGE_SIZE - pageItems.length);
  const padRows = padCount > 0
    ? `<tr class="torrent-empty-row"><td colspan="9">&nbsp;</td></tr>`.repeat(padCount)
    : '';
  tbody.innerHTML = realRows + padRows;
  renderDashboardPagination(totalItems);
}

function renderDashboardPagination(totalItems) {
  const pDiv = document.getElementById('dashboard-pagination');
  if (!pDiv) return;

  const totalPages = Math.ceil(totalItems / DASHBOARD_PAGE_SIZE);
  if (totalPages <= 1) {
    pDiv.innerHTML = totalItems > 0 ? `<span class="pagination-info">${totalItems} torrent(s)</span>` : '';
    return;
  }

  let buttons = '';
  // First & Prev
  buttons += `<button type="button" class="pagination-btn" ${currentDashboardPage <= 1 ? 'disabled' : ''} data-page="1" title="First Page"><span style="pointer-events: none;">«</span></button>`;
  buttons += `<button type="button" class="pagination-btn" ${currentDashboardPage <= 1 ? 'disabled' : ''} data-page="${currentDashboardPage - 1}" title="Previous Page"><span style="pointer-events: none;">‹</span></button>`;

  // Page Numbers
  let start = Math.max(1, currentDashboardPage - 2);
  let end = Math.min(totalPages, start + 4);
  if (end - start < 4) start = Math.max(1, end - 4);

  for (let i = start; i <= end; i++) {
    buttons += `<button type="button" class="pagination-btn ${i === currentDashboardPage ? 'active' : ''}" data-page="${i}"><span style="pointer-events: none;">${i}</span></button>`;
  }

  // Next & Last
  buttons += `<button type="button" class="pagination-btn" ${currentDashboardPage >= totalPages ? 'disabled' : ''} data-page="${currentDashboardPage + 1}" title="Next Page"><span style="pointer-events: none;">›</span></button>`;
  buttons += `<button type="button" class="pagination-btn" ${currentDashboardPage >= totalPages ? 'disabled' : ''} data-page="${totalPages}" title="Last Page"><span style="pointer-events: none;">»</span></button>`;
  
  pDiv.innerHTML = buttons + `<span class="pagination-info">${totalItems} total</span>`;

  // Use Event Delegation
  pDiv.onclick = (e) => {
    const btn = e.target.closest('.pagination-btn');
    if (!btn || btn.disabled) return;
    
    const page = parseInt(btn.dataset.page, 10);
    if (!isNaN(page) && page !== currentDashboardPage) {
      currentDashboardPage = page;
      renderFilteredTorrents();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };
}

function renderStatsSkeleton() {
  return Array(4).fill(`
    <div class="stat-card">
      <div style="width: 40px; height: 40px; border-radius: var(--radius-md); background: var(--bg-glass); margin-bottom: var(--space-md);"></div>
      <div style="width: 60px; height: 32px; border-radius: var(--radius-sm); background: var(--bg-glass); margin-bottom: var(--space-xs);"></div>
      <div style="width: 80px; height: 14px; border-radius: var(--radius-sm); background: var(--bg-glass);"></div>
    </div>
  `).join('');
}

export function cleanupDashboard() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

function cleanTorrentName(name) {
  // Remove common release tags, quality indicators, group names etc.
  return name
    .replace(/\.(mkv|avi|mp4|wmv|flv|mov|m4v)$/i, '')
    .replace(/[\.\-_]/g, ' ')
    .replace(/\b(720p|1080p|2160p|4K|HDR|DV|BluRay|BRRip|WEBRip|WEB-DL|HDTV|DVDRip|x264|x265|HEVC|H264|H265|AAC|DD5\.?1|DTS|ATMOS|REMUX|PROPER|REPACK|EXTENDED|UNRATED|DIRECTORS\.?CUT)\b/gi, '')
    .replace(/\b(S\d{1,2}E?\d{0,2})\b/gi, '') // Season/episode tags
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function openLinkModal(hash, name) {
  const cleanedName = cleanTorrentName(name);
  let searchTimeout = null;
  let currentResults = [];
  let allResults = [];
  let managerFilter = 'all'; // 'all' | 'radarr' | 'sonarr'
  let isOpen = true;            // guards async render after close
  let searchSeq = 0;            // race guard for in-flight search responses

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.display = 'flex';

  const modal = document.createElement('div');
  modal.className = 'modal-content match-search-modal';

  modal.innerHTML = `
    <h3>${t('link_torrent') || 'Link Torrent to Media'}</h3>
    <div class="match-search-torrent-name" title="${name}">${name}</div>

    <div class="match-search-box">
      <span class="search-icon">🔍</span>
      <input type="text" id="match-search-input" class="form-input" placeholder="${t('search_media') || 'Search movies & series...'}" value="${cleanedName}" autofocus>
      <div id="match-search-spinner" class="match-spinner hidden">
        <div class="spinner-sm"></div>
      </div>
    </div>

    <div class="match-filter-tabs" role="tablist" aria-label="${t('filter_by_manager') || 'Filter by manager'}">
      <button class="match-filter-tab active" data-filter="all" type="button" role="tab" aria-selected="true">
        ${t('filter_all') || 'All'} <span class="match-filter-count" id="match-count-all">0</span>
      </button>
      <button class="match-filter-tab" data-filter="radarr" type="button" role="tab" aria-selected="false">
        🎬 Radarr <span class="match-filter-count" id="match-count-radarr">0</span>
      </button>
      <button class="match-filter-tab" data-filter="sonarr" type="button" role="tab" aria-selected="false">
        📺 Sonarr <span class="match-filter-count" id="match-count-sonarr">0</span>
      </button>
    </div>

    <div id="match-search-results" class="match-search-results">
      <div class="match-search-hint">
        <span class="match-search-hint-icon">💡</span>
        ${t('search_hint') || 'Type to search Radarr & Sonarr for matching media'}
      </div>
    </div>

    <div class="match-modal-footer">
      <button class="btn btn-secondary" id="match-cancel-btn">${t('cancel') || 'Cancel'}</button>
    </div>
  `;
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Stop ANY click inside the modal panel from bubbling to global handlers
  // (match-actions outside-click closer, dropdown menus, etc.). Without
  // this, a click on a search result was reaching the document-level
  // listeners and could yank the modal apart on the first results render.
  modal.addEventListener('click', (e) => e.stopPropagation());
  modal.addEventListener('mousedown', (e) => e.stopPropagation());

  // Close on overlay click — only when the click target IS the overlay
  // backdrop, never a child.
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeMatchModal();
  });

  const closeMatchModal = () => {
    if (!isOpen) return;
    isOpen = false;
    if (searchTimeout) clearTimeout(searchTimeout);
    if (overlay.parentElement) overlay.parentElement.removeChild(overlay);
  };
  
  document.getElementById('match-cancel-btn').onclick = closeMatchModal;
  
  const searchInput = document.getElementById('match-search-input');
  const resultsContainer = document.getElementById('match-search-results');
  const spinner = document.getElementById('match-search-spinner');
  
  const updateFilterCounts = () => {
    const total = allResults.length;
    const radarr = allResults.filter(r => r.manager === 'radarr').length;
    const sonarr = allResults.filter(r => r.manager === 'sonarr').length;
    const elAll = document.getElementById('match-count-all');
    const elR = document.getElementById('match-count-radarr');
    const elS = document.getElementById('match-count-sonarr');
    if (elAll) elAll.textContent = total;
    if (elR) elR.textContent = radarr;
    if (elS) elS.textContent = sonarr;
  };

  const renderResults = () => {
    currentResults = managerFilter === 'all'
      ? allResults
      : allResults.filter(r => r.manager === managerFilter);

    if (allResults.length === 0) {
      resultsContainer.innerHTML = `
        <div class="match-search-empty">
          <div class="match-search-empty-icon">🔍</div>
          <div>${t('no_results') || 'No results found'}</div>
          <div class="text-muted" style="font-size: 0.8rem; margin-top: 4px;">Try different keywords</div>
        </div>
      `;
      return;
    }

    if (currentResults.length === 0) {
      resultsContainer.innerHTML = `
        <div class="match-search-empty">
          <div class="match-search-empty-icon">🔍</div>
          <div>${t('no_results_for_filter') || 'No results for this filter'}</div>
        </div>
      `;
      return;
    }

    resultsContainer.innerHTML = currentResults.map((r, i) => `
      <div class="match-result-item ${r.inLibrary ? 'in-library' : 'not-in-library'}" data-index="${i}">
        <div class="match-result-poster">
          ${r.poster
            ? `<img src="${r.poster}" alt="" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'match-poster-fallback\\'>${r.manager === 'radarr' ? '🎬' : '📺'}</div>'">`
            : `<div class="match-poster-fallback">${r.manager === 'radarr' ? '🎬' : '📺'}</div>`
          }
        </div>
        <div class="match-result-info">
          <div class="match-result-title">${r.title}</div>
          <div class="match-result-meta">
            <span class="badge badge-${r.manager}">${r.manager === 'radarr' ? 'Movie' : 'Series'}</span>
            ${r.year ? `<span class="match-result-year">${r.year}</span>` : ''}
            ${r.inLibrary ? `<span class="match-library-tag">✓ In Library</span>` : ''}
            ${r.seasonCount ? `<span class="text-muted">${r.seasonCount} season${r.seasonCount > 1 ? 's' : ''}</span>` : ''}
          </div>
          ${r.overview ? `<div class="match-result-overview">${r.overview}</div>` : ''}
        </div>
        <div class="match-result-action">
          <button class="btn btn-sm btn-primary match-link-btn" data-index="${i}">Link</button>
        </div>
      </div>
    `).join('');
  };

  const performSearch = async (query) => {
    if (!isOpen) return;
    if (!query || query.trim().length < 2) {
      allResults = [];
      currentResults = [];
      updateFilterCounts();
      resultsContainer.innerHTML = `
        <div class="match-search-hint">
          <span class="match-search-hint-icon">💡</span>
          ${t('search_hint') || 'Type to search Radarr & Sonarr for matching media'}
        </div>
      `;
      return;
    }

    spinner.classList.remove('hidden');
    const seq = ++searchSeq;

    try {
      const data = await api.get(`/torrents/search?q=${encodeURIComponent(query.trim())}`);
      // Drop stale responses (modal closed, or a newer search is in flight).
      if (!isOpen || seq !== searchSeq) return;
      allResults = data.results || [];
      updateFilterCounts();
      renderResults();
    } catch (err) {
      if (!isOpen || seq !== searchSeq) return;
      resultsContainer.innerHTML = `
        <div class="match-search-empty">
          <div class="match-search-empty-icon">⚠️</div>
          <div>Search failed: ${err.message}</div>
        </div>
      `;
    } finally {
      if (isOpen && seq === searchSeq) spinner.classList.add('hidden');
    }
  };

  // Wire up the manager filter tabs
  modal.querySelectorAll('.match-filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      managerFilter = tab.dataset.filter;
      modal.querySelectorAll('.match-filter-tab').forEach(t2 => {
        const active = t2.dataset.filter === managerFilter;
        t2.classList.toggle('active', active);
        t2.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      renderResults();
    });
  });
  
  // Debounced search on input
  searchInput.addEventListener('input', (e) => {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => performSearch(e.target.value), 400);
  });
  
  // Handle Enter key
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (searchTimeout) clearTimeout(searchTimeout);
      performSearch(searchInput.value);
    }
  });
  
  // Handle result clicks (delegation)
  resultsContainer.addEventListener('click', async (e) => {
    const linkBtn = e.target.closest('.match-link-btn');
    const resultItem = e.target.closest('.match-result-item');
    const target = linkBtn || resultItem;
    if (!target) return;
    
    const index = parseInt(target.dataset.index, 10);
    const result = currentResults[index];
    if (!result) return;
    
    // Search now returns library-only results, so internalId is always set.
    const mediaId = result.internalId || result.id;


    try {
      // Disable all link buttons
      resultsContainer.querySelectorAll('.match-link-btn').forEach(b => { b.disabled = true; });
      target.closest('.match-result-item')?.classList.add('linking');
      
      const response = await api.post(`/torrents/${hash}/match`, { 
        manager: result.manager, 
        id: mediaId,
        title: result.title
      });
      
      // Use the server's message which includes auto-match count for series
      const toastMsg = response.alsoMatched > 0
        ? `${t('link_success') || 'Linked successfully to'} "${result.title}" (+${response.alsoMatched} related)`
        : `${t('link_success') || 'Linked successfully to'} "${result.title}"`;
      showToast(toastMsg, 'success');
      closeMatchModal();
      loadDashboardData();
    } catch (err) {
      showToast(err.message, 'error');
      resultsContainer.querySelectorAll('.match-link-btn').forEach(b => { b.disabled = false; });
      target.closest('.match-result-item')?.classList.remove('linking');
    }
  });
  
  // Auto-search with cleaned name
  if (cleanedName.length >= 2) {
    performSearch(cleanedName);
  }

  // Focus the search input but do NOT pre-select its contents — keep the
  // caret at the end so the user can edit the cleaned filter freely.
  setTimeout(() => {
    if (!isOpen) return;
    searchInput.focus();
    const len = searchInput.value.length;
    try { searchInput.setSelectionRange(len, len); } catch (e) { /* ignore */ }
  }, 100);
}
