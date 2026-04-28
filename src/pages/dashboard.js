/**
 * Dashboard Page
 */

import { api } from '../utils/api.js';
import { formatSize, formatDuration, formatRatio, formatDate, getLabelBadgeClass } from '../utils/formatters.js';
import { renderRunButtons, setRunButtonsEnabled } from '../components/runButton.js';
import { renderTorrentRow } from '../components/torrentCard.js';
import { showToast } from '../components/toast.js';
import { t } from '../utils/i18n.js';

let refreshInterval = null;
let allTorrents = [];
let connectionInfo = null;
let currentDashboardPage = 1;
let sortField = 'timeAdded';
let sortDirection = 'desc';
let searchQuery = '';
const DASHBOARD_PAGE_SIZE = 10;

export async function renderDashboard() {
  const container = document.getElementById('page-content');
  if (!container) return;

  container.innerHTML = `
    <div class="stats-grid" id="stats-grid">
      ${renderStatsSkeleton()}
    </div>

    <div class="section-header">
      <h2 class="section-title">${t('torrent_overview')}</h2>
      <div class="flex items-center gap-md">
        <div class="search-container">
          <span class="search-icon">🔍</span>
          <input type="text" id="torrent-search" class="form-input search-input" placeholder="${t('search')}...">
        </div>
        <div id="run-buttons"></div>
        <select id="label-filter" class="form-input" style="width: auto; min-width: 140px;">
          <option value="">${t('all_labels')}</option>
          <option value="media">${t('media')}</option>
          <option value="ignore">${t('ignore')}</option>
          <option value="fordeletion">${t('for_deletion')}</option>
        </select>
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
}

function initDashboardEvents() {
  // Label filter
  document.getElementById('label-filter')?.addEventListener('change', () => {
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
    const showCard = (metadata, manager, targetTr) => {
      if (hideTimeout) clearTimeout(hideTimeout);
      
      // Find poster image
      const poster = metadata.images?.find(img => img.coverType === 'poster');
      
      let imgHtml = '';
      if (poster) {
        // Use server-side proxy to fetch the image securely
        const imgUrl = `/api/dashboard/proxy-image?manager=${manager.toLowerCase()}&url=${encodeURIComponent(poster.url)}`;
        imgHtml = `<img src="${imgUrl}" class="hover-card-poster" onerror="this.onerror=null; this.src='https://placehold.co/200x280?text=No+Poster'">`;
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
      
      // Position card
      const rect = targetTr.getBoundingClientRect();
      const cardHeight = 380;
      const cardWidth = 200;
      let top = rect.top;
      let left = rect.left + 300;

      // Adjust if off screen
      if (top + cardHeight > window.innerHeight) top = window.innerHeight - cardHeight - 20;
      if (left + cardWidth > window.innerWidth) left = rect.left - cardWidth - 20;

      hoverCard.style.top = `${top}px`;
      hoverCard.style.left = `${left}px`;
    };

    const hideCard = () => {
      hideTimeout = setTimeout(() => {
        hoverCard.classList.remove('visible');
      }, 300);
    };

    tableBody.addEventListener('mouseover', (e) => {
      const tr = e.target.closest('tr');
      if (!tr || !tr.dataset.metadata) return;
      
      // If we are already showing this TR, do nothing
      if (hoverCard.classList.contains('visible') && hoverCard.dataset.currentTr === tr.dataset.hash) {
        if (hideTimeout) clearTimeout(hideTimeout);
        return;
      }

      try {
        const metadata = JSON.parse(tr.dataset.metadata);
        const manager = tr.dataset.manager;
        showCard(metadata, manager, tr);
        hoverCard.dataset.currentTr = tr.dataset.hash;
      } catch (err) {}
    });

    tableBody.addEventListener('mouseout', (e) => {
      // Only hide if we are leaving the TR (to nothing or outside tableBody)
      const toElement = e.relatedTarget;
      if (toElement && toElement.closest('tr') === e.target.closest('tr')) {
        return; // Still in same row
      }
      hideCard();
    });

    hoverCard.addEventListener('mouseover', () => {
      if (hideTimeout) clearTimeout(hideTimeout);
    });

    hoverCard.addEventListener('mouseout', () => {
      hideCard();
    });
  }

  // Torrent Actions (Link)
  if (tableBody) {
    tableBody.addEventListener('click', (e) => {
      const linkBtn = e.target.closest('.link-torrent-btn');
      if (linkBtn) {
        const hash = linkBtn.dataset.hash;
        const name = linkBtn.dataset.name;
        openLinkModal(hash, name);
      }
    });
  }

  // Render run buttons
  renderRunButtons('run-buttons', (status) => {
    if (!status.running) loadDashboardData();
  });
}

async function loadDashboardData() {
  try {
    const data = await api.get('/dashboard');

    allTorrents = data.torrents || [];
    connectionInfo = data.connectionInfo;

    // Update stats
    const grid = document.getElementById('stats-grid');
    if (grid) {
      grid.innerHTML = `
        <div class="stat-card">
          <div class="stat-card-icon" style="background: var(--label-media-bg); color: var(--label-media);">📥</div>
          <div class="stat-card-value">${data.stats?.mediaCount ?? 0}</div>
          <div class="stat-card-label">Media</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon" style="background: var(--label-ignore-bg); color: var(--label-ignore);">⏳</div>
          <div class="stat-card-value">${data.stats?.ignoreCount ?? 0}</div>
          <div class="stat-card-label">Seeding (Ignore)</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon" style="background: var(--label-fordeletion-bg); color: var(--label-fordeletion);">🗑️</div>
          <div class="stat-card-value">${data.stats?.forDeletionCount ?? 0}</div>
          <div class="stat-card-label">For Deletion</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon" style="background: var(--status-info-bg); color: var(--status-info);">🕐</div>
          <div class="stat-card-value" style="font-size: 1rem;">${data.stats?.lastRunAt ? formatDate(data.stats.lastRunAt) : 'Never'}</div>
          <div class="stat-card-label">Last Run</div>
        </div>
      `;
    }

    renderFilteredTorrents();
    setRunButtonsEnabled(allTorrents.length > 0, data.runStatus);

  } catch (err) {
    if (err.message !== 'Authentication required') {
      showToast('Failed to load dashboard data', 'error');
    }
  }
}

function renderFilteredTorrents() {
  const labelFilter = document.getElementById('label-filter')?.value || '';
  
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

  tbody.innerHTML = pageItems.map(renderTorrentRow).join('');
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

function openLinkModal(hash, name) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.display = 'flex';
  
  const modal = document.createElement('div');
  modal.className = 'modal-content';
  modal.style.maxWidth = '500px';
  
  modal.innerHTML = `
    <h3>Link Torrent to Manager</h3>
    <p class="text-muted" style="margin-bottom: var(--space-md); word-break: break-all;"><strong>${name}</strong></p>
    
    <div class="form-group">
      <label class="form-label">Manager</label>
      <select id="link-manager" class="form-input">
        <option value="radarr">Radarr (Movie)</option>
        <option value="sonarr">Sonarr (Series)</option>
      </select>
    </div>
    
    <div class="form-group">
      <label class="form-label">Media ID</label>
      <input type="number" id="link-id" class="form-input" placeholder="e.g. 123" required>
      <small class="text-muted" style="display: block; margin-top: 5px;">Enter the internal ID from Radarr/Sonarr (found in the URL of the media item).</small>
    </div>
    
    <div style="display: flex; gap: var(--space-md); margin-top: var(--space-xl);">
      <button class="btn btn-primary flex-1" id="link-submit-btn">Link Torrent</button>
      <button class="btn btn-secondary flex-1" id="link-cancel-btn">Cancel</button>
    </div>
  `;
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  document.getElementById('link-cancel-btn').onclick = () => document.body.removeChild(overlay);
  
  document.getElementById('link-submit-btn').onclick = async () => {
    const manager = document.getElementById('link-manager').value;
    const id = document.getElementById('link-id').value;
    
    if (!id) {
      showToast('Please enter a Media ID', 'error');
      return;
    }
    
    try {
      const btn = document.getElementById('link-submit-btn');
      btn.disabled = true;
      btn.innerText = 'Linking...';
      
      await api.post(`/torrents/${hash}/match`, { manager, id });
      showToast('Torrent manually linked successfully!', 'success');
      document.body.removeChild(overlay);
      
      // Reload dashboard data to show the new badge
      loadDashboardData();
    } catch (err) {
      showToast(err.message, 'error');
      document.getElementById('link-submit-btn').disabled = false;
      document.getElementById('link-submit-btn').innerText = 'Link Torrent';
    }
  };
}
