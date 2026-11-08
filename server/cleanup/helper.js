import { createHash, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { createLocalStorage } from './localStorage.js';

export function createHelperApp(storage, token) {
  if (!token || token.length < 32) throw new Error('Set a random cleanup helper token of at least 32 characters');
  const digest = value => createHash('sha256').update(value).digest();
  const expected = digest(`Bearer ${token}`);
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!timingSafeEqual(digest(req.get('Authorization') || ''), expected)) return res.sendStatus(401);
    next();
  });
  app.use(express.json({ limit: '16kb' }));

  const operations = {
    status: async () => {
      await storage.checkRoots();
      return { available: true };
    },
    list: () => storage.listOutput(),
    output: ({ relative }) => storage.inspectOutput(relative),
    library: ({ relative, manager }) => storage.inspectLibrary(relative, manager),
    remove: async ({ relative, identity, destination }) => {
      await storage.checkRoots();
      return { removed: await storage.remove(relative, identity, destination) };
    },
  };

  for (const [name, operation] of Object.entries(operations)) {
    app.post(`/v1/${name}`, async (req, res) => {
      try {
        res.json(await operation(req.body || {}));
      } catch {
        res.status(409).json({ error: 'Cleanup storage unavailable or file changed' });
      }
    });
  }
  return app;
}

if (process.argv[1] === import.meta.filename) {
  const storage = createLocalStorage('/cleanup/output', '/cleanup/library', {
    appSubdirs: process.env.CLEANUP_HELPER_APP_SUBDIRS === 'true',
  });
  createHelperApp(storage, process.env.CLEANUP_HELPER_TOKEN).listen(8789, '0.0.0.0', () => {
    console.log('Manejarr cleanup helper listening on port 8789');
  });
}
