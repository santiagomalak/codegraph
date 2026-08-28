/**
 * node-fs.ts — Utilidades que SÍ tocan el disco (solo Node).
 *
 * Está fuera de `index.ts` a propósito: el resto del core no importa `node:*`
 * para poder correr también en el navegador. Los consumidores de Node hacen:
 *
 *   import { discoverFiles } from '@codegraph/core/node';
 */

import { spawn } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { EXTENSION_LANGUAGE, IGNORE_DIRS } from './languages.js';
import type { GitStats } from './model.js';

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

// ────────────────────────────────────────────────────────────────────────────
// HISTORIAL DE GIT
// ────────────────────────────────────────────────────────────────────────────

/** Cuántos commits hacia atrás mirar (repos viejos y grandes se cortan acá). */
const MAX_COMMITS = 8000;

/**
 * Lee el historial de git y devuelve, por archivo, cuántas veces cambió, cuántos
 * autores lo tocaron, cuántas líneas se movieron y las fechas del primer/último
 * commit.
 *
 * Si la carpeta no es un repo git (o `git` no está), devuelve `{}` sin tirar.
 * `knownPaths`: si se pasa, solo devuelve datos de esos archivos.
 */
function runGit(rootDir: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn('git', ['-C', rootDir, ...args], { windowsHide: true });
    let out = '';
    let failed = false;
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (c) => (out += c));
    proc.on('error', () => {
      failed = true;
      resolve(null);
    });
    proc.on('close', (code) => {
      if (!failed) resolve(code === 0 ? out : null);
    });
  });
}

export async function readGitHistory(
  rootDir: string,
  knownPaths?: Iterable<string>,
): Promise<Record<string, GitStats>> {
  const filter = knownPaths ? new Set(knownPaths) : null;

  // git muestra los paths relativos a la RAÍZ del repo. Si `rootDir` es una
  // subcarpeta, hay que sacarle ese prefijo a cada path.
  const prefixRaw = await runGit(rootDir, ['rev-parse', '--show-prefix']);
  if (prefixRaw === null) return {}; // no es un repo git
  const prefix = prefixRaw.trim(); // "" si rootDir es la raíz, "packages/" si es subcarpeta

  const RS = '\x1e';
  const US = '\x1f';
  const raw = await runGit(rootDir, [
    'log',
    '--numstat',
    '--no-renames',
    '--no-merges',
    `-n${MAX_COMMITS}`,
    `--format=${RS}%H${US}%an${US}%aI`,
  ]);
  if (!raw) return {};

  interface Acc {
    commits: number;
    authors: Set<string>;
    linesChanged: number;
    firstCommit: string;
    lastCommit: string;
  }
  const acc = new Map<string, Acc>();
  let author = '';
  let date = '';

  for (const line of raw.split('\n')) {
    if (line.startsWith(RS)) {
      const parts = line.slice(1).split(US);
      author = parts[1] ?? '';
      date = parts[2] ?? '';
      continue;
    }
    if (!line || !date) continue;

    // numstat: "<added>\t<removed>\t<path>"  (added/removed pueden ser "-")
    const tab1 = line.indexOf('\t');
    const tab2 = line.indexOf('\t', tab1 + 1);
    if (tab1 < 0 || tab2 < 0) continue;
    const added = Number(line.slice(0, tab1)) || 0;
    const removed = Number(line.slice(tab1 + 1, tab2)) || 0;
    const repoPath = line.slice(tab2 + 1).trim();
    if (!repoPath) continue;
    // Path relativo a rootDir (sacando el prefijo de la subcarpeta).
    if (prefix && !repoPath.startsWith(prefix)) continue;
    const path = prefix ? repoPath.slice(prefix.length) : repoPath;
    if (filter && !filter.has(path)) continue;

    let entry = acc.get(path);
    if (!entry) {
      // git log viene de más nuevo a más viejo → el primero que vemos es el último commit.
      entry = { commits: 0, authors: new Set(), linesChanged: 0, firstCommit: date, lastCommit: date };
      acc.set(path, entry);
    }
    entry.commits++;
    entry.authors.add(author);
    entry.linesChanged += added + removed;
    if (date < entry.firstCommit) entry.firstCommit = date;
    if (date > entry.lastCommit) entry.lastCommit = date;
  }

  const result: Record<string, GitStats> = {};
  for (const [path, e] of acc) {
    result[path] = {
      commits: e.commits,
      authors: e.authors.size,
      linesChanged: e.linesChanged,
      firstCommit: e.firstCommit,
      lastCommit: e.lastCommit,
    };
  }
  return result;
}
