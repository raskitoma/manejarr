/**
 * Event & Run Logs Page
 */

import { api } from '../utils/api.js';
import { showToast } from '../components/toast.js';
import { formatDateTime, getLevelBadgeClass } from '../utils/formatters.js';
import { t } from '../utils/i18n.js';
import { renderCustomSelect, attachCustomSelect } from '../components/customSelect.js';
import { renderDateRangePicker, attachDateRangePicker } from '../components/dateRangePicker.js';

let currentEventPage = 1;
let currentRunPage = 1;
let currentFilters = { level: '', category: '', startDate: '', endDate: '', runId: '' };
let currentRunFilters = { runType: '', status: '' };

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
          <div class="filter-row">
            <div class="filter-cell">
              <label class="form-label">Level</label>
              ${renderCustomSelect({
                id: 'filter-level',
                value: '',
                options: [
                  { value: '',      label: 'All' },
                  { value: 'info',  label: 'Info',    icon: 'ℹ️' },
                  { value: 'warn',  label: 'Warning', icon: '⚠️' },
                  { value: 'error', label: 'Error',   icon: '⛔' },
                ],
                minWidth: '130px',
              })}
            </div>
            <div class="filter-cell">
              <label class="form-label">Category</label>
              ${renderCustomSelect({
                id: 'filter-category',
                value: '',
                options: [
                  { value: '',       label: 'All' },
                  { value: 'engine', label: 'Engine' },
                  { value: 'deluge', label: 'Deluge' },
                  { value: 'radarr', label: 'Radarr' },
                  { value: 'sonarr', label: 'Sonarr' },
                ],
                minWidth: '130px',
              })}
            </div>
            <div class="filter-cell">
              <label class="form-label">Date range</label>
              ${renderDateRangePicker({ id: 'filter-date-range', minWidth: '280px' })}
            </div>
            <div class="filter-cell" style="max-width: 110px;">
              <label class="form-label">${t('run_id')}</label>
              <div class="number-pill">
                <input type="number" id="filter-run-id" placeholder="ID" min="1" />
                <div class="number-pill-spinners">
                  <button type="button" class="number-pill-step" data-step="up" tabindex="-1" aria-label="Increase">▴</button>
                  <button type="button" class="number-pill-step" data-step="down" tabindex="-1" aria-label="Decrease">▾</button>
                </div>
              </div>
            </div>
            <div class="filter-cell filter-cell-action">
              <button class="btn btn-secondary" id="apply-filters-btn">${t('reset')}</button>
            </div>
            <div class="filter-cell filter-cell-action">
              <button class="btn btn-secondary" id="export-csv-btn">📥 Export CSV</button>
            </div>
          </div>
        </div>

        <!-- Log Table -->
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th style="width: 160px;">${t('timestamp')}</th>
                <th style="width: 80px;">${t('level')}</th>
                <th style="width: 100px;">${t('category')}</th>
                <th>${t('message')}</th>
                <th style="width: 80px;">${t('run_id')}</th>
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
        <!-- Filters -->
        <div class="card mb-lg">
          <div class="filter-row">
            <div class="filter-cell">
              <label class="form-label">Type</label>
              ${renderCustomSelect({
                id: 'filter-run-type',
                value: '',
                options: [
                  { value: '',          label: 'All' },
                  { value: 'manual',    label: 'Manual' },
                  { value: 'scheduled', label: 'Scheduled' },
                  { value: 'dry-run',   label: 'Dry Run' },
                  { value: 'compact',   label: 'Maintenance' },
                ],
                minWidth: '140px',
              })}
            </div>
            <div class="filter-cell">
              <label class="form-label">Status</label>
              ${renderCustomSelect({
                id: 'filter-run-status',
                value: '',
                options: [
                  { value: '',        label: 'All' },
                  { value: 'running', label: 'Running' },
                  { value: 'success', label: 'Success' },
                  { value: 'error',   label: 'Error' },
                ],
                minWidth: '140px',
              })}
            </div>
            <div class="filter-cell filter-cell-action">
              <button class="btn btn-secondary" id="apply-run-filters-btn">${t('reset')}</button>
            </div>
          </div>
        </div>
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
        await api.delete('/logs/clear');
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

  // Helper: visibly reset a custom-select to its first option ("All").
  const resetCustomSelect = (id, fallbackLabel = 'All') => {
    const wrapper = document.querySelector(`.custom-select[data-cs-id="${id}"]`);
    if (!wrapper) return;
    const valueEl = wrapper.querySelector('.custom-select-value');
    if (valueEl) valueEl.textContent = fallbackLabel;
    wrapper.querySelectorAll('.custom-select-item').forEach(item => {
      item.classList.toggle('active', item.dataset.csValue === '');
    });
  };

  // Helper: visibly reset the range picker to the empty state.
  const resetDateRangePicker = (id) => {
    const wrapper = document.querySelector(`.date-range-picker[data-drp-id="${id}"]`);
    if (!wrapper) return;
    wrapper.dataset.drpStart = '';
    wrapper.dataset.drpEnd = '';
    const valEl = wrapper.querySelector('.date-picker-value');
    if (valEl) {
      valEl.textContent = 'Date range';
      valEl.classList.add('placeholder');
    }
    wrapper.querySelector('.date-picker-clear')?.remove();
  };

  // Reset button — clear all event filters and re-load.
  document.getElementById('apply-filters-btn')?.addEventListener('click', () => {
    resetCustomSelect('filter-level');
    resetCustomSelect('filter-category');
    resetDateRangePicker('filter-date-range');
    const runIdInput = document.getElementById('filter-run-id');
    if (runIdInput) runIdInput.value = '';

    currentEventPage = 1;
    currentFilters = { level: '', category: '', startDate: '', endDate: '', runId: '' };
    loadEventLogs();
  });

  // Wire each event filter to update currentFilters and reload.
  attachCustomSelect('filter-level', (val) => {
    currentEventPage = 1;
    currentFilters.level = val;
    loadEventLogs();
  });
  attachCustomSelect('filter-category', (val) => {
    currentEventPage = 1;
    currentFilters.category = val;
    loadEventLogs();
  });
  // Single range picker — emits {start, end} as SQLite-compatible UTC
  // timestamp strings. Bounds are auto-swapped server-side / by the picker
  // itself, so the user can't accidentally pick "tomorrow as start, yesterday
  // as end". Quick presets cover Today / Yesterday / Last 7 days / Last 30
  // days / This month / Last month and time-precision Right now / Last 6 hours.
  attachDateRangePicker('filter-date-range', ({ start, end }) => {
    currentEventPage = 1;
    currentFilters.startDate = start;
    currentFilters.endDate = end;
    loadEventLogs();
  });
  const runIdInput = document.getElementById('filter-run-id');
  runIdInput?.addEventListener('input', (e) => {
    currentEventPage = 1;
    const v = e.target.value;
    currentFilters.runId = parseInt(v, 10) > 0 ? v : '';
    loadEventLogs();
  });

  // Custom number-pill spinners — use the input's native stepUp/stepDown
  // and re-fire the input event so the filter logic above runs.
  document.querySelectorAll('.number-pill .number-pill-step').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const pill = btn.closest('.number-pill');
      const input = pill?.querySelector('input[type="number"]');
      if (!input) return;
      if (!input.value) input.value = '0';
      if (btn.dataset.step === 'up') input.stepUp(); else input.stepDown();
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });

  // Export CSV
  document.getElementById('export-csv-btn')?.addEventListener('click', exportCSV);

  // Run-log filters
  document.getElementById('apply-run-filters-btn')?.addEventListener('click', () => {
    resetCustomSelect('filter-run-type');
    resetCustomSelect('filter-run-status');
    currentRunPage = 1;
    currentRunFilters = { runType: '', status: '' };
    loadRunLogs();
  });

  attachCustomSelect('filter-run-type', (val) => {
    currentRunPage = 1;
    currentRunFilters.runType = val;
    loadRunLogs();
  });
  attachCustomSelect('filter-run-status', (val) => {
    currentRunPage = 1;
    currentRunFilters.status = val;
    loadRunLogs();
  });

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
    if (currentFilters.runId) params.set('runId', currentFilters.runId);

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
        <td>${(log.run_id !== null && log.run_id !== undefined) ? `<a href="#" class="run-link text-mono" data-run="${log.run_id}">#${log.run_id}</a>` : '—'}</td>
      </tr>
    `;
  }).join('');

  // Wire up run links
  tbody.querySelectorAll('.run-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const rid = e.currentTarget.getAttribute('data-run');
      if (rid) filterByRun(rid);
    });
  });
}

function filterByRun(runId) {
  const runIdInput = document.getElementById('filter-run-id');
  if (runIdInput) runIdInput.value = runId;

  currentFilters.runId = runId;
  currentEventPage = 1;

  // Switch to events tab
  const eventTabBtn = document.querySelector('.tab-btn[data-tab="events"]');
  eventTabBtn?.click();

  loadEventLogs();
}

// --- RUN LOGS ---

async function loadRunLogs() {
  try {
    const params = new URLSearchParams({
      page: currentRunPage.toString(),
      pageSize: '20',
    });

    if (currentRunFilters.runType) params.set('runType', currentRunFilters.runType);
    if (currentRunFilters.status) params.set('status', currentRunFilters.status);

    const data = await api.get(`/logs/runs?${params.toString()}`);
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
        <td><a href="#" class="run-link text-mono" data-run="${run.id}">#${run.id}</a></td>
        <td class="text-mono" style="font-size: 0.8rem;">${formatDateTime(run.started_at)}</td>
        <td class="text-mono" style="font-size: 0.8rem;">${run.finished_at ? formatDateTime(run.finished_at) : '—'}</td>
        <td><span class="badge badge-info">${run.run_type}</span></td>
        <td>${statusBadge}</td>
        <td>${summaryText}</td>
      </tr>
    `;
  }).join('');

  // Wire up run links
  tbody.querySelectorAll('.run-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const rid = e.currentTarget.getAttribute('data-run');
      if (rid) filterByRun(rid);
    });
  });
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
  buttons += `<button type="button" class="pagination-btn" ${currentPage <= 1 ? 'disabled' : ''} data-page="${currentPage - 1}"><span style="pointer-events: none;">‹</span></button>`;

  // Page numbers (show up to 5)
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, start + 4);

  for (let i = start; i <= end; i++) {
    buttons += `<button type="button" class="pagination-btn ${i === currentPage ? 'active' : ''}" data-page="${i}"><span style="pointer-events: none;">${i}</span></button>`;
  }

  // Next
  buttons += `<button type="button" class="pagination-btn" ${currentPage >= totalPages ? 'disabled' : ''} data-page="${currentPage + 1}"><span style="pointer-events: none;">›</span></button>`;

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
    const params = new URLSearchParams({ page: '1', pageSize: '100000' });
    if (currentFilters.level) params.set('level', currentFilters.level);
    if (currentFilters.category) params.set('category', currentFilters.category);
    if (currentFilters.startDate) params.set('startDate', currentFilters.startDate);
    if (currentFilters.endDate) params.set('endDate', currentFilters.endDate);
    if (currentFilters.runId) params.set('runId', currentFilters.runId);

    const data = await api.get(`/logs/events?${params.toString()}`);

    if (!data.rows || data.rows.length === 0) {
      showToast('No logs to export', 'warning');
      return;
    }

    const header = 'Timestamp,Level,Category,Message,Run ID';
    const rows = data.rows.map(log =>
      `"${log.created_at}","${log.level}","${log.category}","${(log.message || '').replace(/"/g, '""')}","${log.run_id || ''}"`
    );

    const csv = [header, ...rows].join('\n');
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
