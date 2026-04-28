/**
 * Notification Dispatcher
 *
 * Sends notifications via configured channels (Email, Telegram).
 * Both are optional — only fires if configured.
 */

import { getSetting } from '../db/database.js';
import { decrypt } from '../crypto/encryption.js';
import { sendEmail, formatEmailBody } from './email.js';
import { sendTelegram, formatTelegramMessage } from './telegram.js';

/**
 * Send run completion notification via all configured channels.
 *
 * @param {Object} summary - Run summary object from the orchestrator
 */
export async function notifyRunComplete(summary) {
  const results = { email: null, telegram: null };

  // ── Email ──
  try {
    const emailEnabled = getSetting('notify_email_enabled');
    const emailValidated = getSetting('notify_email_validated') === '1';
    
    if ((emailEnabled === '1' || emailEnabled === 'true') && emailValidated) {
      const config = {
        host: getSetting('notify_email_host'),
        port: getSetting('notify_email_port'),
        username: getSetting('notify_email_username'),
        password: decryptSafe(getSetting('notify_email_password')),
        from: getSetting('notify_email_from'),
        to: getSetting('notify_email_to'),
      };

      if (config.host && config.from && config.to) {
        const runLabel = summary.runType === 'scheduled' ? 'Scheduled' : summary.runType === 'dry-run' ? 'Dry Run' : 'Manual';
        const subject = `[Manejarr] ${runLabel} Run Complete — ${summary.totals?.errors > 0 ? '⚠ Errors' : '✓ Success'}`;
        const body = formatEmailBody(summary);

        await sendEmail(config, subject, body);
        results.email = { success: true };
        console.log('[NOTIFY] Email notification sent');
      }
    }
  } catch (err) {
    console.error('[NOTIFY] Email notification failed:', err.message);
    results.email = { success: false, error: err.message };
  }

  // ── Telegram ──
  try {
    const tgEnabled = getSetting('notify_telegram_enabled');
    const tgValidated = getSetting('notify_telegram_validated') === '1';

    if ((tgEnabled === '1' || tgEnabled === 'true') && tgValidated) {
      const config = {
        botToken: decryptSafe(getSetting('notify_telegram_bot_token')),
        chatId: getSetting('notify_telegram_chat_id'),
      };

      if (config.botToken && config.chatId) {
        const message = formatTelegramMessage(summary);
        await sendTelegram(config, message);
        results.telegram = { success: true };
        console.log('[NOTIFY] Telegram notification sent');
      }
    }
  } catch (err) {
    console.error('[NOTIFY] Telegram notification failed:', err.message);
    results.telegram = { success: false, error: err.message };
  }

  return results;
}

/**
 * Safely decrypt a value, returning empty string on failure.
 */
function decryptSafe(value) {
  if (!value) return '';
  try {
    return decrypt(value);
  } catch {
    return value; // Might not be encrypted
  }
}

/**
 * Send a test notification.
 */
export async function sendTestNotification(channel) {
  const testSummary = {
    runType: 'manual',
    phase1: { processed: 3, matched: 2, unmatched: 1, relabeled: 2, unmonitored: 2, errors: 0 },
    phase2: { processed: 5, transitioned: 2, retained: 3, errors: 0 },
    totals: { processed: 8, actions: 4, errors: 0 },
  };

  if (channel === 'email') {
    const config = {
      host: getSetting('notify_email_host'),
      port: getSetting('notify_email_port'),
      username: getSetting('notify_email_username'),
      password: decryptSafe(getSetting('notify_email_password')),
      from: getSetting('notify_email_from'),
      to: getSetting('notify_email_to'),
    };
    const subject = '[Manejarr] Test Notification';
    const body = formatEmailBody(testSummary);
    await sendEmail(config, subject, body);
    return { success: true };
  }

  if (channel === 'telegram') {
    const config = {
      botToken: decryptSafe(getSetting('notify_telegram_bot_token')),
      chatId: getSetting('notify_telegram_chat_id'),
    };
    const message = '🧪 *Manejarr Test Notification*\n\n' + formatTelegramMessage(testSummary);
    await sendTelegram(config, message);
    return { success: true };
  }

  throw new Error(`Unknown notification channel: ${channel}`);
}
