/**
 * Scheduler Page
 */

import { api } from '../utils/api.js';
import { showToast } from '../components/toast.js';
import { showModal, closeModal } from '../components/modal.js';
import { renderCronSlider, getCronValue } from '../components/cronSlider.js';
import { formatCron } from '../utils/formatters.js';
import { t } from '../utils/i18n.js';

export async function renderScheduler() {
  const container = document.getElementById('page-content');
  if (!container) return;

  container.innerHTML = `
    <div style="max-width: 700px;">
      <div class="section-header">
        <h2 class="section-title">${t('scheduled_runs')}</h2>
        <button class="btn btn-primary" id="add-schedule-btn">
          <span>+</span> ${t('add_schedule')}
        </button>
      </div>
      <div id="schedules-list" class="flex flex-col gap-md">
        <div class="text-center text-muted" style="padding: var(--space-2xl);">
          <div class="spinner-lg" style="margin: 0 auto var(--space-md);"></div>
          ${t('connecting')}
        </div>
      </div>
    </div>
  `;

  document.getElementById('add-schedule-btn')?.addEventListener('click', showAddScheduleModal);

  await loadSchedules();
}

async function loadSchedules() {
  try {
    const schedules = await api.get('/schedules');
    // Store globally for edit modal
    window._currentSchedules = schedules;
    renderSchedulesList(schedules);
  } catch (err) {
    if (err.message !== 'Authentication required') {
      showToast('Failed to load schedules', 'error');
    }
  }
}

function renderSchedulesList(schedules) {
  const list = document.getElementById('schedules-list');
  if (!list) return;

  if (schedules.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🕐</div>
        <div class="empty-state-title">${t('no_schedules')}</div>
        <div class="empty-state-text">${t('schedule_hint')}</div>
      </div>
    `;
    return;
  }

  list.innerHTML = schedules.map(s => {
    const isMaintenance = s.task_type === 'compact';
    const systemBadge = isMaintenance ? `<span class="badge badge-info" style="font-size: 0.65rem; margin-left: 8px; vertical-align: middle;">System</span>` : '';
    
    return `
      <div class="schedule-card" data-id="${s.id}">
        <div class="schedule-info">
          <div class="schedule-name">${s.name} ${systemBadge}</div>
          <div style="color: var(--text-secondary); margin-bottom: 4px;">Cron: <code style="color: var(--accent-tertiary);">${s.cron_expr}</code></div>
          <div class="text-muted" style="font-size: 0.85rem;">${formatCron(s.cron_expr)}</div>
        </div>
        <div class="schedule-actions">
          ${isMaintenance ? '' : `
            <label class="toggle">
              <input type="checkbox" ${s.enabled ? 'checked' : ''} data-toggle-id="${s.id}" />
              <span class="toggle-slider"></span>
            </label>
          `}
          <div class="flex gap-sm">
            <button class="btn btn-sm btn-secondary" ${isMaintenance ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''} onclick="window.editSchedule(${s.id})">${t('edit')}</button>
            <button class="btn btn-sm" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); ${isMaintenance ? 'opacity: 0.5; cursor: not-allowed;' : ''}" ${isMaintenance ? 'disabled' : ''} onclick="window.deleteSchedule(${s.id})">${t('delete')}</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Wire up toggles
  list.querySelectorAll('[data-toggle-id]').forEach(toggle => {
    toggle.addEventListener('change', async (e) => {
      const id = e.target.dataset.toggleId;
      try {
        await api.patch(`/schedules/${id}/toggle`, { enabled: e.target.checked });
        showToast(t(e.target.checked ? 'schedule_enabled' : 'schedule_disabled'), 'success');
      } catch (err) {
        showToast(err.message, 'error');
        e.target.checked = !e.target.checked; // Revert
      }
    });
  });
}

function showAddScheduleModal() {
  showModal({
    title: t('create_schedule'),
    content: `
      <div class="form-group">
        <label class="form-label" for="schedule-name">${t('name')}</label>
        <input type="text" id="schedule-name" class="form-input" placeholder="${t('e_g_daily_cleanup')}" />
      </div>
      <div id="cron-selector-container"></div>
    `,
    footer: `
      <button class="btn btn-secondary" onclick="document.dispatchEvent(new CustomEvent('modal:close'))">${t('cancel')}</button>
      <button class="btn btn-primary" id="save-schedule-btn">${t('add_schedule')}</button>
    `,
  });

  renderCronSlider('cron-selector-container');

  document.getElementById('save-schedule-btn')?.addEventListener('click', async () => {
    const name = document.getElementById('schedule-name')?.value;
    const cronExpr = getCronValue();

    if (!name) {
      showToast(t('please_enter_a_schedule_name'), 'warning');
      return;
    }

    try {
      await api.post('/schedules', { name, cron_expr: cronExpr });
      closeModal();
      showToast(t('schedule_created'), 'success');
      await loadSchedules();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

window.editSchedule = async function(id) {
  const schedule = window._currentSchedules?.find(s => s.id === id);
  if (!schedule) return;

  showModal({
    title: t('edit'),
    content: `
      <div class="form-group">
        <label class="form-label" for="schedule-name">${t('name')}</label>
        <input type="text" id="schedule-name" class="form-input" value="${schedule.name}" />
      </div>
      <div id="cron-selector-container"></div>
    `,
    footer: `
      <button class="btn btn-secondary" onclick="document.dispatchEvent(new CustomEvent('modal:close'))">${t('cancel')}</button>
      <button class="btn btn-primary" id="update-schedule-btn">${t('save_changes')}</button>
    `,
  });

  renderCronSlider('cron-selector-container', schedule.cron_expr);

  document.getElementById('update-schedule-btn')?.addEventListener('click', async () => {
    const name = document.getElementById('schedule-name')?.value;
    const cronExpr = getCronValue();

    if (!name) {
      showToast(t('please_enter_a_schedule_name'), 'warning');
      return;
    }

    try {
      await api.put(`/schedules/${schedule.id}`, { name, cron_expr: cronExpr });
      closeModal();
      showToast(t('schedule_updated'), 'success');
      await loadSchedules();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
};

window.deleteSchedule = async function(id) {
  if (confirm(t('delete') + '?')) {
    try {
      await api.delete(`/schedules/${id}`);
      showToast(t('delete') + ' successful', 'success');
      await loadSchedules();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
};
