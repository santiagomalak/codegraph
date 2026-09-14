/**
 * discover-files.ts — Descubrimiento de archivos de código en disco.
 * Protege contra path traversal via symlinks.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { statSync } from 'node:fs';
import { EXTENSION_LANGUAGE, IGNORE_DIRS } from '../languages.js';

export interface DiscoverResult {
  files: Array<{ path: string; content: string }>;
  skippedLarge: string[];
}

const MAX_FILE_BYTES = 1_500_000;
const KNOWN_EXTENSIONS = new Set(Object.keys(EXTENSION_LANGUAGE));

function toPosix(p: string): string {
  return p.split(sep).join('/');
}

function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/** Valida que `target` esté dentro de `root` (protege contra path traversal via symlinks). */
export function isWithinRoot(root: string, target: string): boolean {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(resolvedRoot + sep);
}

/** Valida y normaliza `rootDir`: debe existir, ser directorio y ser absoluto. */
export function validateRootDir(rootDir: string): string {
  const resolved = resolve(rootDir);
  try {
    const info = statSync(resolved);
    if (!info.isDirectory()) throw new Error('Not a directory');
  } catch {
    throw new Error(`Invalid rootDir: ${rootDir}`);
  }
  return resolved;
}

/**
 * Recorre `rootDir` y devuelve los archivos de código (rutas relativas, POSIX).
 * Se saltea carpetas ignoradas, dotfiles y archivos enormes.
 * Protege contra path traversal via symlinks.
 */
export async function discoverFiles(rootDir: string): Promise<DiscoverResult> {
  const safeRoot = validateRootDir(rootDir);
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

      // Path traversal protection: ensure the resolved path stays within root
      if (!isWithinRoot(safeRoot, full)) continue;

      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        await walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!KNOWN_EXTENSIONS.has(extOf(entry.name))) continue;

      const rel = toPosix(relative(safeRoot, full));
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

  await walk(safeRoot);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files, skippedLarge };
}

function join(...paths: string[]): string {
  return resolve(...paths).split(sep).join('/');
}

/**
 * Carpeta donde el paquete `tree-sitter-wasms` deja sus `.wasm` en Node.
 * Se la pasás a `analyzeProject({ wasmDir })`. En el navegador esto no aplica:
 * ahí `wasmDir` es una URL que sirve la web.
 */
export function nodeWasmDir(): string {
  const { createRequire } = require('node:module');
  const { dirname } = require('node:path');
  const requireFn = createRequire(import.meta.url);
  const pkg = requireFn.resolve('tree-sitter-wasms/package.json');
  return join(dirname(pkg), 'out');
}