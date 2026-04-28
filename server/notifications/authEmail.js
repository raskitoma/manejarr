import { sendEmail } from './email.js';
import { getSetting } from '../db/database.js';
import { decrypt } from '../crypto/encryption.js';

/**
 * Get current SMTP config from database.
 */
function getSmtpConfig() {
  const enabled = getSetting('notify_email_enabled') === '1';
  const validated = getSetting('notify_email_validated') === '1';
  if (!enabled || !validated) return null;

  const host = getSetting('notify_email_host');
  const port = getSetting('notify_email_port');
  const username = getSetting('notify_email_username');
  const encryptedPassword = getSetting('notify_email_password');
  const from = getSetting('notify_email_from');
  const to = getSetting('notify_email_to');

  if (!host || !from || !to) return null;

  return {
    host,
    port,
    username,
    password: encryptedPassword ? decrypt(encryptedPassword) : '',
    from,
    to
  };
}

/**
 * Send a passkey added notification.
 */
export async function notifyPasskeyAdded(description) {
  const config = getSmtpConfig();
  if (!config) return;

  const subject = '[Manejarr] New Passkey Added';
  const body = `A new passkey ("${description}") was added to your Manejarr account. If this wasn't you, please check your security settings immediately.`;
  
  await sendEmail(config, subject, body);
}

/**
 * Send a 2FA enabled notification with recovery codes.
 */
export async function notify2FAEnabled(recoveryCodes) {
  const config = getSmtpConfig();
  if (!config) return;

  const subject = '[Manejarr] 2FA Enabled';
  const body = `Two-factor authentication (TOTP) has been enabled for your Manejarr account.\n\n` +
    `Below are your recovery codes. Keep them in a safe place. Each code can only be used once.\n\n` +
    recoveryCodes.map(code => ` - ${code}`).join('\n') +
    `\n\nIf you lose access to your authenticator app, these codes are the ONLY way to regain access.`;

  await sendEmail(config, subject, body);
}

/**
 * Send a deactivation/deletion confirmation link.
 */
export async function sendSecurityConfirmation(type, token, origin) {
  const config = getSmtpConfig();
  if (!config) return;

  const actionLabels = {
    '2fa_deactivation': 'deactivate Two-Factor Authentication',
    'passkey_deletion': 'delete a Passkey'
  };

  const subject = `[Manejarr] Confirmation Required: ${type.replace('_', ' ')}`;
  const link = `${origin}/api/auth/confirm-action?token=${token}`;
  
  const body = `A request was made to ${actionLabels[type] || type} on your Manejarr account.\n\n` +
    `Please click the link below to confirm this action. This link will expire in 5 minutes.\n\n` +
    `${link}\n\n` +
    `If you did not request this, you can safely ignore this email.`;

  await sendEmail(config, subject, body);
}

/**
 * Send Google Link/Unlink notification.
 */
export async function notifyGoogleLinkStatus(linked, email) {
  const config = getSmtpConfig();
  if (!config) return;

  const subject = linked ? '[Manejarr] Google Account Linked' : '[Manejarr] Google Account Unlinked';
  const body = linked 
    ? `Your Manejarr account has been linked to the Google account: ${email}.`
    : `Your Manejarr account has been unlinked from Google account.`;

  await sendEmail(config, subject, body);
}
