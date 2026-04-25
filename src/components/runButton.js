/**
 * Run Button Component
 */

import { api } from '../utils/api.js';
import { showToast } from './toast.js';
import { t } from '../utils/i18n.js';

let pollInterval = null;

/**
 * Render run control buttons.
 */
export function renderRunButtons(containerId, onStatusChange, hasTorrents = true) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <button class="btn btn-primary" id="run-now-btn" ${hasTorrents ? '' : 'disabled'} title="${hasTorrents ? 'Execute orchestration rules' : 'No torrents to process'}">
      <span class="btn-icon">🚀</span> ${t('run_now')}
    </button>
    <button class="btn btn-secondary" id="dry-run-btn" ${hasTorrents ? '' : 'disabled'} title="${hasTorrents ? 'Simulate orchestration without taking action' : 'No torrents to process'}">
      <span class="btn-icon">🔍</span> ${t('dry_run')}
    </button>
  `;

  document.getElementById('run-now-btn').addEventListener('click', () => triggerRun(false, onStatusChange));
  document.getElementById('dry-run-btn').addEventListener('click', () => triggerRun(true, onStatusChange));
}

async function triggerRun(dryRun, onStatusChange) {
  const runBtn = document.getElementById('run-now-btn');
  const dryBtn = document.getElementById('dry-run-btn');

  try {
    // Disable buttons and show loading
    if (runBtn) { 
      runBtn.disabled = true; 
      if (!dryRun) {
        runBtn.classList.add('btn-running-animated');
        runBtn.innerHTML = `<span class="spinner"></span> ${t('running')}...`;
      }
    }
    if (dryBtn) { 
      dryBtn.disabled = true; 
      if (dryRun) {
        dryBtn.classList.add('btn-running-animated');
        dryBtn.innerHTML = `<span class="spinner"></span> ${t('running')}...`;
      }
    }

    showToast(`${dryRun ? t('dry_run') : t('run_now')} ${t('started')}...`, 'info');

    await api.post('/run', { dryRun });

    // Start polling for status
    startStatusPolling(onStatusChange);

  } catch (err) {
    showToast(err.message, 'error');
    resetButtons();
  }
}

function startStatusPolling(onStatusChange) {
  if (pollInterval) clearInterval(pollInterval);

  pollInterval = setInterval(async () => {
    try {
      const status = await api.get('/run/status');

      if (onStatusChange) onStatusChange(status);

      if (!status.running) {
        clearInterval(pollInterval);
        pollInterval = null;
        resetButtons();

        // Fetch the summary of the completed run
        try {
          const logData = await api.get('/logs/runs?page=1&pageSize=1');
          if (logData.rows && logData.rows.length > 0) {
            const lastRun = logData.rows[0];
            if (lastRun.status === 'success') {
              const s = lastRun.summary?.totals || {};
              showToast(`Run complete. Processed: ${s.processed || 0} | Actions: ${s.actions || 0} | Errors: ${s.errors || 0}`, 'success');
            } else {
              showToast(`Run failed: ${lastRun.error || 'Check logs for details'}`, 'error');
            }
          } else {
            showToast('Run completed successfully!', 'success');
          }
        } catch (e) {
          showToast('Run completed successfully!', 'success');
        }
      }
    } catch (err) {
      clearInterval(pollInterval);
      pollInterval = null;
      resetButtons();
    }
  }, 2000);
}

function resetButtons() {
  const runBtn = document.getElementById('run-now-btn');
  const dryBtn = document.getElementById('dry-run-btn');

  if (runBtn) { 
    runBtn.disabled = false; 
    runBtn.classList.remove('btn-running-animated');
    runBtn.innerHTML = `<span>🚀</span> ${t('run_now')}`; 
  }
  if (dryBtn) { 
    dryBtn.disabled = false; 
    dryBtn.classList.remove('btn-running-animated');
    dryBtn.innerHTML = `<span>🔍</span> ${t('dry_run')}`; 
  }
}

export function setRunButtonsEnabled(enabled, runStatus = { running: false }) {
  // Do not alter state if currently polling (initiated by this component instance)
  if (pollInterval) return;

  const runBtn = document.getElementById('run-now-btn');
  const dryBtn = document.getElementById('dry-run-btn');
  
  if (!runBtn || !dryBtn) return;

  // If a run is in progress (from any source)
  if (runStatus.running) {
    runBtn.disabled = true;
    dryBtn.disabled = true;
    
    // Apply animation to the active button if it's one of these
    if (runStatus.runType === 'manual' || runStatus.runType === 'run') {
      runBtn.classList.add('btn-running-animated');
      runBtn.innerHTML = `<span class="spinner"></span> ${t('running')}...`;
    } else if (runStatus.runType === 'dry-run') {
      dryBtn.classList.add('btn-running-animated');
      dryBtn.innerHTML = `<span class="spinner"></span> ${t('running')}...`;
    }
    return;
  }

  // Normal enabled/disabled state based on torrent availability
  runBtn.disabled = !enabled;
  dryBtn.disabled = !enabled;
  
  if (enabled) {
    runBtn.classList.remove('btn-running-animated');
    dryBtn.classList.remove('btn-running-animated');
    runBtn.innerHTML = `<span>🚀</span> ${t('run_now')}`;
    dryBtn.innerHTML = `<span>🔍</span> ${t('dry_run')}`;
  }
}
