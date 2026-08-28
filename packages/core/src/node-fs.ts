/**
 * node-fs.ts — Utilidades que SÍ tocan el disco (solo Node).
 *
 * Está fuera de `index.ts` a propósito: el resto del core no importa `node:*`
 * para poder correr también en el navegador. Los consumidores de Node hacen:
 *
 *   import { discoverFiles } from '@codegraph/core/node';
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { EXTENSION_LANGUAGE, IGNORE_DIRS } from './languages.js';

const MAX_FILE_BYTES = 1_500_000;
const KNOWN_EXTENSIONS = new Set(Object.keys(EXTENSION_LANGUAGE));

function toPosix(p: string): string {
  return p.split(sep).join('/');
}

function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
}

export interface DiscoverResult {
  files: Array<{ path: string; content: string }>;
  /** Archivos salteados por tamaño. */
  skippedLarge: string[];
}

/**
 * Recorre `rootDir` y devuelve los archivos de código (rutas relativas, POSIX).
 * Se saltea carpetas ignoradas, dotfiles y archivos enormes.
 */
export async function discoverFiles(rootDir: string): Promise<DiscoverResult> {
  const files: DiscoverResult['files'] = [];
  const skippedLarge: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        await walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!KNOWN_EXTENSIONS.has(extOf(entry.name))) continue;

      const rel = toPosix(relative(rootDir, full));
      try {
        const info = await stat(full);
        if (info.size > MAX_FILE_BYTES) {
          skippedLarge.push(rel);
          continue;
        }
        files.push({ path: rel, content: await readFile(full, 'utf8') });
      } catch {
        /* ilegible: saltar */
      }
    }
  }

  await walk(rootDir);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files, skippedLarge };
}
