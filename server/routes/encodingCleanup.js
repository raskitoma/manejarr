import { Router } from 'express';
import { createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';
import config from '../config.js';
import { getSetting, insertEventLog } from '../db/database.js';
import { decrypt } from '../crypto/encryption.js';
import { createRadarrClient } from '../clients/radarr.js';
import { createSonarrClient } from '../clients/sonarr.js';
import { createLocalStorage } from '../cleanup/localStorage.js';
import { readImports, verifyImport } from '../cleanup/imports.js';

export const encodingCleanupRouter = Router();
const enabled = process.env.ENCODING_CLEANUP === 'true';
const storage = createLocalStorage('/cleanup/output', '/cleanup/library');
const selectionKey = createHmac('sha256', config.encryptionKey).update('encoding-cleanup').digest();
const maxSelection = 100;
let deleting = false;

function managers() {
  return [
    ['radarr', createRadarrClient, 7878, 'moviefile'],
    ['sonarr', createSonarrClient, 8989, 'episodefile'],
  ].flatMap(([name, create, defaultPort, endpoint]) => {
    const host = getSetting(`${name}_host`);
    const key = getSetting(`${name}_api_key`);
    if (!host || !key) return [];
    const outputPrefix = process.env[`CLEANUP_${name.toUpperCase()}_OUTPUT`] || '/downloads/completed';
    const libraryPrefix = process.env[`CLEANUP_${name.toUpperCase()}_LIBRARY`] || '/media';
    if (![outputPrefix, libraryPrefix].every(prefix => prefix.startsWith('/') && prefix !== '/')) {
      throw new Error('Cleanup prefixes must be absolute directory paths');
    }
    return [{
      name, endpoint, outputPrefix, libraryPrefix,
      client: create({ host, apiKey: decrypt(key), port: Number(getSetting(`${name}_port`)) || defaultPort }),
    }];
  });
}

async function getHistory(sources) {
  const apps = managers();
  const results = await Promise.allSettled(apps.map(async app => ({
    ...app, imports: await readImports(app.client, app.outputPrefix, sources),
  })));
  return {
    available: results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []),
    incomplete: !apps.length || results.some(result => result.status === 'rejected'),
  };
}

encodingCleanupRouter.get('/status', (req, res) => res.json({ enabled }));
encodingCleanupRouter.use((req, res, next) => {
  if (!enabled) return res.sendStatus(404);
  next();
});

encodingCleanupRouter.get('/', async (req, res) => {
  try {
    await storage.checkRoots();
  } catch {
    return res.status(503).json({ error: 'cleanup_storage_unavailable' });
  }
  const sources = new Set();
  for await (const relative of storage.walk()) sources.add(relative);
  const history = sources.size ? await getHistory(sources) : { available: [], incomplete: false };
  const files = [];
  for (const relative of sources) {
    const source = await storage.inspectOutput(relative).catch(() => null);
    if (!source) continue;
    const { evidence, ...result } = await verifyImport(storage, relative, source, history);
    const token = evidence && jwt.sign(
      { relative, identity: source.identity, evidence }, selectionKey,
      { expiresIn: '30m', audience: 'encoding-cleanup', subject: req.user.username },
    );
    files.push({ relative, size: source.size, modified: source.modified, ...result, token });
  }
  res.json({ files });
});

encodingCleanupRouter.post('/delete', async (req, res) => {
  const { tokens, confirmed } = req.body || {};
  if (confirmed !== true || !Array.isArray(tokens) || !tokens.length || tokens.length > maxSelection) {
    return res.status(400).json({ error: 'Confirm a selection of 1–100 files' });
  }
  let selections;
  try {
    selections = [...new Map(tokens.map(token => {
      const selection = jwt.verify(token, selectionKey, {
        algorithms: ['HS256'], audience: 'encoding-cleanup', subject: req.user.username,
      });
      return [selection.relative, selection];
    })).values()];
  } catch {
    return res.status(400).json({ error: 'The selection expired or is invalid. Refresh and review the files again.' });
  }
  if (deleting) return res.status(409).json({ error: 'Cleanup is already in progress' });
  deleting = true;
  try {
    await storage.checkRoots();
    const history = await getHistory(new Set(selections.map(item => item.relative)));
    const results = [];
    for (const { relative, identity, evidence } of selections) {
      let status = 'skipped';
      try {
        const source = await storage.inspectOutput(relative);
        if (source.identity === identity) {
          const current = await verifyImport(storage, relative, source, history);
          if (JSON.stringify(current.evidence) === JSON.stringify(evidence) && await storage.remove(relative, identity)) {
            status = 'deleted';
          }
        }
      } catch {
        status = 'skipped';
      }
      results.push({ relative, status });
      insertEventLog(null, status === 'deleted' ? 'info' : 'warn', 'cleanup', `Encoding cleanup ${status}: ${relative}`);
    }
    res.json({ results });
  } finally {
    deleting = false;
  }
});
