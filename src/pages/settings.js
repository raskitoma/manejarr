/**
 * Settings Page
 */

import { api, clearCredentials } from '../utils/api.js';
import { showToast } from '../components/toast.js';
import { t } from '../utils/i18n.js';

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
      </div> </div>
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
              <div class="flex items-center gap-sm">
                <span style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 500;">${t('enable_email')}</span>
                <label class="toggle-switch" for="notify_email_enabled">
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
              <button class="btn btn-sm btn-secondary" id="test-email-btn" title="Save and send a test email">${t('save_test')}</button>
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
              <button class="btn btn-sm btn-secondary" id="test-telegram-btn" title="Save and send a test message">${t('save_test')}</button>
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

  document.getElementById('test-email-btn')?.addEventListener('click', () => saveAndTestNotification('email'));
  document.getElementById('test-telegram-btn')?.addEventListener('click', () => saveAndTestNotification('telegram'));

  // Toggle card visibility based on enable state and auto-save
  document.getElementById('notify_email_enabled')?.addEventListener('change', () => {
    updateEmailCardState();
    saveSettings('Notification settings saved');
  });
  
  document.getElementById('notify_telegram_enabled')?.addEventListener('change', () => {
    updateTelegramCardState();
    saveSettings('Notification settings saved');
  });

  document.getElementById('change-password-btn')?.addEventListener('click', changePassword);
  document.getElementById('new_password')?.addEventListener('input', updatePasswordStrength);
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

async function loadSettings() {
  try {
    const settings = await api.get('/settings');

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

    // Update card states
    updateEmailCardState();
    updateTelegramCardState();

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

    const settings = {
      deluge_host: document.getElementById('deluge_host').value,
      deluge_port: document.getElementById('deluge_port').value,
      deluge_password: document.getElementById('deluge_password').value,
      radarr_host: document.getElementById('radarr_host').value,
      radarr_port: document.getElementById('radarr_port').value,
      radarr_api_key: document.getElementById('radarr_api_key').value,
      sonarr_host: document.getElementById('sonarr_host').value,
      sonarr_port: document.getElementById('sonarr_port').value,
      sonarr_api_key: document.getElementById('sonarr_api_key').value,
      min_seeding_time: Math.round(days * 86400).toString(),
      min_ratio: document.getElementById('min_ratio').value,
      log_retention_days: document.getElementById('log_retention_days').value,
      // Email notifications
      notify_email_enabled: document.getElementById('notify_email_enabled').checked ? '1' : '0',
      notify_email_host: document.getElementById('notify_email_host').value,
      notify_email_port: document.getElementById('notify_email_port').value,
      notify_email_username: document.getElementById('notify_email_username').value,
      notify_email_password: document.getElementById('notify_email_password').value,
      notify_email_from: document.getElementById('notify_email_from').value,
      notify_email_to: document.getElementById('notify_email_to').value,
      // Telegram notifications
      notify_telegram_enabled: document.getElementById('notify_telegram_enabled').checked ? '1' : '0',
      notify_telegram_bot_token: document.getElementById('notify_telegram_bot_token').value,
      notify_telegram_chat_id: document.getElementById('notify_telegram_chat_id').value,
    };

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
