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
let currentDashboardPage = 1;
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
            <th>${t('name')}</th>
            <th>${t('label')}</th>
            <th>${t('ratio')}</th>
            <th>${t('seed_time')}</th>
            <th>${t('size')}</th>
            <th>Added</th>
            <th>Tracker</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody id="torrent-table-body">
          <tr><td colspan="8" class="text-center text-muted" style="padding: var(--space-2xl);">
            <div class="spinner-lg" style="margin: 0 auto var(--space-md);"></div>
            ${t('connecting')}
          </td></tr>
        </tbody>
      </table>
    </div>
    
    <!-- Pagination -->
    <div id="dashboard-pagination" class="pagination"></div>
  `;

  // Render run buttons
  renderRunButtons('run-buttons', (status) => {
    if (!status.running) loadDashboardData();
  });

  // Label filter
  document.getElementById('label-filter')?.addEventListener('change', () => {
    currentDashboardPage = 1;
    renderFilteredTorrents();
  });

  // Load data
  await loadDashboardData();

  // Auto-refresh every 30 seconds
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(loadDashboardData, 30000);
}

async function loadDashboardData() {
  try {
    const data = await api.get('/dashboard');

    allTorrents = data.torrents || [];

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
    setRunButtonsEnabled(allTorrents.length > 0);

  } catch (err) {
    console.error('[DASHBOARD] Load error:', err);
    if (err.message !== 'Authentication required') {
      showToast('Failed to load dashboard data', 'error');
    }
  }
}

function renderFilteredTorrents() {
  const filter = document.getElementById('label-filter')?.value || '';
  const filtered = filter ? allTorrents.filter(t => t.label === filter) : allTorrents;

  const tbody = document.getElementById('torrent-table-body');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="8">
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <div class="empty-state-title">No torrents found</div>
          <div class="empty-state-text">${filter ? `No torrents with label "${filter}".` : 'No tracked torrents in Deluge. Check your settings.'}</div>
        </div>
      </td></tr>
    `;
    renderDashboardPagination(0);
    return;
  }

  // Calculate slice for current page
  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / DASHBOARD_PAGE_SIZE);
  
  // Ensure current page is valid
  if (currentDashboardPage > totalPages) {
    currentDashboardPage = Math.max(1, totalPages);
  }
  
  const startIndex = (currentDashboardPage - 1) * DASHBOARD_PAGE_SIZE;
  const endIndex = startIndex + DASHBOARD_PAGE_SIZE;
  const pageItems = filtered.slice(startIndex, endIndex);

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

  // Previous
  buttons += `<button class="pagination-btn" ${currentDashboardPage <= 1 ? 'disabled' : ''} data-dpage="${currentDashboardPage - 1}">‹</button>`;

  // Page numbers (show up to 5)
  const start = Math.max(1, currentDashboardPage - 2);
  const end = Math.min(totalPages, start + 4);

  for (let i = start; i <= end; i++) {
    buttons += `<button class="pagination-btn ${i === currentDashboardPage ? 'active' : ''}" data-dpage="${i}">${i}</button>`;
  }

  // Next
  buttons += `<button class="pagination-btn" ${currentDashboardPage >= totalPages ? 'disabled' : ''} data-dpage="${currentDashboardPage + 1}">›</button>`;

  pDiv.innerHTML = buttons + `<span class="pagination-info">${totalItems} total</span>`;

  // Wire up page buttons
  pDiv.querySelectorAll('[data-dpage]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentDashboardPage = parseInt(btn.dataset.dpage, 10);
      renderFilteredTorrents();
    });
  });
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
