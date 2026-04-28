import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { verify } = require('otplib');
import config from '../config.js';
import { getSetting, setSetting } from '../db/database.js';
import { decrypt, encrypt } from '../crypto/encryption.js';

export async function basicAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // ── Bearer Token (JWT) ──
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const decoded = jwt.verify(token, config.encryptionKey);
      req.user = { username: decoded.username, googleUserId: decoded.googleUserId };
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
  }

  // ── Basic Auth ──
  if (!authHeader.startsWith('Basic ')) {
    return res.status(401).json({ error: 'Invalid authentication method' });
  }

  const base64 = authHeader.slice(6);
  const decoded = Buffer.from(base64, 'base64').toString('utf-8');
  const [username, password] = decoded.split(':');

  // Get expected credentials
  const expectedUsername = config.adminUsername;
  const expectedHash = getSetting('admin_password_hash') || config.adminPasswordHash || '';

  if (!expectedHash) {
    console.warn('[AUTH] No admin password hash configured. Rejecting all requests.');
    return res.status(401).json({ error: 'Server not configured. Run deploy.sh first.' });
  }

  if (username !== expectedUsername) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  try {
    const match = await bcrypt.compare(password, expectedHash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check 2FA
    const tfaEnabled = getSetting('2fa_enabled') === '1';
    if (tfaEnabled) {
      const tfaCode = req.headers['x-manejarr-2fa'];
      if (!tfaCode) {
        return res.status(403).json({ error: '2FA_REQUIRED', message: 'Two-factor authentication code required' });
      }

      const secret = decrypt(getSetting('2fa_secret'));
      let verified = false;
      let usedRecovery = false;

      // 1. Try TOTP first only if it looks like a TOTP code (6 digits)
      if (tfaCode.length === 6 && /^\d+$/.test(tfaCode)) {
        try {
          const totpResult = await verify({ token: tfaCode, secret, window: 1 });
          verified = totpResult.valid;
        } catch (e) {
          console.warn('[AUTH] TOTP verification failed:', e.message);
        }
      }

      // 2. If not verified by TOTP, check recovery codes
      if (!verified) {
        const encryptedCodes = getSetting('2fa_recovery_codes');
        const recoveryCodes = encryptedCodes ? JSON.parse(decrypt(encryptedCodes)) : [];
        const codeIndex = recoveryCodes.indexOf(tfaCode.toUpperCase());

        if (codeIndex !== -1) {
          verified = true;
          usedRecovery = true;
          // Valid recovery code — remove it after use
          recoveryCodes.splice(codeIndex, 1);
          setSetting('2fa_recovery_codes', encrypt(JSON.stringify(recoveryCodes)));
        }
      }

      if (!verified) {
        return res.status(403).json({ 
          error: 'INVALID_2FA', 
          message: tfaCode.length !== 6 ? 'Invalid recovery code' : 'Invalid 2FA code' 
        });
      }
    }

    req.user = { username };
    return next();
  } catch (err) {
    console.error('[AUTH] bcrypt/2fa error:', err);
    return res.status(500).json({ error: 'Internal authentication error' });
  }
}
