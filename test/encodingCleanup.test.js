import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { mapPath, readImports, verifyImport } from '../server/cleanup/imports.js';
import { createLocalStorage } from '../server/cleanup/localStorage.js';

test('maps exact import paths and deduplicates multi-episode imports by file', async () => {
  const record = {
    eventType: 'downloadFolderImported',
    date: '2026-07-01T12:00:00Z',
    data: { droppedPath: '/downloads/completed/pack/encode.mkv', importedPath: '/media/series/renamed.mkv', fileId: '42' },
  };
  const client = {
    async request(endpoint) {
      assert.match(endpoint, /eventType=3/);
      return { records: [record, { ...record, episodeId: 2 }], totalRecords: 2 };
    },
  };
  const imports = await readImports(client, '/downloads/completed', new Set(['pack/encode.mkv']));
  assert.equal(imports.get('pack/encode.mkv').id, 42);
  assert.equal(imports.get('pack/encode.mkv').ambiguous, undefined);
  assert.equal(mapPath('/downloads/completed', '/downloads/completed-other/encode.mkv'), null);
  assert.equal(mapPath('/downloads/completed', '/downloads/completed/../copied/encode.mkv'), null);
});

test('verifies a renamed library file, then deletes only the reviewed source', async (t) => {
  const base = await realpath(await mkdtemp(path.join(tmpdir(), 'manejarr-cleanup-')));
  t.after(() => rm(base, { recursive: true, force: true }));
  const output = path.join(base, 'output');
  const library = path.join(base, 'library');
  await mkdir(output);
  await mkdir(library);
  const sourcePath = path.join(output, 'encode.mkv');
  const libraryPath = path.join(library, 'renamed.mkv');
  await writeFile(sourcePath, 'video');
  await writeFile(libraryPath, 'video');
  await symlink(libraryPath, path.join(output, 'link.mkv'));
  const storage = createLocalStorage(output, library);
  await storage.checkRoots();
  const inventory = [];
  for await (const file of storage.walk()) inventory.push(file);
  assert.deepEqual(inventory, ['encode.mkv']);
  await assert.rejects(storage.inspectOutput('link.mkv'));

  const source = await storage.inspectOutput('encode.mkv');
  const match = { id: 42, date: Date.now() + 1000, path: '/media/old-name.mkv' };
  const app = {
    name: 'sonarr', endpoint: 'episodefile', libraryPrefix: '/media',
    imports: new Map([['encode.mkv', match]]),
    client: { request: async () => ({ id: 42, path: '/media/renamed.mkv', size: 5 }) },
  };
  const history = { available: [app], incomplete: false };
  const verified = await verifyImport(storage, 'encode.mkv', source, history);
  assert.equal(verified.status, 'verified');
  assert.equal(verified.destination, '/media/renamed.mkv');
  assert.equal((await verifyImport(storage, 'encode.mkv', source, { ...history, incomplete: true })).status, 'history_unavailable');

  await rm(libraryPath);
  assert.equal((await verifyImport(storage, 'encode.mkv', source, history)).status, 'library_unavailable');
  await writeFile(libraryPath, 'wrong size');
  assert.equal((await verifyImport(storage, 'encode.mkv', source, history)).status, 'size_differs');
  await writeFile(sourcePath, 'new video');
  assert.equal(await storage.remove('encode.mkv', source.identity), false);
  assert.equal(await readFile(sourcePath, 'utf8'), 'new video');
  assert.equal(await storage.remove('encode.mkv', (await storage.inspectOutput('encode.mkv')).identity), true);
  assert.equal(await readFile(libraryPath, 'utf8'), 'wrong size');
});
