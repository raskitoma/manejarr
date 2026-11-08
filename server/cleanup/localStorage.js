import { lstat, readdir, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';

const video = /\.(mkv|mp4|m4v|avi|mov|webm|mpg|mpeg|ts|m2ts|wmv)$/i;

export function relativeTo(root, target) {
  const relative = path.relative(root, target);
  if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) return null;
  return relative;
}

export function createLocalStorage(output, library) {
  async function inspect(root, relative) {
    if (!relative || path.isAbsolute(relative)) throw new Error('Invalid file path');
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
    inspectOutput: (relative) => inspect(output, relative),
    inspectLibrary: (relative) => inspect(library, relative),
    async remove(relative, expected) {
      if ((await inspect(output, relative)).identity !== expected) return false;
      await unlink(path.join(output, relative));
      return true;
    },
  };
}
