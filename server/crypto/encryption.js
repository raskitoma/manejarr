import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import config from '../config.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Get the encryption key as a Buffer.
 * The key must be a 64-character hex string (32 bytes).
 */
function getKey() {
  const key = config.encryptionKey;
  if (!key || key.length < 32) {
    throw new Error(
      'ENCRYPTION_KEY is not set or too short. Run deploy.sh to generate one.'
    );
  }
  // Accept either 32-byte raw or 64-char hex
  return key.length === 64 ? Buffer.from(key, 'hex') : Buffer.from(key.padEnd(32, '0').slice(0, 32));
}

/**
 * Encrypt a plaintext string.
 * Returns a string in the format: iv:authTag:ciphertext (all hex-encoded).
 */
export function encrypt(plaintext) {
  if (!plaintext) return '';

  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt an encrypted string (iv:authTag:ciphertext format).
 * Returns the original plaintext.
 */
export function decrypt(encrypted) {
  if (!encrypted || !encrypted.includes(':')) return '';

  const key = getKey();
  const [ivHex, authTagHex, ciphertext] = encrypted.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Check if a string looks like an encrypted value (iv:tag:cipher format).
 */
export function isEncrypted(value) {
  if (!value || typeof value !== 'string') return false;
  const parts = value.split(':');
  return parts.length === 3 && parts.every(p => /^[0-9a-f]+$/i.test(p));
}
