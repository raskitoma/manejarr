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
import { api, setCredentials, setToken, loadCredentials, hasCredentials, clearCredentials } from './utils/api.js';
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
import { startAuthentication } from '@simplewebauthn/browser';

// ── Auth ──
async function showLoginModal() {
  let authConfig = { google_enabled: false, tfa_enabled: false, has_passkeys: false };
  try {
    authConfig = await api.get('/auth/config');
  } catch (err) {
    console.warn('[AUTH] Failed to fetch auth config:', err);
  }

  const renderContent = (error = '', show2FA = false) => {
    return `
      <div style="text-align: center; margin-bottom: var(--space-lg);">
        <div style="margin: 0 auto var(--space-md); width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;">${logoSVG(48)}</div>
        <p class="text-muted" style="font-size: 0.85rem;">${show2FA ? t('verification_required') : t('enter_admin')}</p>
      </div>

      ${!show2FA ? `
        <div class="form-group">
          <label class="form-label" for="login-username">${t('username')}</label>
          <input type="text" id="login-username" class="form-input" value="admin" autofocus />
        </div>
        <div class="form-group">
          <label class="form-label" for="login-password">${t('password')}</label>
          <input type="password" id="login-password" class="form-input" placeholder="${t('password')}" />
        </div>
        <button class="btn btn-primary w-full mt-md" id="login-submit-btn" style="width: 100%;">${t('sign_in')}</button>
      ` : `
        <div class="form-group text-center">
          <div style="font-weight: 600; margin-bottom: var(--space-xs);">${t('two_fa_code')}</div>
          <p class="text-muted" style="font-size: 0.75rem; margin-bottom: var(--space-md);">${t('enter_2fa_code')}</p>
          <input type="text" id="login-2fa" class="form-input text-center" placeholder="000000" autofocus maxlength="8" style="font-size: 1.5rem; letter-spacing: 0.2rem; width: 200px; margin: 0 auto;" />
        </div>
        <button class="btn btn-primary w-full mt-md" id="login-submit-btn" style="width: 100%;">Verify & Sign In</button>
        <div class="text-center mt-md">
          <a href="#" id="back-to-login" class="text-muted" style="font-size: 0.85rem; text-decoration: none;">&larr; ${t('back_to_password')}</a>
        </div>
      `}
      
      <div id="login-error" class="text-error" style="font-size: 0.85rem; margin-top: var(--space-sm);">${error}</div>
      
      ${!show2FA && (authConfig.google_enabled || authConfig.has_passkeys) ? `
        <div class="auth-divider">
          <span>${t('or') || 'OR'}</span>
        </div>
        <div class="flex flex-col gap-sm">
          ${authConfig.has_passkeys ? `
            <button class="btn btn-secondary w-full flex items-center justify-center gap-sm" id="passkey-login-btn" style="width: 100%;">
              🔑 Sign in with Passkey
            </button>
          ` : ''}
          ${authConfig.google_enabled ? `
            <button class="btn btn-secondary w-full flex items-center justify-center gap-sm" id="google-login-btn" style="width: 100%;">
              <svg width="18" height="18" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.49h4.84c-.21 1.12-.84 2.07-1.79 2.7l2.85 2.22c1.67-1.53 2.63-3.79 2.63-6.57z" fill="#4285F4"/><path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.85-2.22c-.79.53-1.8.84-3.11.84-2.39 0-4.41-1.61-5.13-3.77L1.01 13.3C2.49 16.24 5.51 18 9 18z" fill="#34A853"/><path d="M3.87 10.67c-.18-.53-.28-1.1-.28-1.67s.1-1.14.28-1.67l-2.86-2.22C.39 6.24 0 7.58 0 9s.39 2.76 1.01 3.89l2.86-2.22z" fill="#FBBC05"/><path d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.89 11.43 0 9 0 5.51 0 2.49 1.76 1.01 4.7L3.87 6.92c.72-2.16 2.74-3.77 5.13-3.77z" fill="#EA4335"/></svg>
              Sign in with Google
            </button>
          ` : ''}
        </div>
      ` : ''}
    `;
  };

  const updateModal = (error = '', show2FA = false) => {
    const modalBody = document.querySelector('.modal-body');
    if (modalBody) {
      modalBody.innerHTML = renderContent(error, show2FA);
      wireEvents(show2FA);
    }
  };

  const wireEvents = (show2FA) => {
    if (show2FA) {
      document.getElementById('login-submit-btn').onclick = submit2FA;
      document.getElementById('login-2fa').onkeydown = (e) => { if (e.key === 'Enter') submit2FA(); };
      document.getElementById('back-to-login')?.addEventListener('click', (e) => {
        e.preventDefault();
        import('./utils/api.js').then(m => m.clearCredentials());
        updateModal('', false);
      });
    } else {
      document.getElementById('login-submit-btn').onclick = submitLogin;
      document.getElementById('google-login-btn')?.addEventListener('click', signInWithGoogle);
      document.getElementById('passkey-login-btn')?.addEventListener('click', signInWithPasskey);
      document.getElementById('login-password')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitLogin(); });
      document.getElementById('login-username')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('login-password')?.focus(); });
    }
  };

  let tempUsername = '';
  let tempPassword = '';

  const submitLogin = async () => {
    const username = document.getElementById('login-username')?.value;
    const password = document.getElementById('login-password')?.value;
    if (!username || !password) return updateModal('Please enter credentials');

    tempUsername = username;
    tempPassword = password;

    const { setCredentials } = await import('./utils/api.js');
    // Set credentials temporarily (persist = false)
    setCredentials(username, password, false);

    try {
      const res = await api.get('/verify');
      // No 2FA required - persist token and succeed
      const { setToken } = await import('./utils/api.js');
      setToken(res.token);
      onSuccess();
    } catch (err) {
      if (err.message === '2FA_REQUIRED' || err.message === 'Two-factor authentication code required') {
        updateModal('', true);
      } else {
        const { clearCredentials } = await import('./utils/api.js');
        clearCredentials();
        updateModal(err.message || 'Invalid credentials. Please try again.');
      }
    }
  };

  const submit2FA = async () => {
    const code = document.getElementById('login-2fa')?.value;
    if (!code) return;
    
    const { setTfaCode, setCredentials } = await import('./utils/api.js');
    setTfaCode(code);
    try {
      const res = await api.get('/verify');
      // Success! Use the token for subsequent requests
      const { setToken } = await import('./utils/api.js');
      setToken(res.token);
      onSuccess();
    } catch (err) {
      updateModal(err.message || 'Invalid 2FA code', true);
    }
  };

  const signInWithPasskey = async () => {
    try {
      const options = await api.post('/auth/passkey/login-options');
      const assertion = await startAuthentication({ optionsJSON: options });
      const res = await api.post('/auth/passkey/login-verify', { body: assertion });
      
      if (res.verified) {
        const { setToken } = await import('./utils/api.js');
        setToken(res.token);
        onSuccess();
      }
    } catch (err) {
      if (err.name !== 'NotAllowedError') showToast(err.message, 'error');
    }
  };

  const signInWithGoogle = async () => {
    try {
      const { url } = await api.get('/auth/google/url');
      const width = 500, height = 600;
      const left = (window.screen.width / 2) - (width / 2), top = (window.screen.height / 2) - (height / 2);
      const popup = window.open(url, 'google-auth', `width=${width},height=${height},top=${top},left=${left}`);
      
      const handleMessage = async (event) => {
        if (event.origin !== window.location.origin) return;
        if (event.data.type === 'google-auth-success') {
          const { setToken } = await import('./utils/api.js');
          setToken(event.data.token);
          onSuccess();
          window.removeEventListener('message', handleMessage);
        } else if (event.data.type === 'google-auth-link') {
          updateModal('This Google account is not linked to an admin user.');
          window.removeEventListener('message', handleMessage);
        }
      };
      window.addEventListener('message', handleMessage);

      // Storage event listener (fallback for some browsers)
      const handleStorage = async (event) => {
        if (event.key === 'manejarr_google_auth' && event.newValue) {
          console.log('[AUTH] Detected auth data in localStorage');
          localStorage.removeItem('manejarr_google_auth');
          try {
            const { type, token } = JSON.parse(event.newValue);
            if (type === 'google-auth-success') {
              const { setToken } = await import('./utils/api.js');
              setToken(token);
              onSuccess();
              cleanup();
            }
          } catch (e) {
            console.error('[AUTH] Storage bridge error:', e);
          }
        }
      };
      window.addEventListener('storage', handleStorage);

      const cleanup = () => {
        clearInterval(checkClosed);
        window.removeEventListener('message', handleMessage);
        window.removeEventListener('storage', handleStorage);
        if (!popup.closed) popup.close();
      };

      // Check if popup closed or if localStorage has the data (fallback for window.opener issues)
      const checkClosed = setInterval(async () => {
        // 1. Check for localStorage bridge data
        const authDataRaw = localStorage.getItem('manejarr_google_auth');
        if (authDataRaw) {
          localStorage.removeItem('manejarr_google_auth');
          try {
            const { type, token, googleUserId, email } = JSON.parse(authDataRaw);
            if (type === 'google-auth-success') {
              const { setToken } = await import('./utils/api.js');
              setToken(token);
              onSuccess();
              cleanup();
            } else if (type === 'google-auth-link') {
              updateModal('This Google account is not linked to an admin user.');
              cleanup();
            }
            return;
          } catch (e) {
            console.error('[AUTH] Failed to parse auth data from storage:', e);
          }
        }

        // 2. Check if popup was closed manually
        if (popup.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', handleMessage);
        }
      }, 1000);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const onSuccess = async () => {
    const { clearTfaCode } = await import('./utils/api.js');
    clearTfaCode();
    closeModal();
    showToast('Signed in successfully', 'success');
    navigate();
    refreshConnectionStatus();
  };

  showModal({
    title: t('sign_in_title'),
    dismissible: false,
    content: renderContent(),
    footer: '',
  });

  wireEvents(false);
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

  // Handle auth confirmation messages from redirects
  const hash = window.location.hash;
  if (hash.includes('auth_success=')) {
    const success = hash.split('auth_success=')[1].split('&')[0];
    if (success === '2fa_deactivated') showToast('2FA has been disabled', 'success');
    if (success === 'passkey_deleted') showToast('Passkey has been removed', 'success');
    // Clear the message from URL
    window.location.hash = hash.split('?')[0];
  } else if (hash.includes('auth_error=')) {
    const error = hash.split('auth_error=')[1].split('&')[0];
    if (error === 'expired') showToast('Link has expired or is invalid', 'error');
    else showToast('Action failed', 'error');
    window.location.hash = hash.split('?')[0];
  }

  // Load stored credentials
  const hasAuth = loadCredentials();

  if (!hasAuth) {
    // Show login modal
    showLoginModal();
    return;
  }

  // Verify credentials/session are still valid
  try {
    await api.get('/verify');
  } catch (err) {
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
