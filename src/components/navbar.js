/**
 * Top Navigation Bar Component
 */
import { t } from '../utils/i18n.js';

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

  const runTypeLabel = runStatus.runType ? ` (${runStatus.runType.replace('-', ' ')})` : '';
  const runPill = runStatus.running
    ? `<div class="run-status-pill running" title="${t('running')}${runTypeLabel}"><span class="spinner"></span> ${t('running')}</div>`
    : `<div class="run-status-pill idle" title="${t('idle')}">● ${t('idle')}</div>`;

  topBar.innerHTML = `
    <div class="top-bar-left">
      <button class="hamburger-btn" id="hamburger-btn">☰</button>
      <h1 class="page-title">${pageTitle}</h1>
    </div>
    <div class="top-bar-right">
      ${connectionDots}
      ${runPill}
    </div>
  `;

  // Hamburger toggle
  document.getElementById('hamburger-btn')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('open');
  });
}
