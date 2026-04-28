/**
 * Settings Page
 */

import { api, clearCredentials } from '../utils/api.js';
import { showToast } from '../components/toast.js';
import { t } from '../utils/i18n.js';
import { showModal, closeModal } from '../components/modal.js';
import { startRegistration } from '@simplewebauthn/browser';

export async function renderSettings() {
  const container = document.getElementById('page-content');
  if (!container) return;

  container.innerHTML = `
    <div style="max-width: 800px;">
      
      <!-- Tabs Header -->
      <div class="tabs-header">
        <button class="tab-btn active" data-tab="services">${t('services')}</button>
        <button class="tab-btn" data-tab="rules">${t('rules')}</button>
        <button class="tab-btn" data-tab="notifications">${t('notifications')}</button>
        <button class="tab-btn" data-tab="account">${t('account')}</button>
        <button class="tab-btn" data-tab="extras">Extras</button>
      </div>

      <!-- Services Tab -->
      <div id="tab-services" class="tab-pane active">
        <!-- Deluge -->
        <div class="service-section">
          <div class="service-header">
            <div class="service-title">
              <div class="service-icon" style="background: rgba(52, 152, 219, 0.15); color: #3498db;">⚡</div>
              <span>Deluge</span>
            </div>
          </div>
          <div class="card">
            <div class="form-row-3">
              <div class="form-group">
                <label class="form-label" for="deluge_host">${t('host')}</label>
                <input type="text" id="deluge_host" class="form-input" placeholder="192.168.1.100" />
              </div>
              <div class="form-group">
                <label class="form-label" for="deluge_port">${t('port')}</label>
                <input type="number" id="deluge_port" class="form-input" placeholder="8112" />
              </div>
              <div class="form-group">
                <label class="form-label" for="deluge_password">${t('password')}</label>
                <input type="password" id="deluge_password" class="form-input" placeholder="${t('password')}" />
              </div>
            </div>
            <div class="flex items-center justify-between mt-md">
              <div id="deluge-test-result"></div>
              <button class="btn btn-sm btn-secondary" id="test-deluge-btn">${t('save_test')}</button>
            </div>
          </div>
        </div>

        <!-- Radarr -->
        <div class="service-section">
          <div class="service-header">
            <div class="service-title">
              <div class="service-icon" style="background: rgba(255, 165, 0, 0.15); color: #ffa500;">🎬</div>
              <span>Radarr</span>
            </div>
          </div>
          <div class="card">
            <div class="form-row-3">
              <div class="form-group">
                <label class="form-label" for="radarr_host">${t('host')}</label>
                <input type="text" id="radarr_host" class="form-input" placeholder="192.168.1.100" />
              </div>
              <div class="form-group">
                <label class="form-label" for="radarr_port">${t('port')}</label>
                <input type="number" id="radarr_port" class="form-input" placeholder="7878" />
              </div>
              <div class="form-group">
                <label class="form-label" for="radarr_api_key">${t('api_key')}</label>
                <input type="password" id="radarr_api_key" class="form-input form-input-mono" placeholder="${t('api_key')}" />
              </div>
            </div>
            <div class="flex items-center justify-between mt-md">
              <div id="radarr-test-result"></div>
              <button class="btn btn-sm btn-secondary" id="test-radarr-btn">${t('save_test')}</button>
            </div>
          </div>
        </div>

        <!-- Sonarr -->
        <div class="service-section">
          <div class="service-header">
            <div class="service-title">
              <div class="service-icon" style="background: rgba(46, 204, 113, 0.15); color: #2ecc71;">📺</div>
              <span>Sonarr</span>
            </div>
          </div>
          <div class="card">
            <div class="form-row-3">
              <div class="form-group">
                <label class="form-label" for="sonarr_host">${t('host')}</label>
                <input type="text" id="sonarr_host" class="form-input" placeholder="192.168.1.100" />
              </div>
              <div class="form-group">
                <label class="form-label" for="sonarr_port">${t('port')}</label>
                <input type="number" id="sonarr_port" class="form-input" placeholder="8989" />
              </div>
              <div class="form-group">
                <label class="form-label" for="sonarr_api_key">${t('api_key')}</label>
                <input type="password" id="sonarr_api_key" class="form-input form-input-mono" placeholder="${t('api_key')}" />
              </div>
            </div>
            <div class="flex items-center justify-between mt-md">
              <div id="sonarr-test-result"></div>
              <button class="btn btn-sm btn-secondary" id="test-sonarr-btn">${t('save_test')}</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Rules Tab -->
      <div id="tab-rules" class="tab-pane">
        <div class="service-section">
          <div class="service-header">
            <div class="service-title">
              <div class="service-icon" style="background: rgba(231, 76, 60, 0.15); color: #e74c3c;">⚖️</div>
              <span>Orchestration Rules</span>
            </div>
          </div>
          <div class="card">
            <div class="form-row-3">
              <div class="form-group">
                <label class="form-label" for="min_seeding_days">${t('min_seeding_days')}</label>
                <input type="number" id="min_seeding_days" class="form-input" step="0.1" placeholder="3.0" />
              </div>
              <div class="form-group">
                <label class="form-label" for="min_ratio">${t('min_ratio')}</label>
                <input type="number" id="min_ratio" class="form-input" step="0.1" placeholder="1.0" />
              </div>
              <div class="form-group">
                <label class="form-label" for="log_retention_days">${t('log_retention')}</label>
                <input type="number" id="log_retention_days" class="form-input" step="1" placeholder="30" />
              </div>
            </div>
            <div class="flex justify-end mt-md">
              <button class="btn btn-sm btn-primary" id="save-rules-btn">${t('save_rules')}</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Notifications Tab -->
      <div id="tab-notifications" class="tab-pane">
        <!-- Email Notifications -->
        <div class="service-section">
          <div class="service-header">
            <div class="service-title">
              <div class="service-icon" style="background: rgba(52, 152, 219, 0.15); color: #3498db;">✉️</div>
              <span>Email Notifications</span>
            </div>
            <div class="flex items-center gap-md">
              <div id="email-validation-status" class="flex items-center gap-xs" style="margin-right: 10px;">
                <span class="badge badge-error">Unvalidated</span>
              </div>
              <div class="flex items-center gap-sm">
                <span style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 500;">${t('enable_email')}</span>
                <label class="toggle-switch" for="notify_email_enabled" id="email-toggle-container">
                  <input type="checkbox" id="notify_email_enabled" />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>
          <div class="card" id="email-settings-card">
            <div class="form-row-3">
              <div class="form-group">
                <label class="form-label" for="notify_email_host">${t('host')}</label>
                <input type="text" id="notify_email_host" class="form-input" placeholder="smtp.gmail.com" />
              </div>
              <div class="form-group">
                <label class="form-label" for="notify_email_port">${t('port')}</label>
                <input type="number" id="notify_email_port" class="form-input" placeholder="587" />
              </div>
              <div class="form-group">
                <label class="form-label" for="notify_email_username">${t('username')}</label>
                <input type="text" id="notify_email_username" class="form-input" placeholder="user@gmail.com" />
              </div>
            </div>
            <div class="form-row-3">
              <div class="form-group">
                <label class="form-label" for="notify_email_password">${t('password')}</label>
                <input type="password" id="notify_email_password" class="form-input form-input-mono" placeholder="App Password" />
              </div>
              <div class="form-group">
                <label class="form-label" for="notify_email_from">${t('from_address')}</label>
                <input type="email" id="notify_email_from" class="form-input" placeholder="manejarr@gmail.com" />
              </div>
              <div class="form-group">
                <label class="form-label" for="notify_email_to">${t('to_address')}</label>
                <input type="email" id="notify_email_to" class="form-input" placeholder="you@gmail.com" />
              </div>
            </div>
            <div class="flex items-center justify-between mt-md">
              <div id="email-test-result"></div>
              <div class="flex gap-sm">
                <button class="btn btn-sm btn-secondary" id="validate-email-btn">🛡️ Validate</button>
                <button class="btn btn-sm btn-secondary" id="test-email-btn" title="Save and send a test email">${t('save_test')}</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Telegram Notifications -->
        <div class="service-section">
          <div class="service-header">
            <div class="service-title">
              <div class="service-icon" style="background: rgba(0, 136, 204, 0.15); color: #0088cc;">💬</div>
              <span>Telegram Notifications</span>
            </div>
            <div class="flex items-center gap-md">
              <div id="telegram-validation-status" class="flex items-center gap-xs" style="margin-right: 10px;">
                <span class="badge badge-error">Unvalidated</span>
              </div>
              <div class="flex items-center gap-sm">
                <span style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 500;">${t('enable_telegram')}</span>
                <label class="toggle-switch" for="notify_telegram_enabled">
                  <input type="checkbox" id="notify_telegram_enabled" />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>
          <div class="card" id="telegram-settings-card">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="notify_telegram_bot_token">${t('bot_token')}</label>
                <input type="password" id="notify_telegram_bot_token" class="form-input form-input-mono" placeholder="123456:ABC-DEF1234..." />
              </div>
              <div class="form-group">
                <label class="form-label" for="notify_telegram_chat_id">${t('chat_id')}</label>
                <input type="text" id="notify_telegram_chat_id" class="form-input form-input-mono" placeholder="-1001234567890" />
                <span class="form-hint">Use "channelId/topicId" for topic-based groups</span>
              </div>
            </div>
            <div class="flex items-center justify-between mt-md">
              <div id="telegram-test-result"></div>
              <div class="flex gap-sm">
                <button class="btn btn-sm btn-secondary" id="validate-telegram-btn">🛡️ Validate</button>
                <button class="btn btn-sm btn-secondary" id="test-telegram-btn" title="Save and send a test message">${t('save_test')}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <!-- Account Tab -->
      <div id="tab-account" class="tab-pane">

        <div class="service-section">
          <div class="service-header">
            <div class="service-title">
              <div class="service-icon" style="background: rgba(234, 179, 8, 0.15); color: #eab308;">🔒</div>
              <span>${t('change_password')}</span>
            </div>
          </div>
          <div class="card">
            <div class="form-row-3">
              <div class="form-group">
                <label class="form-label" for="current_password">${t('current_password')}</label>
                <input type="password" id="current_password" class="form-input" placeholder="${t('current_password')}" />
              </div>
              <div class="form-group">
                <label class="form-label" for="new_password">${t('new_password')}</label>
                <input type="password" id="new_password" class="form-input" placeholder="${t('new_password')}" />
                <div id="password-strength" style="margin-top: 6px; display: none;">
                  <div style="height: 4px; background: var(--border-color); border-radius: 2px; overflow: hidden; margin-bottom: 4px;">
                    <div id="password-strength-bar" style="height: 100%; width: 0%; background: var(--status-error); transition: all 0.3s ease;"></div>
                  </div>
                  <div id="password-strength-text" style="font-size: 0.75rem; text-align: right; color: var(--text-muted);">Weak</div>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label" for="confirm_password">${t('confirm_password')}</label>
                <input type="password" id="confirm_password" class="form-input" placeholder="${t('confirm_password')}" />
              </div>
            </div>
            <div class="flex" style="justify-content: flex-end; margin-top: var(--space-md);">
              <button class="btn btn-primary" id="change-password-btn">${t('update_password')}</button>
            </div>
          </div>
        </div>

        <!-- Google Account Linking -->
        <div class="service-section mt-lg" id="google-account-section">
          <div class="service-header">
            <div class="service-title">
              <div class="service-icon" style="background: rgba(66, 133, 244, 0.1); padding: 6px;">
                <svg width="20" height="20" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.49h4.84c-.21 1.12-.84 2.07-1.79 2.7l2.85 2.22c1.67-1.53 2.63-3.79 2.63-6.57z" fill="#4285F4"/><path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.85-2.22c-.79.53-1.8.84-3.11.84-2.39 0-4.41-1.61-5.13-3.77L1.01 13.3C2.49 16.24 5.51 18 9 18z" fill="#34A853"/><path d="M3.87 10.67c-.18-.53-.28-1.1-.28-1.67s.1-1.14.28-1.67l-2.86-2.22C.39 6.24 0 7.58 0 9s.39 2.76 1.01 3.89l2.86-2.22z" fill="#FBBC05"/><path d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.89 11.43 0 9 0 5.51 0 2.49 1.76 1.01 4.7L3.87 6.92c.72-2.16 2.74-3.77 5.13-3.77z" fill="#EA4335"/></svg>
              </div>
              <span>Google Account</span>
            </div>
          </div>
          <div class="card">
            <div class="flex items-center justify-between">
              <div>
                <div id="google-link-status" class="form-label" style="margin-bottom: 4px;">Not linked</div>
                <div id="google-link-email" class="text-secondary" style="font-size: 0.85rem;">Link your Google account to enable one-click sign-in.</div>
              </div>
              <button class="btn btn-secondary" id="link-google-btn">🔗 Link Account</button>
            </div>
          </div>
        </div>

        <!-- Two-Factor Authentication -->
        <div class="service-section mt-lg">
          <div class="service-header">
            <div class="service-title">
              <div class="service-icon" style="background: rgba(16, 185, 129, 0.15); color: #10b981;">📱</div>
              <span>Two-Factor Authentication</span>
            </div>
          </div>
          <div class="card" id="2fa-card">
            <div id="email-warning-2fa" class="alert alert-warning mb-md" style="display: none;">
              Email notifications must be configured, <b>validated</b>, and enabled before setup.
            </div>
            <div class="flex items-center justify-between">
              <div>
                <div id="2fa-status" class="form-label" style="margin-bottom: 4px;">Disabled</div>
                <div class="text-secondary" style="font-size: 0.85rem;">Add an extra layer of security using an authenticator app.</div>
              </div>
              <button class="btn btn-secondary" id="setup-2fa-btn">🛡️ Setup 2FA</button>
              <button class="btn btn-danger" id="deactivate-2fa-btn" style="display: none;">❌ Deactivate</button>
            </div>
          </div>
        </div>

        <!-- Passkeys -->
        <div class="service-section mt-lg">
          <div class="service-header">
            <div class="service-title">
              <div class="service-icon" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6;">🔑</div>
              <span>Passkeys</span>
            </div>
          </div>
          <div class="card">
            <div id="email-warning-passkey" class="alert alert-warning mb-md" style="display: none;">
              Email notifications must be <b>validated</b> for passkey management.
            </div>
            <div class="text-secondary mb-md" style="font-size: 0.85rem;">Use Windows Hello, Yubikey, or biometrics to login directly without a password.</div>
            <div id="passkeys-list" class="mb-md">
              <div class="text-muted text-center py-md">No passkeys registered.</div>
            </div>
            <div class="flex justify-end">
              <button class="btn btn-secondary" id="add-passkey-btn">➕ Add Passkey</button>
            </div>
          </div>
        </div>

      </div>
      
      <!-- Extras Tab -->
      <div id="tab-extras" class="tab-pane">
        <div class="service-section">
          <div class="service-header">
            <div class="service-title">
              <div class="service-icon" style="background: rgba(139, 92, 246, 0.15); color: #8b5cf6;">🛠️</div>
              <span>Maintenance</span>
            </div>
          </div>
          <div class="card">
            <div class="flex items-center justify-between">
              <div>
                <div class="form-label" style="margin-bottom: 4px;">Compact Database</div>
                <div class="text-secondary" style="font-size: 0.85rem;">Remove cached metadata for torrents that are no longer in Deluge.</div>
              </div>
              <button class="btn btn-secondary" id="compact-db-btn">🚀 Compact Now</button>
            </div>
            <div id="compact-result" class="mt-md"></div>
          </div>
        </div>

        <div class="service-section">
          <div class="service-header">
            <div class="service-title">
              <div class="service-icon" style="background: rgba(139, 92, 246, 0.15); color: #8b5cf6;">🌐</div>
              <span>Environment</span>
            </div>
          </div>
          <div class="card">
            <div class="form-group">
              <label class="form-label" for="base_url">Base URL</label>
              <div class="flex gap-sm">
                <input type="url" id="base_url" class="form-input" placeholder="https://google.com" />
                <button class="btn btn-secondary" id="detect-url-btn" title="Detect from current browser URL">🔍 Detect</button>
              </div>
              <span class="form-hint">The public URL where Manejarr is accessible. Used for OAuth redirects and notifications.</span>
            </div>
            <div class="flex justify-end mt-md">
              <button class="btn btn-primary" id="save-env-btn">Save Environment</button>
            </div>
          </div>
        </div>

        <!-- Google OAuth Configuration -->
        <div class="service-section mt-lg">
          <div class="service-header">
            <div class="service-title">
              <div class="service-icon" style="background: rgba(66, 133, 244, 0.15); color: #4285f4;">G</div>
              <span>Google Sign-in</span>
            </div>
            <div class="flex items-center gap-sm">
              <span style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 500;">Enable Google Sign-in</span>
              <label class="toggle-switch" for="google_auth_enabled">
                <input type="checkbox" id="google_auth_enabled" />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>
          <div class="card">
            <div class="form-group">
              <label class="form-label" for="google_client_id">Client ID</label>
              <input type="text" id="google_client_id" class="form-input form-input-mono" placeholder="your-client-id.apps.googleusercontent.com" />
            </div>
            <div class="form-group">
              <label class="form-label" for="google_client_secret">Client Secret</label>
              <input type="password" id="google_client_secret" class="form-input form-input-mono" placeholder="GOCSPX-..." />
            </div>
            <div class="form-group">
              <label class="form-label">Callback URL</label>
              <div class="flex gap-sm">
                <input type="text" id="google_callback_url" class="form-input form-input-mono" readonly value="" />
                <button class="btn btn-secondary" id="copy-callback-btn" title="Copy to clipboard">📋 Copy</button>
              </div>
              <span class="form-hint">Paste this into the "Authorized redirect URIs" in Google Cloud Console.</span>
            </div>
            <div class="flex justify-end mt-md">
              <button class="btn btn-primary" id="save-google-btn">Save Google Settings</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Load current settings
  await loadSettings();

  // Wire up tabs
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      // Remove active from all
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      
      // Add active to clicked
      e.target.classList.add('active');
      const tabId = e.target.getAttribute('data-tab');
      document.getElementById(`tab-${tabId}`).classList.add('active');
    });
  });

  // Wire up save & test events
  document.getElementById('test-deluge-btn')?.addEventListener('click', () => saveAndTestService('deluge'));
  document.getElementById('test-radarr-btn')?.addEventListener('click', () => saveAndTestService('radarr'));
  document.getElementById('test-sonarr-btn')?.addEventListener('click', () => saveAndTestService('sonarr'));

  document.getElementById('save-rules-btn')?.addEventListener('click', () => saveSettings('Rules saved successfully'));
  document.getElementById('save-env-btn')?.addEventListener('click', () => saveSettings('Environment settings saved'));

  document.getElementById('test-email-btn')?.addEventListener('click', () => saveAndTestNotification('email'));
  document.getElementById('test-telegram-btn')?.addEventListener('click', () => saveAndTestNotification('telegram'));
  
  document.getElementById('validate-email-btn')?.addEventListener('click', () => validateChannel('email'));
  document.getElementById('validate-telegram-btn')?.addEventListener('click', () => validateChannel('telegram'));

  // Toggle card visibility based on enable state and auto-save
  document.getElementById('notify_email_enabled')?.addEventListener('change', async (e) => {
    const isEnabled = e.target.checked;
    if (!isEnabled) {
      // Reset validation on disable
      await api.put('/settings', { notify_email_validated: '0' });
    }
    updateEmailCardState();
    loadSettings(); // Refresh UI and constraints
    saveSettings('Notification settings saved');
  });
  
  document.getElementById('notify_telegram_enabled')?.addEventListener('change', async (e) => {
    const isEnabled = e.target.checked;
    if (!isEnabled) {
      // Reset validation on disable
      await api.put('/settings', { notify_telegram_validated: '0' });
    }
    updateTelegramCardState();
    loadSettings(); // Refresh UI and constraints
    saveSettings('Notification settings saved');
  });

  document.getElementById('change-password-btn')?.addEventListener('click', changePassword);
  document.getElementById('new_password')?.addEventListener('input', updatePasswordStrength);
  document.getElementById('compact-db-btn')?.addEventListener('click', compactDatabaseUI);

  // Google Sign-in Events
  document.getElementById('save-google-btn')?.addEventListener('click', () => saveSettings('Google settings saved'));
  document.getElementById('copy-callback-btn')?.addEventListener('click', copyCallbackUrl);
  document.getElementById('link-google-btn')?.addEventListener('click', linkGoogleAccount);
  document.getElementById('google_auth_enabled')?.addEventListener('change', () => {
    updateGoogleAccountVisibility();
    saveSettings('Google Sign-in status updated');
  });

  document.getElementById('detect-url-btn')?.addEventListener('click', () => {
    document.getElementById('base_url').value = window.location.origin;
    showToast('URL detected from browser', 'success');
  });

  // 2FA & Passkey Events
  document.getElementById('setup-2fa-btn')?.addEventListener('click', setup2FA);
  document.getElementById('deactivate-2fa-btn')?.addEventListener('click', deactivate2FA);
  document.getElementById('add-passkey-btn')?.addEventListener('click', addPasskey);
}

function copyCallbackUrl() {
  const urlInput = document.getElementById('google_callback_url');
  urlInput.select();
  urlInput.setSelectionRange(0, 99999); // For mobile devices
  navigator.clipboard.writeText(urlInput.value).then(() => {
    showToast('Callback URL copied to clipboard', 'success');
  }).catch(err => {
    showToast('Failed to copy: ' + err.message, 'error');
  });
}

async function linkGoogleAccount() {
  const btn = document.getElementById('link-google-btn');
  btn.disabled = true;
  btn.textContent = 'Opening Google...';

  try {
    const { url } = await api.get('/auth/google/url');
    
    // Open popup
    const width = 500;
    const height = 600;
    const left = (window.screen.width / 2) - (width / 2);
    const top = (window.screen.height / 2) - (height / 2);
    
    const popup = window.open(url, 'google-auth', `width=${width},height=${height},top=${top},left=${left}`);
    
    // Listen for message from popup
    const handleMessage = async (event) => {
      if (event.origin !== window.location.origin) return;
      
      if (event.data.type === 'google-auth-link') {
        const { googleUserId, email } = event.data;
        completeLinking(googleUserId, email);
        cleanup();
      } else if (event.data.type === 'google-auth-success') {
        // This shouldn't happen during linking unless they were already linked
        showToast('Account already linked and authenticated', 'success');
        window.removeEventListener('message', handleMessage);
      }
    };
    
    window.addEventListener('message', handleMessage);
    
    // Storage event listener (fallback for some browsers)
    const handleStorage = (event) => {
      if (event.key === 'manejarr_google_link' && event.newValue) {
        console.log('[AUTH] Detected link data in localStorage');
        localStorage.removeItem('manejarr_google_link');
        try {
          const { googleUserId, email } = JSON.parse(event.newValue);
          completeLinking(googleUserId, email);
          cleanup();
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
    const checkClosed = setInterval(() => {
      // 1. Check for localStorage bridge data
      const linkDataRaw = localStorage.getItem('manejarr_google_link');
      if (linkDataRaw) {
        localStorage.removeItem('manejarr_google_link');
        try {
          const { googleUserId, email } = JSON.parse(linkDataRaw);
          completeLinking(googleUserId, email);
          cleanup();
          return;
        } catch (e) {
          console.error('[AUTH] Failed to parse link data from storage:', e);
        }
      }

      // 2. Check if popup was closed manually
      if (popup.closed) {
        clearInterval(checkClosed);
        btn.disabled = false;
        btn.textContent = '🔗 Link Account';
      }
    }, 1000);

    const completeLinking = async (googleUserId, email) => {
      try {
        await api.put('/settings', { google_user_id: googleUserId });
        showToast(`Linked to ${email}`, 'success');
        loadSettings(); // Refresh UI
      } catch (err) {
        showToast('Failed to save link: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '🔗 Link Account';
        window.removeEventListener('message', handleMessage);
      }
    };

  } catch (err) {
    showToast('Failed to start Google Auth: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = '🔗 Link Account';
  }
}

async function compactDatabaseUI() {
  const btn = document.getElementById('compact-db-btn');
  const resultDiv = document.getElementById('compact-result');
  
  btn.disabled = true;
  btn.textContent = 'Compacting...';
  resultDiv.innerHTML = '<span class="text-muted">Analyzing database...</span>';
  
  try {
    const res = await api.post('/settings/compact');
    if (res.success) {
      showToast(`Database compacted! Removed ${res.deleted} stale items.`, 'success');
      resultDiv.innerHTML = `<span class="text-success">✓ Success: Removed ${res.deleted} stale metadata items.</span>`;
    } else {
      showToast(res.error || 'Failed to compact database', 'error');
      resultDiv.innerHTML = `<span class="text-error">✕ ${res.error}</span>`;
    }
  } catch (err) {
    showToast(err.message, 'error');
    resultDiv.innerHTML = `<span class="text-error">✕ ${err.message}</span>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '🚀 Compact Now';
  }
}

function updatePasswordStrength(e) {
  const password = e.target.value;
  const container = document.getElementById('password-strength');
  const bar = document.getElementById('password-strength-bar');
  const text = document.getElementById('password-strength-text');
  
  if (!password) {
    container.style.display = 'none';
    return;
  }
  
  container.style.display = 'block';
  
  let score = 0;
  if (password.length > 5) score += 1;
  if (password.length > 9) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score < 2) {
    bar.style.width = '33%';
    bar.style.background = 'var(--status-error)';
    text.textContent = 'Weak';
    text.style.color = 'var(--status-error)';
  } else if (score < 4) {
    bar.style.width = '66%';
    bar.style.background = 'var(--status-warning)';
    text.textContent = 'Medium';
    text.style.color = 'var(--status-warning)';
  } else {
    bar.style.width = '100%';
    bar.style.background = 'var(--status-success)';
    text.textContent = 'Strong';
    text.style.color = 'var(--status-success)';
  }
}

async function changePassword() {
  const currentPassword = document.getElementById('current_password').value;
  const newPassword = document.getElementById('new_password').value;
  const confirmPassword = document.getElementById('confirm_password').value;

  if (!currentPassword || !newPassword) {
    showToast('Please fill out all fields', 'warning');
    return;
  }

  if (newPassword !== confirmPassword) {
    showToast('New passwords do not match', 'error');
    return;
  }

  const btn = document.getElementById('change-password-btn');
  btn.disabled = true;
  btn.textContent = 'Updating...';

  try {
    const res = await api.post('/settings/password', { currentPassword, newPassword });
    if (res.success) {
      showToast('Password updated! Logging out...', 'success');
      setTimeout(() => {
        clearCredentials();
        window.location.reload();
      }, 1500);
    } else {
      showToast(res.error || 'Failed to update password', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Update Password';
  }
}

function updateEmailCardState() {
  const enabled = document.getElementById('notify_email_enabled')?.checked;
  const card = document.getElementById('email-settings-card');
  if (card) card.style.opacity = enabled ? '1' : '0.5';
}

function updateTelegramCardState() {
  const enabled = document.getElementById('notify_telegram_enabled')?.checked;
  const card = document.getElementById('telegram-settings-card');
  if (card) card.style.opacity = enabled ? '1' : '0.5';
}

function updateGoogleAccountVisibility() {
  const enabled = document.getElementById('google_auth_enabled')?.checked;
  const section = document.getElementById('google-account-section');
  if (section) section.style.display = enabled ? 'block' : 'none';
}

async function loadSettings() {
  try {
    const settings = await api.get('/settings');
    const passkeys = await api.get('/auth/passkeys');

    document.getElementById('deluge_host').value = settings.deluge_host || '';
    document.getElementById('deluge_port').value = settings.deluge_port || '';
    document.getElementById('deluge_password').value = settings.deluge_password || '';

    document.getElementById('radarr_host').value = settings.radarr_host || '';
    document.getElementById('radarr_port').value = settings.radarr_port || '';
    document.getElementById('radarr_api_key').value = settings.radarr_api_key || '';

    document.getElementById('sonarr_host').value = settings.sonarr_host || '';
    document.getElementById('sonarr_port').value = settings.sonarr_port || '';
    document.getElementById('sonarr_api_key').value = settings.sonarr_api_key || '';

    // Convert seconds to days for display
    const seedingTimeSec = parseInt(settings.min_seeding_time, 10) || 259200;
    document.getElementById('min_seeding_days').value = (seedingTimeSec / 86400).toString();
    document.getElementById('min_ratio').value = settings.min_ratio || '1.1';
    document.getElementById('log_retention_days').value = settings.log_retention_days || '30';

    // Email notification settings
    document.getElementById('notify_email_enabled').checked = settings.notify_email_enabled === '1' || settings.notify_email_enabled === 'true';
    document.getElementById('notify_email_host').value = settings.notify_email_host || '';
    document.getElementById('notify_email_port').value = settings.notify_email_port || '';
    document.getElementById('notify_email_username').value = settings.notify_email_username || '';
    document.getElementById('notify_email_password').value = settings.notify_email_password || '';
    document.getElementById('notify_email_from').value = settings.notify_email_from || '';
    document.getElementById('notify_email_to').value = settings.notify_email_to || '';

    // Telegram notification settings
    document.getElementById('notify_telegram_enabled').checked = settings.notify_telegram_enabled === '1' || settings.notify_telegram_enabled === 'true';
    document.getElementById('notify_telegram_bot_token').value = settings.notify_telegram_bot_token || '';
    document.getElementById('notify_telegram_chat_id').value = settings.notify_telegram_chat_id || '';

    // Google OAuth settings
    document.getElementById('google_auth_enabled').checked = settings.google_auth_enabled === '1' || settings.google_auth_enabled === 'true';
    document.getElementById('google_client_id').value = settings.google_client_id || '';
    document.getElementById('google_client_secret').value = settings.google_client_secret || '';
    document.getElementById('base_url').value = settings.base_url || '';
    
    updateGoogleAccountVisibility();
    
    // Callback URL (read-only)
    const callbackUrl = window.location.origin + '/api/auth/google/callback';
    document.getElementById('google_callback_url').value = callbackUrl;

    // Account Linking status
    const linkStatus = document.getElementById('google-link-status');
    const linkEmail = document.getElementById('google-link-email');
    const linkBtn = document.getElementById('link-google-btn');
    
    if (settings.google_user_id) {
      linkStatus.textContent = 'Linked';
      linkStatus.classList.add('text-success');
      linkEmail.textContent = 'Your account is linked to Google.';
      linkBtn.textContent = '🔗 Re-link Account';
    } else {
      linkStatus.textContent = 'Not linked';
      linkStatus.classList.remove('text-success');
      linkEmail.textContent = 'Link your Google account to enable one-click sign-in.';
      linkBtn.textContent = '🔗 Link Account';
    }

    // Update card states
    updateEmailCardState();
    updateTelegramCardState();

    // ── Validation Status UI ──
    const updateValidationUI = (channel) => {
      const isValidated = settings[`notify_${channel}_validated`] == '1';
      const statusDiv = document.getElementById(`${channel}-validation-status`);
      const validateBtn = document.getElementById(`validate-${channel}-btn`);
      const toggle = document.getElementById(`notify_${channel}_enabled`);
      const toggleContainer = toggle?.parentElement;
      
      if (statusDiv) {
        if (isValidated) {
          statusDiv.innerHTML = '<span class="text-success flex items-center gap-xs"><b style="font-size: 1.2rem;">✓</b> Validated</span>';
          if (validateBtn) validateBtn.style.display = 'none';
        } else {
          statusDiv.innerHTML = '<span class="badge badge-error">Unvalidated</span>';
          if (validateBtn) validateBtn.style.display = 'block';
        }
      }

      // Toggle behavior
      const isEnabled = settings[`notify_${channel}_enabled`] === '1' || settings[`notify_${channel}_enabled`] === 'true';
      if (toggle) {
        if (!isValidated && !isEnabled) {
          toggle.disabled = true;
          if (toggleContainer) {
            toggleContainer.title = `Validate your ${channel} to enable notifications`;
            toggleContainer.style.cursor = 'not-allowed';
            toggleContainer.style.opacity = '0.5';
          }
        } else {
          toggle.disabled = false;
          if (toggleContainer) {
            toggleContainer.title = "";
            toggleContainer.style.cursor = 'pointer';
            toggleContainer.style.opacity = '1';
          }
        }
      }
    };

    updateValidationUI('email');
    updateValidationUI('telegram');

    // ── Security Constraints (Email specific) ──
    const emailEnabled = settings.notify_email_enabled === '1' || settings.notify_email_enabled === 'true';
    const securityActive = 
      (settings['2fa_enabled'] === '1') || 
      (settings.google_auth_enabled === '1' || settings.google_auth_enabled === 'true') || 
      (passkeys && passkeys.length > 0);

    const emailToggle = document.getElementById('notify_email_enabled');
    const emailToggleContainer = emailToggle?.parentElement;
    const emailValidated = settings.notify_email_validated === '1';

    if (securityActive && emailEnabled) {
      emailToggle.disabled = true;
      if (emailToggleContainer) {
        emailToggleContainer.title = "Cannot be disabled, extra security features require mail notification tools";
        emailToggleContainer.style.cursor = 'not-allowed';
        emailToggleContainer.style.opacity = '0.7';
      }
    } else if (!emailValidated && !emailEnabled) {
      // Only lock if trying to ENABLE while unvalidated
      emailToggle.disabled = true;
      if (emailToggleContainer) {
        emailToggleContainer.title = "Validate your email to enable notifications";
        emailToggleContainer.style.cursor = 'not-allowed';
        emailToggleContainer.style.opacity = '0.5';
      }
    } else {
      // Allow disabling even if unvalidated, or enabling if validated
      emailToggle.disabled = false;
      if (emailToggleContainer) {
        emailToggleContainer.title = "";
        emailToggleContainer.style.cursor = 'pointer';
        emailToggleContainer.style.opacity = '1';
      }
    }

    // 2FA Status
    const tfaStatus = document.getElementById('2fa-status');
    const setup2faBtn = document.getElementById('setup-2fa-btn');
    const deactivate2faBtn = document.getElementById('deactivate-2fa-btn');
    const emailWarning2fa = document.getElementById('email-warning-2fa');
    const emailWarningPasskey = document.getElementById('email-warning-passkey');

    const emailOk = emailEnabled && emailValidated;
    emailWarning2fa.style.display = emailOk ? 'none' : 'block';
    emailWarningPasskey.style.display = emailOk ? 'none' : 'block';
    
    // Disable setup buttons if email not ok
    setup2faBtn.disabled = !emailOk;
    document.getElementById('add-passkey-btn').disabled = !emailOk;
    document.getElementById('link-google-btn').disabled = !emailOk;

    const tfaEnabled = (settings.hasOwnProperty('2fa_enabled') && settings['2fa_enabled'] === '1');
    if (tfaEnabled) {
      tfaStatus.textContent = 'Enabled';
      tfaStatus.classList.add('text-success');
      setup2faBtn.style.display = 'none';
      deactivate2faBtn.style.display = 'block';
    } else {
      tfaStatus.textContent = 'Disabled';
      tfaStatus.classList.remove('text-success');
      setup2faBtn.style.display = 'block';
      deactivate2faBtn.style.display = 'none';
      setup2faBtn.disabled = !emailOk;
    }

    // Load Passkeys
    loadPasskeys();

  } catch (err) {
    if (err.message !== 'Authentication required') {
      showToast('Failed to load settings', 'error');
    }
  }
}

async function saveSettings(successMessage) {
  try {
    // Convert days back to seconds
    const days = parseFloat(document.getElementById('min_seeding_days').value) || 3;

    const settings = {};
    
    const fields = [
      'deluge_host', 'deluge_port', 'deluge_password',
      'radarr_host', 'radarr_port', 'radarr_api_key',
      'sonarr_host', 'sonarr_port', 'sonarr_api_key',
      'min_ratio', 'log_retention_days',
      'notify_email_host', 'notify_email_port', 'notify_email_username',
      'notify_email_password', 'notify_email_from', 'notify_email_to',
      'notify_telegram_bot_token', 'notify_telegram_chat_id',
      'google_client_id', 'google_client_secret', 'base_url'
    ];

    fields.forEach(id => {
      const el = document.getElementById(id);
      if (el) settings[id] = el.value;
    });

    // Handle checkboxes
    const checkboxes = [
      'notify_email_enabled', 'notify_telegram_enabled', 'google_auth_enabled'
    ];
    checkboxes.forEach(id => {
      const el = document.getElementById(id);
      if (el) settings[id] = el.checked ? '1' : '0';
    });

    // Handle special conversions
    const seedingDaysEl = document.getElementById('min_seeding_days');
    if (seedingDaysEl) {
      const days = parseFloat(seedingDaysEl.value) || 3;
      settings.min_seeding_time = Math.round(days * 86400).toString();
    }

    await api.put('/settings', settings);
    if (successMessage) {
      showToast(successMessage, 'success');
    }
    
    // Reload settings to get updated masked values
    await loadSettings();
    
    return true;
  } catch (err) {
    showToast(`Failed to save: ${err.message}`, 'error');
    return false;
  }
}

async function saveAndTestService(service) {
  const btn = document.getElementById(`test-${service}-btn`);
  const resultDiv = document.getElementById(`${service}-test-result`);

  btn.disabled = true;
  btn.textContent = 'Saving...';
  
  const saved = await saveSettings();
  if (!saved) {
    btn.disabled = false;
    btn.textContent = '💾 Save & Test';
    return;
  }

  btn.textContent = 'Testing...';
  resultDiv.innerHTML = '<span class="text-muted">Connecting...</span>';

  const credentialMap = {
    deluge: 'deluge_password',
    radarr: 'radarr_api_key',
    sonarr: 'sonarr_api_key',
  };

  try {
    const host = document.getElementById(`${service}_host`).value;
    const port = document.getElementById(`${service}_port`).value;
    const credential = document.getElementById(credentialMap[service]).value;

    const result = await api.post('/settings/test', { service, host, port, credential });

    if (result.success) {
      resultDiv.innerHTML = `<span class="text-success">✓ Connected (v${result.version || 'unknown'})</span>`;
    } else {
      resultDiv.innerHTML = `<span class="text-error">✕ ${result.error}</span>`;
    }

  } catch (err) {
    resultDiv.innerHTML = `<span class="text-error">✕ ${err.message}</span>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Save & Test';
  }
}

async function saveAndTestNotification(channel) {
  const btn = document.getElementById(`test-${channel}-btn`);
  const resultDiv = document.getElementById(`${channel}-test-result`);

  btn.disabled = true;
  btn.textContent = 'Saving...';
  
  const saved = await saveSettings();
  if (!saved) {
    btn.disabled = false;
    btn.textContent = '💾 Save & Test';
    return;
  }

  btn.textContent = 'Sending...';
  resultDiv.innerHTML = '<span class="text-muted">Sending test notification...</span>';

  try {
    const result = await api.post('/settings/test-notification', { channel });

    if (result.success) {
      resultDiv.innerHTML = `<span class="text-success">✓ Test ${channel} notification sent!</span>`;
      showToast(`Test ${channel} notification sent`, 'success');
    } else {
      resultDiv.innerHTML = `<span class="text-error">✕ ${result.error}</span>`;
    }
  } catch (err) {
    resultDiv.innerHTML = `<span class="text-error">✕ ${err.message}</span>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Save & Test';
  }
}

async function setup2FA() {
  try {
    const { qrCode, secret } = await api.get('/auth/2fa/setup');
    
    showModal({
      title: 'Setup Two-Factor Authentication',
      content: `
        <div class="text-center">
          <p class="mb-md">Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)</p>
          <img src="${qrCode}" style="background: white; padding: 10px; border-radius: 8px; width: 200px; height: 200px;" />
          <div class="mt-md">
            <label class="form-label">Or enter code manually:</label>
            <code style="background: var(--bg-secondary); padding: 4px 8px; border-radius: 4px; font-size: 1.1rem;">${secret}</code>
          </div>
          <div class="mt-lg">
            <label class="form-label" for="tfa-verify-code">Verification Code</label>
            <input type="text" id="tfa-verify-code" class="form-input text-center" placeholder="000000" maxlength="6" style="font-size: 1.5rem; letter-spacing: 0.5rem;" />
          </div>
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" id="cancel-2fa-btn">Cancel</button>
        <button class="btn btn-primary" id="confirm-2fa-btn">Verify & Enable</button>
      `,
    });

    document.getElementById('cancel-2fa-btn').addEventListener('click', closeModal);
    document.getElementById('confirm-2fa-btn').addEventListener('click', async () => {
      const code = document.getElementById('tfa-verify-code').value;
      if (code.length !== 6) return showToast('Please enter a 6-digit code', 'warning');

      try {
        const res = await api.post('/auth/2fa/enable', { code });
        showModal({
          title: '2FA Enabled Successfully!',
          content: `
            <p class="text-success mb-md font-bold">✓ Two-factor authentication is now active.</p>
            <p class="mb-sm">Save these recovery codes in a safe place. They have been sent to your email as well.</p>
            <div class="card bg-secondary" style="font-family: monospace; position: relative; padding: 1rem;">
              <div id="recovery-codes-text" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                ${res.recoveryCodes.map(c => `<div>${c}</div>`).join('')}
              </div>
              <button class="btn btn-secondary btn-sm" id="copy-recovery-btn" style="position: absolute; top: 8px; right: 8px;">📋 Copy</button>
            </div>
          `,
          footer: `<button class="btn btn-primary" id="final-done-btn">Done</button>`
        });
        
        document.getElementById('final-done-btn').addEventListener('click', () => location.reload());
        document.getElementById('copy-recovery-btn').addEventListener('click', () => {
          navigator.clipboard.writeText(res.recoveryCodes.join('\n'));
          showToast('Recovery codes copied', 'success');
        });
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deactivate2FA() {
  showModal({
    title: 'Deactivate 2FA',
    content: `
      <div class="text-center">
        <p class="mb-md">Are you sure you want to disable Two-Factor Authentication?</p>
        <p class="text-warning" style="font-size: 0.85rem;">This will reduce your account security. A confirmation email will be sent to complete the process.</p>
      </div>
    `,
    footer: `
      <button class="btn btn-secondary" id="cancel-deact-2fa-btn">Keep 2FA Enabled</button>
      <button class="btn btn-danger" id="confirm-deact-2fa-btn">Yes, Deactivate</button>
    `
  });

  document.getElementById('cancel-deact-2fa-btn').onclick = closeModal;
  document.getElementById('confirm-deact-2fa-btn').onclick = async () => {
    try {
      const res = await api.post('/auth/2fa/deactivate-request');
      showToast(res.message, 'success');
      closeModal();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };
}

async function loadPasskeys() {
  const list = document.getElementById('passkeys-list');
  if (!list) return;

  try {
    const passkeys = await api.get('/auth/passkeys');
    if (passkeys.length === 0) {
      list.innerHTML = '<div class="text-muted text-center py-md">No passkeys registered.</div>';
      return;
    }

    list.innerHTML = passkeys.map(p => `
      <div class="flex items-center justify-between py-sm border-b" style="border-color: var(--border-color);">
        <div>
          <div class="font-bold">${p.description}</div>
          <div class="text-secondary" style="font-size: 0.75rem;">Created: ${new Date(p.created_at).toLocaleDateString()}</div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="confirmDeletePasskey('${p.credential_id}')" title="Delete Passkey">🗑️</button>
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = `<div class="text-error">Failed to load passkeys: ${err.message}</div>`;
  }
}

// Make globally available for onclick
window.confirmDeletePasskey = async (credentialId) => {
  showModal({
    title: 'Delete Passkey',
    content: '<p>Are you sure you want to delete this passkey? A confirmation email will be sent to your mailbox to proceed with the deletion.</p>',
    footer: `
      <button class="btn btn-secondary" id="cancel-del-pass-btn">Cancel</button>
      <button class="btn btn-danger" id="confirm-del-pass-btn">Delete Passkey</button>
    `
  });
  
  document.getElementById('cancel-del-pass-btn').onclick = closeModal;
  document.getElementById('confirm-del-pass-btn').onclick = async () => {
    try {
      const res = await api.post('/auth/passkey/delete-request', { credentialId });
      showToast(res.message, 'success');
      closeModal();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };
};

async function addPasskey() {
  showModal({
    title: 'Register New Passkey',
    content: `
      <div class="form-group">
        <label class="form-label" for="passkey-desc">Passkey Description</label>
        <input type="text" id="passkey-desc" class="form-input" placeholder="e.g. My MacBook Pro, Yubikey" autofocus />
        <span class="form-hint">Give this passkey a name to recognize it later.</span>
      </div>
    `,
    footer: `
      <button class="btn btn-secondary" id="cancel-add-pass-btn">Cancel</button>
      <button class="btn btn-primary" id="confirm-add-pass-btn">Continue</button>
    `
  });

  document.getElementById('cancel-add-pass-btn').onclick = closeModal;
  document.getElementById('confirm-add-pass-btn').onclick = async () => {
    const description = document.getElementById('passkey-desc').value;
    if (!description) return showToast('Please enter a description', 'warning');

    closeModal();
    try {
      const options = await api.post('/auth/passkey/register-options');
      const attestation = await startRegistration({ optionsJSON: options });
      
      await api.post('/auth/passkey/register-verify', {
        body: attestation,
        description
      });

      showToast('Passkey registered successfully!', 'success');
      loadPasskeys();
    } catch (err) {
      if (err.name !== 'NotAllowedError') showToast(err.message, 'error');
    }
  };
}

async function validateChannel(channel) {
  const btn = document.getElementById(`validate-${channel}-btn`);
  if (!btn) return;
  
  btn.disabled = true;
  const originalText = btn.innerHTML;
  btn.textContent = 'Sending...';

  try {
    // First save settings to ensure we use the latest host/port/credentials
    const saved = await saveSettings();
    if (!saved) {
      btn.disabled = false;
      btn.innerHTML = originalText;
      return;
    }

    const { token: initialToken } = await api.post('/settings/validate/send', { channel });
    let currentToken = initialToken;
    let cooldown = 60;
    let timerInterval = null;

    const startTimer = () => {
      cooldown = 60;
      const resendBtn = document.getElementById('resend-val-btn');
      if (resendBtn) resendBtn.disabled = true;
      
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = setInterval(() => {
        cooldown--;
        const display = document.getElementById('cooldown-display');
        if (display) display.textContent = `Resend available in ${cooldown}s`;
        
        if (cooldown <= 0) {
          clearInterval(timerInterval);
          if (resendBtn) resendBtn.disabled = false;
          if (display) display.textContent = '';
        }
      }, 1000);
    };

    showModal({
      title: `Validate ${channel === 'email' ? 'Email' : 'Telegram'}`,
      closeOnOutsideClick: false,
      content: `
        <div class="text-center">
          <p class="mb-md">A verification code has been sent to your ${channel}. Please enter it below to confirm ownership.</p>
          <div class="form-group">
            <label class="form-label" for="validation-code">Verification Code</label>
            <input type="text" id="validation-code" class="form-input text-center" placeholder="000000" maxlength="6" style="font-size: 1.5rem; letter-spacing: 0.5rem;" />
          </div>
          <div class="mt-md">
            <button class="btn btn-secondary btn-sm" id="resend-val-btn" disabled>Request new code</button>
            <div id="cooldown-display" class="text-secondary mt-xs" style="font-size: 0.75rem;">Resend available in 60s</div>
          </div>
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" id="cancel-val-btn">Cancel</button>
        <button class="btn btn-primary" id="confirm-val-btn">Verify Code</button>
      `,
      onClose: () => {
        if (timerInterval) clearInterval(timerInterval);
      }
    });

    startTimer();

    document.getElementById('resend-val-btn').addEventListener('click', async () => {
      try {
        const { token } = await api.post('/settings/validate/send', { channel });
        currentToken = token;
        showToast('New verification code sent', 'success');
        startTimer();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    document.getElementById('cancel-val-btn').addEventListener('click', closeModal);
    document.getElementById('confirm-val-btn').addEventListener('click', async () => {
      const code = document.getElementById('validation-code').value;
      if (code.length !== 6) return showToast('Please enter a 6-digit code', 'warning');

      try {
        await api.post('/settings/validate/verify', { channel, code, token: currentToken });
        showToast(`${channel === 'email' ? 'Email' : 'Telegram'} validated successfully!`, 'success');
        closeModal();
        loadSettings();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}
