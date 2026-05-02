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

    // Notify the dashboard immediately so siblings (Rematch All) lock now,
    // not after the first 2s poll tick.
    if (onStatusChange) {
      onStatusChange({ running: true, runType: dryRun ? 'dry-run' : 'manual' });
    }

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
              const summaryObj = lastRun.summary || {};
              showToast(`Run complete. Processed: ${s.processed || 0} | Actions: ${s.actions || 0} | Errors: ${s.errors || 0}`, 'success');

              // Extract moved torrents
              const ignoreTorrents = [];
              const forDeletionTorrents = [];
              const unmatchedTorrents = [];

              if (summaryObj.phase1?.details) {
                ignoreTorrents.push(...summaryObj.phase1.details
                  .filter(d => d.action === 'processed' || d.action === 'would_process')
                  .map(d => d.name));
                  
                unmatchedTorrents.push(...summaryObj.phase1.details
                  .filter(d => d.action === 'unmatched')
                  .map(d => d.name));
              }
              if (summaryObj.phase2?.details) {
                forDeletionTorrents.push(...summaryObj.phase2.details
                  .filter(d => d.action === 'transitioned' || d.action === 'would_transition')
                  .map(d => d.name));
              }

              if (ignoreTorrents.length > 0 || forDeletionTorrents.length > 0 || unmatchedTorrents.length > 0) {
                showMovedTorrentsPopup(
                  { ignore: ignoreTorrents, fordeletion: forDeletionTorrents, unmatched: unmatchedTorrents }, 
                  lastRun.finished_at,
                  lastRun.run_type
                );
              }
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

function showMovedTorrentsPopup(torrents, finishedAt, runType) {
  const isDryRun = runType === 'dry-run';
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.display = 'flex';
  
  const modal = document.createElement('div');
  modal.className = 'modal-content';
  modal.style.maxWidth = '600px';
  modal.style.maxHeight = '80vh';
  modal.style.overflowY = 'auto';
  
  const title = document.createElement('h3');
  title.innerText = isDryRun ? 'Dry Run Results (Simulation)' : 'Relabeled Torrents';
  title.style.marginBottom = '5px';
  if (isDryRun) title.style.color = 'var(--status-info)';
  modal.appendChild(title);
  
  const timeSub = document.createElement('div');
  timeSub.style.fontSize = '0.85rem';
  timeSub.style.color = 'var(--text-muted)';
  timeSub.style.marginBottom = '15px';
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  timeSub.innerText = `Executed at: ${finishedAt ? new Date(finishedAt + 'Z').toLocaleString() : new Date().toLocaleString()} (Browser TZ: ${tz})`;
  modal.appendChild(timeSub);
  
  const content = document.createElement('div');
  content.style.maxHeight = '350px';
  content.style.overflowY = 'auto';
  content.style.padding = '10px 15px';
  content.style.background = 'var(--bg-glass)';
  content.style.borderRadius = 'var(--radius-md)';
  content.style.border = '1px solid var(--border-color)';

  if (torrents.ignore && torrents.ignore.length > 0) {
    const h4 = document.createElement('h4');
    h4.innerText = `${isDryRun ? 'Would move' : 'Moved'} to 'ignore' (${torrents.ignore.length})`;
    h4.style.margin = '0 0 10px 0';
    h4.style.color = 'var(--label-ignore)';
    content.appendChild(h4);
    
    const ul = document.createElement('ul');
    ul.style.textAlign = 'left';
    ul.style.paddingLeft = '20px';
    ul.style.marginBottom = '20px';
    torrents.ignore.forEach(t => {
      const li = document.createElement('li');
      li.innerText = t;
      li.style.wordBreak = 'break-all';
      li.style.marginBottom = '4px';
      ul.appendChild(li);
    });
    content.appendChild(ul);
  }

  if (torrents.fordeletion && torrents.fordeletion.length > 0) {
    const h4 = document.createElement('h4');
    h4.innerText = `${isDryRun ? 'Would move' : 'Moved'} to 'fordeletion' (${torrents.fordeletion.length})`;
    h4.style.margin = '0 0 10px 0';
    h4.style.color = 'var(--label-fordeletion)';
    content.appendChild(h4);
    
    const ul = document.createElement('ul');
    ul.style.textAlign = 'left';
    ul.style.paddingLeft = '20px';
    ul.style.marginBottom = '10px';
    torrents.fordeletion.forEach(t => {
      const li = document.createElement('li');
      li.innerText = t;
      li.style.wordBreak = 'break-all';
      li.style.marginBottom = '4px';
      ul.appendChild(li);
    });
    content.appendChild(ul);
  }

  if (torrents.unmatched && torrents.unmatched.length > 0) {
    const h4 = document.createElement('h4');
    h4.innerText = `Unmatched (${torrents.unmatched.length})`;
    h4.style.margin = '0 0 10px 0';
    h4.style.color = 'var(--text-muted)';
    content.appendChild(h4);
    
    const ul = document.createElement('ul');
    ul.style.textAlign = 'left';
    ul.style.paddingLeft = '20px';
    ul.style.marginBottom = '10px';
    torrents.unmatched.forEach(t => {
      const li = document.createElement('li');
      li.innerText = t;
      li.style.wordBreak = 'break-all';
      li.style.marginBottom = '4px';
      ul.appendChild(li);
    });
    content.appendChild(ul);
  }

  modal.appendChild(content);
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn btn-primary';
  closeBtn.innerText = 'Close';
  closeBtn.style.marginTop = '20px';
  closeBtn.onclick = () => document.body.removeChild(overlay);
  
  modal.appendChild(closeBtn);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}
