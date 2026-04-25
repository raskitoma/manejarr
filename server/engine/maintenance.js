/**
 * Maintenance Engine
 */

import { createDelugeClient } from '../clients/deluge.js';
import { getSetting, compactDatabase } from '../db/database.js';
import { decrypt } from '../crypto/encryption.js';

/**
 * Perform database compaction by removing metadata for torrents no longer in Deluge.
 */
export async function runMaintenance() {
  console.log('[MAINTENANCE] Starting database compaction...');
  
  try {
    const delugeHost = getSetting('deluge_host');
    const delugePort = getSetting('deluge_port');
    const delugePassword = getSetting('deluge_password');

    if (!delugeHost || !delugePassword) {
      console.warn('[MAINTENANCE] Deluge not configured, skipping compaction');
      return { deleted: 0 };
    }

    const deluge = createDelugeClient({
      host: delugeHost,
      port: parseInt(delugePort, 10) || 8112,
      password: decrypt(delugePassword),
    });

    await deluge.connect();
    const torrents = await deluge.getAllTorrents();
    const hashes = torrents.map(t => t.hash);

    const result = compactDatabase(hashes);
    console.log(`[MAINTENANCE] Compaction complete. Removed ${result.deleted} stale item(s).`);
    return result;
    
  } catch (err) {
    console.error('[MAINTENANCE] Compaction failed:', err.message);
    throw err;
  }
}
