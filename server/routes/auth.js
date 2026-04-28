import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import config from '../config.js';
import { getSetting, setSetting } from '../db/database.js';
import { decrypt } from '../crypto/encryption.js';

const router = Router();

/**
 * GET /api/auth/config
 * Public endpoint to get auth configuration (e.g. if Google is enabled).
 */
router.get('/config', (req, res) => {
  const enabled = getSetting('google_auth_enabled') === '1';
  res.json({ google_enabled: enabled });
});

/**
 * GET /api/auth/google/url
 * Returns the Google OAuth2 authorization URL.
 */
router.get('/google/url', (req, res) => {
  const clientId = getSetting('google_client_id');
  if (!clientId) {
    return res.status(400).json({ error: 'Google Client ID not configured' });
  }

  const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
  const client = new OAuth2Client(clientId, '', redirectUri);

  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'],
    prompt: 'select_account'
  });

  res.json({ url });
});

/**
 * GET /api/auth/google/callback
 * Handles the redirect from Google.
 */
router.get('/google/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).send('<h1>Auth Failed</h1><p>No code provided by Google.</p>');
  }

  try {
    const clientId = getSetting('google_client_id');
    const encryptedSecret = getSetting('google_client_secret');
    const clientSecret = encryptedSecret ? decrypt(encryptedSecret) : '';

    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth credentials not fully configured');
    }

    const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
    const client = new OAuth2Client(clientId, clientSecret, redirectUri);

    // Exchange code for tokens
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Verify ID token
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    const googleUserId = payload['sub'];

    // Check if we are "linking" an account or "logging in"
    // We can use a cookie or a state param to distinguish, but for simplicity
    // we'll check if the request is already authenticated (via Basic Auth or Session)
    // Actually, since this is a redirect, we might not have the headers.
    // We can use the 'state' parameter to pass a temporary link token or just handle it on the frontend.
    
    // Better approach: Redirect back to frontend with the Google User ID as a temporary param
    // or if already configured, issue a JWT.

    const linkedUserId = getSetting('google_user_id');

    if (linkedUserId && linkedUserId === googleUserId) {
      // Login successful
      const token = jwt.sign(
        { username: config.adminUsername, googleUserId },
        config.encryptionKey, // Use encryption key as JWT secret
        { expiresIn: '7d' }
      );

      // Redirect back to frontend with token
      return res.send(`
        <html>
          <body>
            <script>
              window.opener.postMessage({ type: 'google-auth-success', token: '${token}' }, window.location.origin);
              window.close();
            </script>
            <p>Authentication successful. You can close this window.</p>
          </body>
        </html>
      `);
    } else {
      // Either not linked or mismatch
      // If it's a link attempt, we'll return the ID so the frontend can "save" it
      return res.send(`
        <html>
          <body>
            <script>
              window.opener.postMessage({ type: 'google-auth-link', googleUserId: '${googleUserId}', email: '${payload.email}' }, window.location.origin);
              window.close();
            </script>
            <p>Google account verified. Returning to Manejarr...</p>
          </body>
        </html>
      `);
    }

  } catch (err) {
    console.error('[AUTH] Google OAuth Error:', err.message);
    res.status(500).send(`<h1>Auth Error</h1><p>${err.message}</p>`);
  }
});

export default router;
