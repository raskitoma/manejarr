import { Router } from 'express';
import bcrypt from 'bcrypt';
import config from '../config.js';
import { getSetting, setSetting, getAllSettings, compactDatabase } from '../db/database.js';
import { encrypt, decrypt, isEncrypted } from '../crypto/encryption.js';
import { createDelugeClient } from '../clients/deluge.js';
import { createRadarrClient } from '../clients/radarr.js';
import { createSonarrClient } from '../clients/sonarr.js';
import { sendTestNotification } from '../notifications/notifier.js';
import { testTelegram } from '../notifications/telegram.js';

const router = Router();

// Keys that contain sensitive data and must be encrypted
const SENSITIVE_KEYS = [
  'deluge_password', 'radarr_api_key', 'sonarr_api_key',
  'notify_email_password', 'notify_telegram_bot_token',
];

// All known setting keys
const SETTING_KEYS = [
  'deluge_host', 'deluge_port', 'deluge_password',
  'radarr_host', 'radarr_port', 'radarr_api_key',
  'sonarr_host', 'sonarr_port', 'sonarr_api_key',
  'min_seeding_time', 'min_ratio',
  // Notification — Email
  'notify_email_enabled', 'notify_email_host', 'notify_email_port',
  'notify_email_username', 'notify_email_password',
  'notify_email_from', 'notify_email_to',
  // Notification — Telegram
  'notify_telegram_enabled', 'notify_telegram_bot_token', 'notify_telegram_chat_id',
  'log_retention_days',
];

/**
 * GET /api/settings
 * Returns current settings with sensitive values masked.
 */
router.get('/', (req, res) => {
  try {
    const settings = {};

    for (const key of SETTING_KEYS) {
      const value = getSetting(key);
      if (value === null) {
        settings[key] = '';
      } else if (SENSITIVE_KEYS.includes(key)) {
        // Mask sensitive values — just indicate if set or not
        settings[key] = value ? '••••••••' : '';
      } else {
        settings[key] = value;
      }
    }

    // Include defaults for logic variables
    if (!settings.min_seeding_time) settings.min_seeding_time = '259200';
    if (!settings.min_ratio) settings.min_ratio = '1.1';

    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/settings
 * Updates settings. Sensitive values are encrypted before storage.
 */
router.put('/', (req, res) => {
  try {
    const updates = req.body;

    for (const [key, value] of Object.entries(updates)) {
      if (!SETTING_KEYS.includes(key)) continue;

      // Skip masked values (user didn't change them)
      if (SENSITIVE_KEYS.includes(key) && value === '••••••••') continue;

      if (SENSITIVE_KEYS.includes(key) && value) {
        // Encrypt sensitive values
        setSetting(key, encrypt(value));
      } else {
        setSetting(key, value);
      }
    }

    res.json({ success: true, message: 'Settings saved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/settings/test
 * Tests connection to a specific service.
 * Body: { service: 'deluge' | 'radarr' | 'sonarr', host, port, credential }
 */
router.post('/test', async (req, res) => {
  const { service, host, port, credential } = req.body;

  try {
    let result;

    // Determine the actual credential to use
    let actualCredential = credential;
    if (!actualCredential || actualCredential === '••••••••') {
      const dbKey = service === 'deluge' ? 'deluge_password' : `${service}_api_key`;
      const savedEncrypted = getSetting(dbKey);
      actualCredential = savedEncrypted ? decrypt(savedEncrypted) : '';
    }

    switch (service) {
      case 'deluge': {
        const client = createDelugeClient({
          host: host || getSetting('deluge_host'),
          port: parseInt(port, 10) || parseInt(getSetting('deluge_port'), 10) || 8112,
          password: actualCredential,
        });
        result = await client.testConnection();
        break;
      }
      case 'radarr': {
        const client = createRadarrClient({
          host: host || getSetting('radarr_host'),
          port: parseInt(port, 10) || parseInt(getSetting('radarr_port'), 10) || 7878,
          apiKey: actualCredential,
        });
        result = await client.testConnection();
        break;
      }
      case 'sonarr': {
        const client = createSonarrClient({
          host: host || getSetting('sonarr_host'),
          port: parseInt(port, 10) || parseInt(getSetting('sonarr_port'), 10) || 8989,
          apiKey: actualCredential,
        });
        result = await client.testConnection();
        break;
      }
      default:
        return res.status(400).json({ error: 'Invalid service' });
    }

    res.json({ success: true, ...result });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/**
 * POST /api/settings/test-notification
 * Send a test notification via a specified channel.
 * Body: { channel: 'email' | 'telegram' }
 */
router.post('/test-notification', async (req, res) => {
  const { channel } = req.body;

  if (!channel || !['email', 'telegram'].includes(channel)) {
    return res.status(400).json({ error: 'Channel must be "email" or "telegram"' });
  }

  try {
    const result = await sendTestNotification(channel);
    res.json({ success: true, ...result });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/**
 * POST /api/settings/password
 * Change the admin password.
 * Body: { currentPassword: '...', newPassword: '...' }
 */
router.post('/password', async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }

  try {
    const expectedHash = getSetting('admin_password_hash') || config.adminPasswordHash || '';

    // If an expected hash exists, verify the current password
    if (expectedHash) {
      const match = await bcrypt.compare(currentPassword, expectedHash);
      if (!match) {
        return res.status(401).json({ error: 'Incorrect current password' });
      }
    }

    // Hash and store the new password
    const newHash = await bcrypt.hash(newPassword, 10);
    setSetting('admin_password_hash', newHash);

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error while updating password' });
  }
});

import { runMaintenance } from '../engine/maintenance.js';

/**
 * POST /api/settings/compact
 * Remove metadata for torrents that are no longer in Deluge.
 */
router.post('/compact', async (req, res) => {
  try {
    const result = await runMaintenance();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
