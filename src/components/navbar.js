/**
 * Top Navigation Bar Component
 */
import { t } from '../utils/i18n.js';

function buildRunPillHtml(runStatus = {}) {
  const runTypeLabel = runStatus.runType ? ` (${runStatus.runType.replace('-', ' ')})` : '';
  return runStatus.running
    ? `<div class="run-status-pill running" title="${t('running')}${runTypeLabel}"><span class="spinner"></span> ${t('running')}</div>`
    : `<div class="run-status-pill idle" title="${t('idle')}">● ${t('idle')}</div>`;
}

export function renderTopBar(pageTitle, connectionStatus = {}, runStatus = {}) {
  const topBar = document.getElementById('top-bar');
  if (!topBar) return;

  const services = ['deluge', 'radarr', 'sonarr'];

  const connectionDots = services.map(s => {
    const status = connectionStatus[s];
    let dotClass = 'status-dot-checking';
    if (status?.connected) dotClass = 'status-dot-connected';
    else if (status?.error) dotClass = 'status-dot-disconnected';

    return `
      <div class="connection-indicator" title="${s}: ${status?.connected ? t('connected') : (status?.error || t('checking'))}">
        <span class="status-dot ${dotClass}"></span>
        <span>${s.charAt(0).toUpperCase() + s.slice(1)}</span>
      </div>
    `;
  }).join('');

  topBar.innerHTML = `
    <div class="top-bar-left">
      <button class="hamburger-btn" id="hamburger-btn">☰</button>
      <h1 class="page-title">${pageTitle}</h1>
    </div>
    <div class="top-bar-right">
      ${connectionDots}
      <div id="run-pill-host">${buildRunPillHtml(runStatus)}</div>
    </div>
  `;

  // Hamburger toggle
  document.getElementById('hamburger-btn')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('open');
  });
}

/**
 * Update only the run pill without re-rendering the whole topbar.
 * Called from the dashboard's run-status pollers so Idle ↔ Running flips
 * within seconds of a click instead of waiting for the 30s connection
 * refresh.
 */
export function updateRunPill(runStatus = {}) {
  const host = document.getElementById('run-pill-host');
  if (!host) return;
  host.innerHTML = buildRunPillHtml(runStatus);
}
