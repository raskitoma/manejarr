import { lstat, readdir, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';

const video = /\.(mkv|mp4|m4v|avi|mov|webm|mpg|mpeg|ts|m2ts|wmv)$/i;

export function relativeTo(root, target) {
  const relative = path.relative(root, target);
  if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) return null;
  return relative;
}

export function createLocalStorage(output, library, { appSubdirs = false } = {}) {
  function inspectLibrary(relative, manager) {
    if (appSubdirs && !['radarr', 'sonarr'].includes(manager)) throw new Error('Unknown library');
    if (typeof relative !== 'string' || path.isAbsolute(relative) || path.normalize(relative) !== relative ||
        relativeTo(library, path.resolve(library, relative)) !== relative) {
      throw new Error('Invalid library path');
    }
    return inspect(library, appSubdirs ? `${manager}/${relative}` : relative);
  }

  async function inspect(root, relative) {
    if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) throw new Error('Invalid file path');
    const target = path.resolve(root, relative);
    if (relativeTo(root, target) !== relative || await realpath(target) !== target) {
      throw new Error('Unsafe file path');
    }
    const stat = await lstat(target, { bigint: true });
    if (!stat.isFile()) throw new Error('Expected a regular file');
    return {
      identity: [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':'),
      size: Number(stat.size),
      modified: Number(stat.mtimeMs),
      created: Number(stat.birthtimeMs),
    };
  }

  async function checkRoots() {
    const roots = await Promise.all([output, library].map(async root => {
      const stat = await lstat(root, { bigint: true });
      if (await realpath(root) !== root || !stat.isDirectory()) {
        throw new Error('Invalid cleanup root');
      }
      return `${stat.dev}:${stat.ino}`;
    }));
    if (roots[0] === roots[1] || relativeTo(output, library) !== null || relativeTo(library, output) !== null) {
      throw new Error('Cleanup roots overlap');
    }
  }

  async function* walk(relative = '') {
    const directory = path.join(output, relative);
    if (await realpath(directory) !== directory) return;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = path.join(relative, entry.name);
      if (entry.isDirectory()) yield* walk(name);
      if (entry.isFile() && video.test(name)) yield name;
    }
  }

  return {
    checkRoots,
    walk,
    async listOutput() {
      await checkRoots();
      const files = [];
      for await (const relative of walk()) {
        const source = await inspect(output, relative).catch(() => null);
        if (source) files.push({ relative, ...source });
      }
      return files;
    },
    inspectOutput: (relative) => inspect(output, relative),
    inspectLibrary,
    async remove(relative, expected, destination) {
      if (!video.test(relative) || !destination) return false;
      const target = await inspectLibrary(destination.relative, destination.manager);
      const source = await inspect(output, relative);
      if (source.identity !== expected || target.identity !== destination.identity ||
          source.size !== target.size || source.identity === target.identity) return false;
      await unlink(path.join(output, relative));
      return true;
    },
  };
}
