/**
 * Event & Run Logs Page
 */

import { api } from '../utils/api.js';
import { showToast } from '../components/toast.js';
import { formatDateTime, getLevelBadgeClass } from '../utils/formatters.js';
import { t } from '../utils/i18n.js';

let currentEventPage = 1;
let currentRunPage = 1;
let currentFilters = {};

export async function renderLogs() {
  const container = document.getElementById('page-content');
  if (!container) return;

  container.innerHTML = `
    <div>
      <div class="section-header">
        <div class="tabs-header" style="margin-bottom: 0; border-bottom: none; padding-bottom: 0;">
          <button class="tab-btn active" data-tab="events">${t('events')}</button>
          <button class="tab-btn" data-tab="runs">${t('run_logs')}</button>
        </div>
        <button class="btn btn-sm" id="clear-logs-btn" style="background: rgba(244, 63, 94, 0.1); color: var(--status-error); border: 1px solid rgba(244, 63, 94, 0.3);">${t('clear_all')}</button>
      </div>

      <!-- Event Logs Tab -->
      <div id="tab-events" class="tab-pane active">
        <!-- Filters -->
        <div class="card mb-lg">
          <div class="flex items-center gap-md flex-wrap">
            <div class="form-group" style="margin-bottom: 0; min-width: 130px;">
              <label class="form-label">Level</label>
              <select id="filter-level" class="form-input">
                <option value="">All</option>
                <option value="info">Info</option>
                <option value="warn">Warning</option>
                <option value="error">Error</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom: 0; min-width: 130px;">
              <label class="form-label">Category</label>
              <select id="filter-category" class="form-input">
                <option value="">All</option>
                <option value="engine">Engine</option>
                <option value="deluge">Deluge</option>
                <option value="radarr">Radarr</option>
                <option value="sonarr">Sonarr</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom: 0; min-width: 160px;">
              <label class="form-label">Start Date</label>
              <input type="date" id="filter-start-date" class="form-input" />
            </div>
            <div class="form-group" style="margin-bottom: 0; min-width: 160px;">
              <label class="form-label">End Date</label>
              <input type="date" id="filter-end-date" class="form-input" />
            </div>
            <div class="form-group" style="margin-bottom: 0; align-self: flex-end;">
              <button class="btn btn-secondary" id="apply-filters-btn">Apply</button>
            </div>
            <div class="form-group" style="margin-bottom: 0; align-self: flex-end;">
              <button class="btn btn-secondary" id="export-csv-btn">📥 Export CSV</button>
            </div>
          </div>
        </div>

        <!-- Log Table -->
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th style="width: 160px;">Timestamp</th>
                <th style="width: 160px;">${t('timestamp')}</th>
                <th style="width: 80px;">${t('level')}</th>
                <th style="width: 100px;">${t('category')}</th>
                <th>${t('message')}</th>
                <th style="width: 60px;">${t('run_id')}</th>
              </tr>
            </thead>
            <tbody id="events-table-body">
              <tr><td colspan="5" class="text-center text-muted" style="padding: var(--space-2xl);">
                <div class="spinner-lg" style="margin: 0 auto var(--space-md);"></div>
                ${t('connecting')}
              </td></tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div id="events-pagination" class="pagination"></div>
      </div>

      <!-- Run Logs Tab -->
      <div id="tab-runs" class="tab-pane">
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th style="width: 60px;">${t('run_id')}</th>
                <th style="width: 160px;">${t('started_at')}</th>
                <th style="width: 160px;">${t('finished_at')}</th>
                <th style="width: 80px;">${t('type')}</th>
                <th style="width: 100px;">${t('status')}</th>
                <th>${t('summary')}</th>
              </tr>
            </thead>
            <tbody id="runs-table-body">
              <tr><td colspan="6" class="text-center text-muted" style="padding: var(--space-2xl);">
                <div class="spinner-lg" style="margin: 0 auto var(--space-md);"></div>
                ${t('loading')}
              </td></tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div id="runs-pagination" class="pagination"></div>
      </div>

    </div>
  `;

  // Wire up tabs
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      e.target.classList.add('active');
      const tabId = e.target.getAttribute('data-tab');
      document.getElementById(`tab-${tabId}`).classList.add('active');
    });
  });

  // Wire up Clear Logs
  document.getElementById('clear-logs-btn')?.addEventListener('click', async () => {
    if (confirm(t('clear_confirm'))) {
      try {
        await api.delete('/logs');
        showToast(t('logs_cleared'), 'success');
        currentEventPage = 1;
        currentRunPage = 1;
        loadEventLogs();
        loadRunLogs();
      } catch (err) {
        showToast(`Failed to clear logs: ${err.message}`, 'error');
      }
    }
  });

  // Wire up filter button
  document.getElementById('apply-filters-btn')?.addEventListener('click', () => {
    currentEventPage = 1;
    currentFilters = {
      level: document.getElementById('filter-level')?.value || '',
      category: document.getElementById('filter-category')?.value || '',
      startDate: document.getElementById('filter-start-date')?.value || '',
      endDate: document.getElementById('filter-end-date')?.value || '',
    };
    loadEventLogs();
  });

  // Export CSV
  document.getElementById('export-csv-btn')?.addEventListener('click', exportCSV);

  // Load initial data
  await Promise.all([loadEventLogs(), loadRunLogs()]);
}

// --- EVENT LOGS ---

async function loadEventLogs() {
  try {
    const params = new URLSearchParams({
      page: currentEventPage.toString(),
      pageSize: '50',
    });

    if (currentFilters.level) params.set('level', currentFilters.level);
    if (currentFilters.category) params.set('category', currentFilters.category);
    if (currentFilters.startDate) params.set('startDate', currentFilters.startDate);
    if (currentFilters.endDate) params.set('endDate', currentFilters.endDate);

    const data = await api.get(`/logs/events?${params.toString()}`);
    renderEventTable(data);
    renderPagination('events-pagination', data.total, 50, currentEventPage, (newPage) => {
      currentEventPage = newPage;
      loadEventLogs();
    });

  } catch (err) {
    if (err.message !== 'Authentication required') {
      showToast('Failed to load event logs', 'error');
    }
  }
}

function renderEventTable(data) {
  const tbody = document.getElementById('events-table-body');
  if (!tbody) return;

  if (!data.rows || data.rows.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="5">
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <div class="empty-state-title">No event logs found</div>
          <div class="empty-state-text">Run the orchestration to generate event logs.</div>
        </div>
      </td></tr>
    `;
    return;
  }

  tbody.innerHTML = data.rows.map(log => {
    const badgeClass = getLevelBadgeClass(log.level);
    return `
      <tr>
        <td class="text-mono" style="font-size: 0.8rem;">${formatDateTime(log.created_at)}</td>
        <td><span class="badge ${badgeClass}">${log.level}</span></td>
        <td><span class="badge badge-info">${log.category}</span></td>
        <td style="max-width: 500px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(log.message)}">${escapeHtml(log.message)}</td>
        <td class="text-mono">${log.run_id || '—'}</td>
      </tr>
    `;
  }).join('');
}

// --- RUN LOGS ---

async function loadRunLogs() {
  try {
    const data = await api.get(`/logs/runs?page=${currentRunPage}&pageSize=20`);
    renderRunTable(data);
    renderPagination('runs-pagination', data.total, 20, currentRunPage, (newPage) => {
      currentRunPage = newPage;
      loadRunLogs();
    });
  } catch (err) {
    if (err.message !== 'Authentication required') {
      showToast('Failed to load run logs', 'error');
    }
  }
}

function renderRunTable(data) {
  const tbody = document.getElementById('runs-table-body');
  if (!tbody) return;

  if (!data.rows || data.rows.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="6">
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <div class="empty-state-title">No run logs found</div>
        </div>
      </td></tr>
    `;
    return;
  }

  tbody.innerHTML = data.rows.map(run => {
    let statusBadge = '';
    if (run.status === 'success') statusBadge = '<span class="badge badge-success">Success</span>';
    else if (run.status === 'error') statusBadge = '<span class="badge badge-error">Error</span>';
    else statusBadge = `<span class="badge">${run.status}</span>`;

    let summaryText = run.error ? `<span class="text-error">${escapeHtml(run.error)}</span>` : '—';
    if (run.summary) {
      const s = run.summary.totals || {};
      summaryText = `Processed: ${s.processed || 0} | Actions: ${s.actions || 0} | Errors: ${s.errors || 0}`;
    }

    return `
      <tr>
        <td class="text-mono">${run.id}</td>
        <td class="text-mono" style="font-size: 0.8rem;">${formatDateTime(run.started_at)}</td>
        <td class="text-mono" style="font-size: 0.8rem;">${run.finished_at ? formatDateTime(run.finished_at) : '—'}</td>
        <td><span class="badge badge-info">${run.run_type}</span></td>
        <td>${statusBadge}</td>
        <td>${summaryText}</td>
      </tr>
    `;
  }).join('');
}

// --- SHARED ---

function renderPagination(containerId, totalItems, pageSize, currentPage, onPageChange) {
  const pDiv = document.getElementById(containerId);
  if (!pDiv) return;

  const totalPages = Math.ceil(totalItems / pageSize);
  if (totalPages <= 1) {
    pDiv.innerHTML = totalItems > 0 ? `<span class="pagination-info">${totalItems} log(s)</span>` : '';
    return;
  }

  let buttons = '';

  // Previous
  buttons += `<button class="pagination-btn" ${currentPage <= 1 ? 'disabled' : ''} data-page="${currentPage - 1}">‹</button>`;

  // Page numbers (show up to 5)
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, start + 4);

  for (let i = start; i <= end; i++) {
    buttons += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
  }

  // Next
  buttons += `<button class="pagination-btn" ${currentPage >= totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">›</button>`;

  pDiv.innerHTML = buttons + `<span class="pagination-info">${totalItems} total</span>`;

  // Wire up page buttons
  pDiv.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      onPageChange(parseInt(btn.dataset.page, 10));
    });
  });
}

async function exportCSV() {
  try {
    const params = new URLSearchParams({ page: '1', pageSize: '10000' });
    if (currentFilters.level) params.set('level', currentFilters.level);
    if (currentFilters.category) params.set('category', currentFilters.category);
    if (currentFilters.startDate) params.set('startDate', currentFilters.startDate);
    if (currentFilters.endDate) params.set('endDate', currentFilters.endDate);

    const data = await api.get(`/logs/events?${params.toString()}`);

    if (!data.rows || data.rows.length === 0) {
      showToast('No logs to export', 'warning');
      return;
    }

    const header = 'Timestamp,Level,Category,Message,Run ID';
    const rows = data.rows.map(log =>
      `"${log.created_at}","${log.level}","${log.category}","${(log.message || '').replace(/"/g, '""')}","${log.run_id || ''}"`
    );

    const csv = [header, ...rows].join('\\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `manejarr-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();

    URL.revokeObjectURL(url);
    showToast('Logs exported', 'success');

  } catch (err) {
    showToast(`Export failed: ${err.message}`, 'error');
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
