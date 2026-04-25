import { executePhase1 } from './server/engine/phase1.js';
import { createRadarrClient } from './server/clients/radarr.js';
import { createSonarrClient } from './server/clients/sonarr.js';
import { createDelugeClient } from './server/clients/deluge.js';
import { decrypt } from './server/crypto/encryption.js';
import { readFileSync } from 'fs';
import initSqlJs from 'sql.js';

async function test() {
  const SQL = await initSqlJs();
  const buffer = readFileSync('./data/manejarr.db');
  const db = new SQL.Database(buffer);

  const getSetting = (key) => {
    const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
    stmt.bind([key]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row.value;
    }
    stmt.free();
    return null;
  };

  const clients = {
    deluge: createDelugeClient({
      host: getSetting('deluge_host'),
      port: getSetting('deluge_port'),
      password: decrypt(getSetting('deluge_password')),
    }),
    radarr: createRadarrClient({
      host: getSetting('radarr_host'),
      port: getSetting('radarr_port'),
      apiKey: decrypt(getSetting('radarr_api_key')),
    }),
    sonarr: createSonarrClient({
      host: getSetting('sonarr_host'),
      port: getSetting('sonarr_port'),
      apiKey: decrypt(getSetting('sonarr_api_key')),
    }),
  };

  const log = (level, cat, msg) => console.log(`[${level.toUpperCase()}] [${cat}] ${msg}`);

  try {
    console.log('Running Phase 1 test...');
    const result = await executePhase1(clients, { dryRun: true }, log);
    console.log('Phase 1 result details count:', result.details?.length);
  } catch (err) {
    console.error('Phase 1 failed:', err);
  }
}

test();
