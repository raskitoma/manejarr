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

  // Print all settings
  const stmt = db.prepare('SELECT key, value FROM settings');
  console.log('--- Database Settings ---');
  while (stmt.step()) {
    const row = stmt.getAsObject();
    // Don't log password/keys directly
    const valueStr = row.key.includes('password') || row.key.includes('api_key') ? '***' : row.value;
    console.log(`${row.key}: ${valueStr}`);
  }
  stmt.free();

  const host = getSetting('deluge_host');
  const port = getSetting('deluge_port');
  const password = decrypt(getSetting('deluge_password'));

  console.log(`\nConnecting to Deluge at ${host}:${port}...`);
  const deluge = createDelugeClient({
    host,
    port: parseInt(port, 10) || 8112,
    password,
  });

  try {
    await deluge.connect();
    console.log('Connected to Deluge successfully!');

    // Test 1: empty fields
    console.log('\n--- Test 1: empty fields ---');
    console.time('Test 1');
    const res1 = await deluge.rpc('core.get_torrents_status', [{}, []]);
    console.timeEnd('Test 1');
    console.log(`Found ${Object.keys(res1 || {}).length} torrents.`);

    // Test 2: minimal fields
    console.log('\n--- Test 2: minimal fields (name, hash, label) ---');
    console.time('Test 2');
    const res2 = await deluge.rpc('core.get_torrents_status', [{}, ['name', 'hash', 'label']]);
    console.timeEnd('Test 2');
    console.log(`Found ${Object.keys(res2 || {}).length} torrents.`);

    // Test 3: current fields list
    const currentFields = [
      'name', 'hash', 'label', 'ratio', 'seeding_time', 'time_added',
      'state', 'paused', 'total_size', 'progress', 'tracker_host',
      'download_payload_rate', 'upload_payload_rate',
      'save_path', 'download_location'
    ];
    console.log('\n--- Test 3: current fields list ---');
    console.time('Test 3');
    const res3 = await deluge.rpc('core.get_torrents_status', [{}, currentFields]);
    console.timeEnd('Test 3');
    console.log(`Found ${Object.keys(res3 || {}).length} torrents.`);

  } catch (err) {
    console.error('Deluge test failed:', err);
  }
}

test();
