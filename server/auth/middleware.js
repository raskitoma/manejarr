import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import config from '../config.js';
import { getSetting } from '../db/database.js';

/**
 * Express middleware for Authentication.
 * Supports HTTP Basic Auth and JWT Bearer Tokens.
 */
export function basicAuth(req, res, next) {
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
    // No password configured — reject all requests
    console.warn('[AUTH] No admin password hash configured. Rejecting all requests.');
    return res.status(401).json({ error: 'Server not configured. Run deploy.sh first.' });
  }

  if (username !== expectedUsername) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // bcrypt compare is async
  bcrypt.compare(password, expectedHash).then(match => {
    if (match) {
      req.user = { username };
      next();
    } else {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
  }).catch(err => {
    console.error('[AUTH] bcrypt error:', err);
    return res.status(500).json({ error: 'Internal authentication error' });
  });
}
