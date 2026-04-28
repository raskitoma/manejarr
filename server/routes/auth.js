import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { 
  generateRegistrationOptions, 
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from '@simplewebauthn/server';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { verify, generateSecret, generateURI } = require('otplib');
import QRCode from 'qrcode';
import crypto from 'crypto';
import { existsSync } from 'fs';
import config from '../config.js';
import { 
  getSetting, 
  setSetting, 
  getPasskeys, 
  getPasskeyById, 
  insertPasskey, 
  updatePasskeyCounter, 
  deletePasskey,
  insertAuthToken,
  getAuthToken,
  deleteAuthToken
} from '../db/database.js';
import { decrypt, encrypt } from '../crypto/encryption.js';
import { 
  notifyPasskeyAdded, 
  notify2FAEnabled, 
  notifyGoogleLinkStatus, 
  sendSecurityConfirmation 
} from '../notifications/authEmail.js';

const router = Router();

// Memory cache for WebAuthn challenges (expire in 2m)
const challenges = new Map();

/**
 * Public endpoint to get auth configuration.
 */
router.get('/config', (req, res) => {
  const googleEnabled = getSetting('google_auth_enabled') === '1';
  const tfaEnabled = getSetting('2fa_enabled') === '1';
  const emailConfigured = !!getSetting('notify_email_host');
  const emailValidated = getSetting('notify_email_validated') === '1';
  const hasPasskeys = getPasskeys().length > 0;
  
  res.json({ 
    google_enabled: googleEnabled,
    tfa_enabled: tfaEnabled,
    email_configured: emailConfigured,
    email_validated: emailValidated,
    has_passkeys: hasPasskeys
  });
});

// ── Passkeys (WebAuthn) ──

router.post('/passkey/register-options', async (req, res) => {
  const options = await generateRegistrationOptions({
    rpName: 'Manejarr',
    rpID: req.hostname,
    userID: Buffer.from(config.adminUsername),
    userName: config.adminUsername,
    attestationType: 'none',
    excludeCredentials: getPasskeys().map(p => ({
      id: p.credential_id,
      transports: p.transports ? JSON.parse(p.transports) : undefined,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  challenges.set(`reg_${config.adminUsername}`, options.challenge);
  res.json(options);
});

router.post('/passkey/register-verify', async (req, res) => {
  const { body, description } = req.body;
  const expectedChallenge = challenges.get(`reg_${config.adminUsername}`);

  try {
    const origin = `${req.protocol}://${req.get('host')}`;
    const expectedOrigin = [origin, 'http://localhost:5173', 'http://127.0.0.1:5173'];

    console.log('[WEBAUTHN] Verifying registration for:', config.adminUsername);
    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: req.hostname,
    });

    if (verification.verified && verification.registrationInfo) {
      const { registrationInfo } = verification;
      // In SimpleWebAuthn v13, credential info is nested under 'credential'
      const { credential } = registrationInfo;
      
      if (!credential || !credential.id || !credential.publicKey) {
        throw new Error('Missing credential information from verification result');
      }

      // In SimpleWebAuthn v13, credential.id is already a Base64URL string
      const credentialId = credential.id;
      const publicKey = Buffer.from(credential.publicKey).toString('base64');
      
      insertPasskey({
        credentialId,
        publicKey,
        counter: credential.counter || 0,
        transports: credential.transports || body.response.transports || [],
        description: description || 'Unnamed Passkey'
      });

      await notifyPasskeyAdded(description || 'Unnamed Passkey');
      res.json({ verified: true });
    } else {
      res.status(400).json({ error: 'Registration failed or verification invalid' });
    }
  } catch (err) {
    console.error('[WEBAUTHN] Registration Error:', err);
    res.status(400).json({ error: err.message });
  } finally {
    challenges.delete(`reg_${config.adminUsername}`);
  }
});

router.post('/passkey/login-options', async (req, res) => {
  try {
    const passkeys = getPasskeys();
    console.log(`[WEBAUTHN] Found ${passkeys.length} passkeys in DB`);

    const allowCredentials = passkeys
      .filter(p => p && p.credential_id)
      .map(p => {
        try {
          return {
            id: String(p.credential_id),
            transports: (p.transports && p.transports !== 'null') ? JSON.parse(p.transports) : undefined,
          };
        } catch (e) {
          console.warn('[WEBAUTHN] Skipping malformed passkey row:', p.id, e.message);
          return null;
        }
      })
      .filter(Boolean);

    console.log(`[WEBAUTHN] Sending ${allowCredentials.length} credentials to browser`);
    const options = await generateAuthenticationOptions({
      rpID: req.hostname,
      allowCredentials,
      userVerification: 'preferred',
    });

    challenges.set(`auth_${config.adminUsername}`, options.challenge);
    res.json(options);
  } catch (err) {
    console.error('[WEBAUTHN] Login Options Error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/passkey/login-verify', async (req, res) => {
  const { body } = req.body;
  const expectedChallenge = challenges.get(`auth_${config.adminUsername}`);
  const passkey = getPasskeyById(body.id);

  if (!passkey) return res.status(400).json({ error: 'Passkey not found' });

  try {
    const origin = `${req.protocol}://${req.get('host')}`;
    const expectedOrigin = [origin, 'http://localhost:5173', 'http://127.0.0.1:5173'];

    console.log('[WEBAUTHN] Verifying login for:', config.adminUsername);
    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: req.hostname,
      credential: {
        id: String(passkey.credential_id),
        publicKey: Buffer.from(passkey.public_key, 'base64'),
        counter: passkey.counter || 0,
        transports: passkey.transports ? JSON.parse(passkey.transports) : undefined,
      },
    });

    if (verification.verified && verification.authenticationInfo) {
      updatePasskeyCounter(passkey.credential_id, verification.authenticationInfo.newCounter);
      
      const token = jwt.sign(
        { username: config.adminUsername, method: 'passkey' },
        config.encryptionKey,
        { expiresIn: '7d' }
      );

      res.json({ verified: true, token });
    } else {
      res.status(400).json({ error: 'Authentication failed' });
    }
  } catch (err) {
    console.error('[WEBAUTHN] Login Error:', err);
    res.status(400).json({ error: err.message });
  } finally {
    challenges.delete(`auth_${config.adminUsername}`);
  }
});

// ── 2FA (TOTP) ──

router.get('/2fa/setup', async (req, res) => {
  if (getSetting('notify_email_host') === null) {
    return res.status(400).json({ error: 'Email must be configured before enabling 2FA' });
  }

  const secret = generateSecret();
  const otpauth = generateURI({ secret, label: config.adminUsername, issuer: 'Manejarr' });
  const qrCode = await QRCode.toDataURL(otpauth);

  // Store secret temporarily in session/DB? 
  // We'll store it as a pending setting encrypted
  setSetting('2fa_pending_secret', encrypt(secret));
  res.json({ qrCode, secret });
});

router.post('/2fa/enable', async (req, res) => {
  const { code } = req.body;
  const encryptedSecret = getSetting('2fa_pending_secret');
  if (!encryptedSecret) return res.status(400).json({ error: 'Setup not initiated' });

  const secret = decrypt(encryptedSecret);
  const totpResult = await verify({ token: code, secret, window: 1 });
  const verified = totpResult.valid;

  if (verified) {
    const recoveryCodes = Array.from({ length: 10 }, () => crypto.randomBytes(4).toString('hex').toUpperCase());
    setSetting('2fa_secret', encryptedSecret);
    setSetting('2fa_recovery_codes', encrypt(JSON.stringify(recoveryCodes)));
    setSetting('2fa_enabled', '1');
    setSetting('2fa_pending_secret', '');

    await notify2FAEnabled(recoveryCodes);
    res.json({ success: true, recoveryCodes });
  } else {
    res.status(400).json({ error: 'Invalid verification code' });
  }
});

router.post('/2fa/deactivate-request', async (req, res) => {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 min
  
  insertAuthToken(token, '2fa_deactivation', {}, expiresAt);
  await sendSecurityConfirmation('2fa_deactivation', token, `${req.protocol}://${req.get('host')}`);
  
  res.json({ success: true, message: 'Confirmation email sent' });
});

// ── Security Confirmation ──

/**
 * Build the frontend redirect URL.
 * In production the SPA is served from the same origin; in dev, Vite runs on :5173.
 * We detect dev by checking whether the built dist folder exists, since NODE_ENV
 * may be set to 'production' in .env even during local development.
 */
function frontendUrl(req, hash) {
  if (existsSync(config.distDir)) return `/${hash}`;
  // Dev: redirect to the Vite dev server
  return `http://localhost:5173/${hash}`;
}

router.get('/confirm-action', async (req, res) => {
  const { token } = req.query;
  const authToken = getAuthToken(token);

  if (!authToken) {
    return res.redirect(frontendUrl(req, '#/?auth_error=expired'));
  }

  if (authToken.type === '2fa_deactivation') {
    setSetting('2fa_enabled', '0');
    setSetting('2fa_secret', '');
    setSetting('2fa_recovery_codes', '');
    deleteAuthToken(token);
    return res.redirect(frontendUrl(req, '#/?auth_success=2fa_deactivated'));
  }

  if (authToken.type === 'passkey_deletion') {
    deletePasskey(authToken.metadata.credentialId);
    deleteAuthToken(token);
    return res.redirect(frontendUrl(req, '#/?auth_success=passkey_deleted'));
  }

  res.redirect(frontendUrl(req, '#/?auth_error=unknown'));
});

// ── Passkey Management ──

router.get('/passkeys', (req, res) => {
  res.json(getPasskeys());
});

router.post('/passkey/delete-request', async (req, res) => {
  const { credentialId } = req.body;
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  
  insertAuthToken(token, 'passkey_deletion', { credentialId }, expiresAt);
  await sendSecurityConfirmation('passkey_deletion', token, `${req.protocol}://${req.get('host')}`);
  
  res.json({ success: true, message: 'Confirmation email sent' });
});

// ── Google OAuth (Updated with notifications) ──

/**
 * Build the Google OAuth redirect URI.
 * Google strictly requires HTTPS for non-localhost domains.
 */
function getGoogleRedirectUri(req) {
  const baseUrl = getSetting('base_url');
  if (baseUrl) {
    // Remove trailing slash if present
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');
    return `${cleanBaseUrl}/api/auth/google/callback`;
  }
  
  const host = req.get('host');
  const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
  const protocol = isLocal ? req.protocol : 'https';
  return `${protocol}://${host}/api/auth/google/callback`;
}

router.get('/google/url', (req, res) => {
  const clientId = getSetting('google_client_id');
  if (!clientId) {
    return res.status(400).json({ error: 'Google Client ID not configured' });
  }

  const redirectUri = getGoogleRedirectUri(req);
  const client = new OAuth2Client(clientId, '', redirectUri);

  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'],
    prompt: 'select_account'
  });

  res.json({ url });
});

router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('<h1>Auth Failed</h1><p>No code provided by Google.</p>');

  try {
    const clientId = getSetting('google_client_id');
    const encryptedSecret = getSetting('google_client_secret');
    const clientSecret = encryptedSecret ? decrypt(encryptedSecret) : '';

    const redirectUri = getGoogleRedirectUri(req);
    const client = new OAuth2Client(clientId, clientSecret, redirectUri);

    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    const googleUserId = payload['sub'];

    const linkedUserId = getSetting('google_user_id');

    if (linkedUserId && linkedUserId === googleUserId) {
      // Login - check if 2FA is needed
      const tfaEnabled = getSetting('2fa_enabled') === '1';
      if (tfaEnabled) {
        // Return a temp token to complete 2FA? 
        // For simplicity, we'll let the frontend handle the logic
        // But we need a secure way to pass this.
      }

      const token = jwt.sign(
        { username: config.adminUsername, googleUserId },
        config.encryptionKey,
        { expiresIn: '7d' }
      );

      return res.send(`
        <html>
          <body>
            <script>
              window.opener.postMessage({ type: 'google-auth-success', token: '${token}' }, window.location.origin);
              window.close();
            </script>
          </body>
        </html>
      `);
    } else {
      // Return ID for linking
      return res.send(`
        <html>
          <body>
            <script>
              window.opener.postMessage({ type: 'google-auth-link', googleUserId: '${googleUserId}', email: '${payload.email}' }, window.location.origin);
              window.close();
            </script>
          </body>
        </html>
      `);
    }
  } catch (err) {
    res.status(500).send(`<h1>Auth Error</h1><p>${err.message}</p>`);
  }
});

export default router;
