/**
 * git-history.ts — Lectura de historial de git: stats, timeline, coupling temporal.
 */

import { spawn } from 'node:child_process';
import { validateRootDir } from './discover-files.js';
import type {
  CouplingPair,
  GitStats,
  GitTimeline,
} from '../model.js';

/** Cuántos commits hacia atrás mirar (repos viejos y grandes se cortan acá). */
const MAX_COMMITS = 8000;

/** Ejecuta `git` en `rootDir` de forma segura. Valida `rootDir` antes de spawn. */
export function runGit(rootDir: string, args: string[]): Promise<string | null> {
  let safeRoot: string;
  try {
    safeRoot = validateRootDir(rootDir);
  } catch {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const proc = spawn('git', ['-C', safeRoot, ...args], { windowsHide: true });
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
export const TIMELINE_BUCKETS = 48;

/** Acoplamiento temporal: umbrales para no ahogarse en ruido. */
export const COUPLING = {
  maxCommitFiles: 25,
  minShared: 3,
  minCommits: 5,
  minScore: 0.4,
  top: 40,
} as const;

export interface GitHistoryResult {
  stats: Record<string, GitStats>;
  timeline: GitTimeline | null;
  coupling: CouplingPair[];
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
  if (prefixRaw === null) return { stats: {}, timeline: null, coupling: [] };
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
  if (!raw) return { stats: {}, timeline: null, coupling: [] };

  interface Acc {
    commits: number;
    authors: Set<string>;
    linesChanged: number;
    firstCommit: string;
    lastCommit: string;
  }
  const acc = new Map<string, Acc>();
  const commitTimes: number[] = [];
  const fileTimes = new Map<string, number[]>();

  let commitFiles: string[] = [];
  const coChange = new Map<string, number>();
  const bump = (): void => {
    if (commitFiles.length < 2 || commitFiles.length > COUPLING.maxCommitFiles) return;
    const sorted = [...new Set(commitFiles)].sort();
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const key = `${sorted[i]}${US}${sorted[j]}`;
        coChange.set(key, (coChange.get(key) ?? 0) + 1);
      }
    }
  };

  let author = '';
  let date = '';
  let ts = 0;

  for (const line of raw.split('\n')) {
    if (line.startsWith(RS)) {
      bump();
      commitFiles = [];
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

    commitFiles.push(path);
  }
  bump();

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

  return {
    stats,
    timeline: buildTimeline(commitTimes, fileTimes),
    coupling: buildCoupling(coChange, acc, US),
  };
}

export function buildCoupling(
  coChange: Map<string, number>,
  acc: Map<string, { commits: number }>,
  sep: string,
): CouplingPair[] {
  const pairs: CouplingPair[] = [];
  for (const [key, shared] of coChange) {
    if (shared < COUPLING.minShared) continue;
    const [a, b] = key.split(sep) as [string, string];
    const ca = acc.get(a)?.commits ?? 0;
    const cb = acc.get(b)?.commits ?? 0;
    if (ca < COUPLING.minCommits || cb < COUPLING.minCommits) continue;
    const coupling = shared / Math.min(ca, cb);
    if (coupling < COUPLING.minScore) continue;
    pairs.push({ a, b, shared, coupling: Math.round(coupling * 100) / 100 });
  }
  pairs.sort((x, y) => y.coupling - x.coupling || y.shared - x.shared);
  return pairs.slice(0, COUPLING.top);
}

export function buildTimeline(
  commitTimes: number[],
  fileTimes: Map<string, number[]>,
): GitTimeline | null {
  if (commitTimes.length === 0) return null;

  const from = Math.min(...commitTimes);
  let to = Math.max(...commitTimes);
  if (to <= from) to = from + 86_400_000;

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