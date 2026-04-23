/**
 * Manejarr — Main Application Entry Point
 *
 * Hash-based SPA router with auth handling, page navigation,
 * and global state management (connection status, run status).
 */

import { renderSidebar } from './components/sidebar.js';
import { renderTopBar } from './components/navbar.js';
import { showModal, closeModal } from './components/modal.js';
import { showToast } from './components/toast.js';
import { logoSVG } from './components/logo.js';
import { api, setCredentials, loadCredentials, hasCredentials, clearCredentials } from './utils/api.js';
import { renderDashboard, cleanupDashboard } from './pages/dashboard.js';
import { renderSettings } from './pages/settings.js';
import { renderScheduler } from './pages/scheduler.js';
import { renderLogs } from './pages/logs.js';
import { render404, cleanup404 } from './pages/404.js';
import { initI18n, t } from './utils/i18n.js';
import { initTheme } from './utils/theme.js';

// ── Initialize App State ──
initTheme();
initI18n();

// Re-render UI on language change
window.addEventListener('i18n:changed', () => {
  if (currentPage?.render) {
    navigate();
  }
});

// ── Global State ──
let connectionStatus = {};
let runStatus = { running: false };

// ── Page Registry ──
const PAGES = {
  dashboard: { title: 'Dashboard', render: renderDashboard, cleanup: cleanupDashboard },
  settings: { title: 'Settings', render: renderSettings },
  scheduler: { title: 'Scheduler', render: renderScheduler },
  logs: { title: 'Event Logs', render: renderLogs },
  404: { title: 'Page Not Found', render: render404, cleanup: cleanup404 },
};

let currentPage = null;

// ── Router ──
function getRoute() {
  const hash = window.location.hash.slice(2) || 'dashboard'; // Remove '#/'
  return hash.split('?')[0]; // Strip query params
}

async function navigate() {
  const route = getRoute();
  
  // Only fallback to dashboard if hash is literally empty
  // Otherwise, if route isn't in PAGES, it's a 404
  let pageId = route;
  if (!route) pageId = 'dashboard';
  else if (!PAGES[route]) pageId = '404';

  const page = PAGES[pageId];

  // Cleanup previous page
  if (currentPage?.cleanup) currentPage.cleanup();
  currentPage = page;

  // Update sidebar
  renderSidebar(route);

  // Update top bar with connection status
  renderTopBar(page.title, connectionStatus, runStatus);

  // Render the page
  try {
    await page.render();
  } catch (err) {
    console.error(`[ROUTER] Failed to render ${route}:`, err);
  }
}

// ── Auth ──
function showLoginModal() {
  showModal({
    title: t('sign_in_title'),
    dismissible: false,
    content: `
      <div style="text-align: center; margin-bottom: var(--space-lg);">
        <div style="margin: 0 auto var(--space-md); width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;">${logoSVG(48)}</div>
        <p class="text-muted" style="font-size: 0.85rem;">${t('enter_admin')}</p>
      </div>
      <div class="form-group">
        <label class="form-label" for="login-username">${t('username')}</label>
        <input type="text" id="login-username" class="form-input" value="admin" autofocus />
      </div>
      <div class="form-group">
        <label class="form-label" for="login-password">${t('password')}</label>
        <input type="password" id="login-password" class="form-input" placeholder="${t('password')}" />
      </div>
      <div id="login-error" class="text-error" style="font-size: 0.85rem; margin-top: var(--space-sm);"></div>
    `,
    footer: `<button class="btn btn-primary w-full" id="login-submit-btn" style="width: 100%;">${t('sign_in')}</button>`,
  });

  const submitLogin = async () => {
    const username = document.getElementById('login-username')?.value;
    const password = document.getElementById('login-password')?.value;
    const errorEl = document.getElementById('login-error');

    if (!username || !password) {
      errorEl.textContent = 'Please enter both username and password.';
      return;
    }

    // Try credentials
    setCredentials(username, password);

    try {
      await api.get('/verify');
      closeModal();
      showToast('Signed in successfully', 'success');
      navigate();
      refreshConnectionStatus();
    } catch (err) {
      clearCredentials();
      errorEl.textContent = 'Invalid credentials. Please try again.';
    }
  };

  document.getElementById('login-submit-btn')?.addEventListener('click', submitLogin);

  // Enter key to submit
  document.getElementById('login-password')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitLogin();
  });
  document.getElementById('login-username')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('login-password')?.focus();
  });
}

// ── Connection Status Polling ──
async function refreshConnectionStatus() {
  if (!hasCredentials()) return;

  try {
    connectionStatus = await api.get('/dashboard/connections');
  } catch (err) {
    // Silent fail — connection status is informational
  }

  try {
    runStatus = await api.get('/run/status');
  } catch (err) {
    // Silent fail
  }

  // Update top bar
  const route = getRoute();
  const page = PAGES[route] || PAGES.dashboard;
  renderTopBar(page.title, connectionStatus, runStatus);
}

// ── App Init ──
async function init() {
  // Listen for auth events
  window.addEventListener('auth:required', showLoginModal);

  // Listen for route changes
  window.addEventListener('hashchange', navigate);

  // Load stored credentials
  const hasAuth = loadCredentials();

  if (!hasAuth) {
    // Show login modal
    renderSidebar('dashboard');
    renderTopBar('Dashboard', {}, {});
    showLoginModal();
    return;
  }

  // Verify credentials are still valid
  try {
    await api.get('/health');
  } catch (err) {
    renderSidebar('dashboard');
    renderTopBar('Dashboard', {}, {});
    showLoginModal();
    return;
  }

  // Initial navigation
  if (!window.location.hash) {
    window.location.hash = '#/dashboard';
  }

  navigate();

  // Start connection status polling
  refreshConnectionStatus();
  setInterval(refreshConnectionStatus, 30000);
}

// Wait for DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
