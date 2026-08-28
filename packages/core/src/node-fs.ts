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
import { dirname, join, relative, sep } from 'node:path';
import { EXTENSION_LANGUAGE, IGNORE_DIRS } from './languages.js';
import type { GitStats, GitTimeline, ResolverConfig, WorkspacePackage } from './model.js';

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

/** Cantidad de tramos del timeline. */
const TIMELINE_BUCKETS = 48;

export interface GitHistoryResult {
  stats: Record<string, GitStats>;
  timeline: GitTimeline | null;
}

/**
 * Lee el historial de git: estadísticas por archivo (churn, autores, fechas) y
 * los datos del timeline (actividad por tramo). Si no es un repo git → todo vacío.
 */
export async function readGitHistory(
  rootDir: string,
  knownPaths?: Iterable<string>,
): Promise<GitHistoryResult> {
  const filter = knownPaths ? new Set(knownPaths) : null;

  // git muestra los paths relativos a la RAÍZ del repo. Si `rootDir` es una
  // subcarpeta, hay que sacarle ese prefijo a cada path.
  const prefixRaw = await runGit(rootDir, ['rev-parse', '--show-prefix']);
  if (prefixRaw === null) return { stats: {}, timeline: null };
  const prefix = prefixRaw.trim();

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
  if (!raw) return { stats: {}, timeline: null };

  interface Acc {
    commits: number;
    authors: Set<string>;
    linesChanged: number;
    firstCommit: string;
    lastCommit: string;
  }
  const acc = new Map<string, Acc>();
  const commitTimes: number[] = []; // uno por commit
  const fileTimes = new Map<string, number[]>(); // path → timestamps que lo tocaron

  let author = '';
  let date = '';
  let ts = 0;

  for (const line of raw.split('\n')) {
    if (line.startsWith(RS)) {
      const parts = line.slice(1).split(US);
      author = parts[1] ?? '';
      date = parts[2] ?? '';
      ts = Date.parse(date) || 0;
      if (ts) commitTimes.push(ts);
      continue;
    }
    if (!line || !ts) continue;

    const tab1 = line.indexOf('\t');
    const tab2 = line.indexOf('\t', tab1 + 1);
    if (tab1 < 0 || tab2 < 0) continue;
    const added = Number(line.slice(0, tab1)) || 0;
    const removed = Number(line.slice(tab1 + 1, tab2)) || 0;
    const repoPath = line.slice(tab2 + 1).trim();
    if (!repoPath) continue;
    if (prefix && !repoPath.startsWith(prefix)) continue;
    const path = prefix ? repoPath.slice(prefix.length) : repoPath;
    if (filter && !filter.has(path)) continue;

    let entry = acc.get(path);
    if (!entry) {
      entry = { commits: 0, authors: new Set(), linesChanged: 0, firstCommit: date, lastCommit: date };
      acc.set(path, entry);
    }
    entry.commits++;
    entry.authors.add(author);
    entry.linesChanged += added + removed;
    if (date < entry.firstCommit) entry.firstCommit = date;
    if (date > entry.lastCommit) entry.lastCommit = date;

    let times = fileTimes.get(path);
    if (!times) fileTimes.set(path, (times = []));
    times.push(ts);
  }

  const stats: Record<string, GitStats> = {};
  for (const [path, e] of acc) {
    stats[path] = {
      commits: e.commits,
      authors: e.authors.size,
      linesChanged: e.linesChanged,
      firstCommit: e.firstCommit,
      lastCommit: e.lastCommit,
    };
  }

  return { stats, timeline: buildTimeline(commitTimes, fileTimes) };
}

/** Divide la historia en `TIMELINE_BUCKETS` tramos iguales por fecha. */
function buildTimeline(
  commitTimes: number[],
  fileTimes: Map<string, number[]>,
): GitTimeline | null {
  if (commitTimes.length === 0) return null;

  const from = Math.min(...commitTimes);
  let to = Math.max(...commitTimes);
  if (to <= from) to = from + 86_400_000; // un día de margen si hay un solo commit

  const span = to - from;
  const bucketOf = (t: number) =>
    Math.max(0, Math.min(TIMELINE_BUCKETS - 1, Math.floor(((t - from) / span) * TIMELINE_BUCKETS)));

  const commitsPerBucket = new Array<number>(TIMELINE_BUCKETS).fill(0);
  for (const t of commitTimes) {
    const b = bucketOf(t);
    commitsPerBucket[b] = (commitsPerBucket[b] ?? 0) + 1;
  }

  const fileFirstBucket: Record<string, number> = {};
  const fileActivity: Record<string, number[]> = {};
  for (const [path, times] of fileTimes) {
    const activity = new Array<number>(TIMELINE_BUCKETS).fill(0);
    let first = TIMELINE_BUCKETS - 1;
    for (const t of times) {
      const b = bucketOf(t);
      activity[b] = (activity[b] ?? 0) + 1;
      if (b < first) first = b;
    }
    fileFirstBucket[path] = first;
    fileActivity[path] = activity;
  }

  return {
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    buckets: TIMELINE_BUCKETS,
    commitsPerBucket,
    fileFirstBucket,
    fileActivity,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// CONFIG DEL PROYECTO (para resolver imports que no son rutas relativas)
// ────────────────────────────────────────────────────────────────────────────

/** JSON tolerante: saca comentarios `//` y de bloque, y comas colgantes. */
function parseJsonc<T = unknown>(text: string): T | null {
  const noComments = text
    // Preserva strings (primera alternativa); borra los dos tipos de comentario.
    .replace(/"(?:\\.|[^"\\])*"|\/\/.*$|\/\*[\s\S]*?\*\//gm, (m) => (m[0] === '"' ? m : ''))
    .replace(/,(\s*[}\]])/g, '$1');
  try {
    return JSON.parse(noComments) as T;
  } catch {
    return null;
  }
}

async function readJsonc<T = unknown>(file: string): Promise<T | null> {
  try {
    return parseJsonc<T>(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

interface TsConfig {
  extends?: string;
  compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> };
}

/**
 * Junta `compilerOptions.baseUrl` y `.paths` de un tsconfig/jsconfig, siguiendo
 * la cadena de `extends` (hasta 4 niveles, para no colgarse con ciclos raros).
 */
async function readTsConfigChain(file: string, depth = 0): Promise<TsConfig['compilerOptions']> {
  if (depth > 4) return {};
  const cfg = await readJsonc<TsConfig>(file);
  if (!cfg) return {};

  let inherited: TsConfig['compilerOptions'] = {};
  if (cfg.extends) {
    const ext = cfg.extends.startsWith('.')
      ? join(dirname(file), cfg.extends)
      : null; // "extends" de un paquete npm: no lo seguimos
    if (ext) {
      inherited = await readTsConfigChain(ext.endsWith('.json') ? ext : ext + '.json', depth + 1);
    }
  }
  return { ...inherited, ...cfg.compilerOptions };
}

interface PackageJson {
  name?: string;
  main?: string;
  module?: string;
  exports?: unknown;
  workspaces?: string[] | { packages?: string[] };
}

/** Resuelve una entrada de `exports` (string o `{import,default,...}`) a un path. */
function pickExport(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return pickExport(o['import'] ?? o['module'] ?? o['default'] ?? o['require'] ?? o['types']);
  }
  return undefined;
}

/** Saca el archivo de entrada de un package.json (`exports["."]` → `module` → `main`). */
function entryOf(pkg: PackageJson): string | undefined {
  const exp = pkg.exports;
  if (exp && typeof exp === 'object') {
    const dot = (exp as Record<string, unknown>)['.'] ?? exp;
    const e = pickExport(dot);
    if (e) return e;
  }
  return pkg.module ?? pkg.main;
}

/** Subpaths de `exports` (sin el "."): `{ "node": "dist/node-fs.js" }`. */
function subExportsOf(pkg: PackageJson): Record<string, string> | undefined {
  const exp = pkg.exports;
  if (!exp || typeof exp !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(exp as Record<string, unknown>)) {
    if (!key.startsWith('./') || key === '.') continue;
    const target = pickExport(val);
    if (target) out[key.slice(2)] = target.replace(/^\.\//, '');
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Lee la config del proyecto que hace falta para resolver imports "sin punto":
 * los alias de tsconfig y los paquetes de un monorepo (npm workspaces).
 *
 * Si no hay tsconfig ni workspaces, devuelve `{}` y todo sigue igual.
 */
export async function readProjectConfig(rootDir: string): Promise<ResolverConfig> {
  const config: ResolverConfig = {};

  // ── tsconfig / jsconfig (alias + baseUrl) ──────────────────────────────
  for (const name of ['tsconfig.json', 'jsconfig.json']) {
    const co = await readTsConfigChain(join(rootDir, name));
    if (co && (co.baseUrl || co.paths)) {
      if (co.baseUrl) config.baseUrl = toPosix(co.baseUrl).replace(/^\.\//, '').replace(/\/$/, '');
      if (co.paths) config.paths = co.paths;
      break;
    }
  }

  // ── npm workspaces (paquetes del monorepo) ─────────────────────────────
  const rootPkg = await readJsonc<PackageJson>(join(rootDir, 'package.json'));
  const wsField = rootPkg?.workspaces;
  const globs = Array.isArray(wsField) ? wsField : (wsField?.packages ?? []);
  if (globs.length) {
    const workspaces: Record<string, WorkspacePackage> = {};
    for (const glob of globs) {
      // Solo soportamos "carpeta/*" y "carpeta" (los globs más comunes).
      const dirs = glob.endsWith('/*')
        ? await subdirs(join(rootDir, glob.slice(0, -2)))
        : [join(rootDir, glob)];
      for (const abs of dirs) {
        const pkg = await readJsonc<PackageJson>(join(abs, 'package.json'));
        if (!pkg?.name) continue;
        const dir = toPosix(relative(rootDir, abs));
        const rawEntry = entryOf(pkg);
        const entry = rawEntry
          ? toPosix(join(dir, rawEntry.replace(/^\.\//, '')))
          : undefined;
        const exports = subExportsOf(pkg);
        workspaces[pkg.name] = {
          dir,
          ...(entry ? { entry } : {}),
          ...(exports ? { exports } : {}),
        };
      }
    }
    if (Object.keys(workspaces).length) config.workspaces = workspaces;
  }

  return config;
}

/** Lista las subcarpetas directas de `dir` (para expandir globs "x/*"). */
async function subdirs(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => join(dir, e.name));
  } catch {
    return [];
  }
}
