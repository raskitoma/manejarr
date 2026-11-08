import path from 'node:path';
import { relativeTo } from './localStorage.js';

export function mapPath(prefix, reported) {
  if (typeof reported !== 'string' || !path.isAbsolute(reported) || reported.includes('\0')) return null;
  return relativeTo(prefix, reported) || null;
}

export async function readImports(client, outputPrefix, sources) {
  const matches = new Map();
  const pageSize = 250;
  for (let page = 1; page <= 40; page++) {
    const history = await client.request(
      `/history?page=${page}&pageSize=${pageSize}&sortKey=date&sortDirection=descending&eventType=3`,
    );
    if (!Array.isArray(history.records)) throw new Error('Invalid import history');
    for (const record of history.records) {
      if (record.eventType !== 'downloadFolderImported') continue;
      const data = Object.fromEntries(Object.entries(record.data || {}).map(([key, value]) => [key.toLowerCase(), value]));
      const source = mapPath(outputPrefix, data.droppedpath);
      if (!sources.has(source)) continue;
      const existing = matches.get(source);
      const match = { id: Number(data.fileid), date: Date.parse(record.date), path: data.importedpath };
      if (!existing) matches.set(source, match);
      else if (existing.id !== match.id || existing.path !== match.path) existing.ambiguous = true;
    }
    if (history.records.length < pageSize || page * pageSize >= history.totalRecords) break;
  }
  return matches;
}

export async function verifyImport(storage, relative, source, history) {
  const candidates = history.available.filter(app => app.imports.has(relative));
  if (candidates.length !== 1) {
    return { status: candidates.length ? 'ambiguous' : history.incomplete ? 'history_unavailable' : 'unverified' };
  }

  const [app] = candidates;
  const match = app.imports.get(relative);
  const record = { app: app.name, destination: match.path };
  if (match.ambiguous || !Number.isSafeInteger(match.id) || match.id <= 0 ||
      !Number.isFinite(match.date) || Math.max(source.modified, source.created) > match.date || !source.size) {
    return { ...record, status: 'unverified' };
  }
  if (history.incomplete) return { ...record, status: 'history_unavailable' };

  try {
    const file = await app.client.request(`/${app.endpoint}/${match.id}`);
    record.destination = file.path || match.path;
    const target = mapPath(app.libraryPrefix, file.path);
    if (file.id !== match.id || !target) return { ...record, status: 'library_unavailable' };
    const destination = await storage.inspectLibrary(target, app.name);
    if (destination.size !== source.size || Number(file.size) !== source.size || source.identity === destination.identity) {
      return { ...record, status: 'size_differs' };
    }
    return {
      ...record,
      status: 'verified',
      evidence: [app.name, match.id, file.path, destination.identity],
      target: { relative: target, manager: app.name, identity: destination.identity },
    };
  } catch {
    return { ...record, status: 'library_unavailable' };
  }
}
