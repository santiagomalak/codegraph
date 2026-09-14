/**
 * snapshots.ts — Snapshots históricos: re-analiza el proyecto en varios commits
 * para obtener métricas REALES de cada época (no las de hoy).
 */

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { analyzeProject } from '../analyze.js';
import { discoverFiles } from './discover-files.js';
import { readProjectConfig } from './project-config.js';
import { runGit } from './git-history.js';
import { nodeWasmDir } from './index.js';
import type {
  SnapshotPoint,
  SnapshotSeries,
  ProjectAnalysis,
} from '../model.js';

export interface SnapshotOptions {
  count?: number;
  onProgress?: (done: number, total: number, sha: string) => void;
}

const US_SNAP = '\x1f';

/** De una lista ordenada, elige `n` elementos repartidos parejo (incluye extremos). */
export function pickEvenly<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  const out: T[] = [];
  const last = items.length - 1;
  let prevIndex = -1;
  for (let i = 0; i < n; i++) {
    const idx = Math.round((i * last) / (n - 1));
    if (idx !== prevIndex) {
      out.push(items[idx]!);
      prevIndex = idx;
    }
  }
  return out;
}

export function toSnapshotPoint(
  commit: { sha: string; date: string; subject: string },
  a: ProjectAnalysis,
): SnapshotPoint {
  const s = a.summary;
  return {
    sha: commit.sha.slice(0, 10),
    date: commit.date,
    subject: commit.subject.slice(0, 80),
    files: s.totalFiles,
    loc: s.totalLoc,
    symbols: s.totalSymbols,
    avgComplexity: s.avgComplexity,
    health: s.health.score,
    grade: s.health.grade,
    issues: s.totalIssues,
    circularDeps: s.circularDeps,
    domains: a.graph.domains
      .map((d) => ({ label: d.label, files: d.files.length }))
      .sort((x, y) => y.files - x.files)
      .slice(0, 8),
  };
}

/**
 * Re-analiza el proyecto en varios puntos de su historia y devuelve las métricas
 * REALES de cada época (no las de hoy, como el `GitTimeline`).
 *
 * Cómo: `git log` para listar los commits de la rama, elige ~`count` repartidos,
 * y por cada uno hace `git worktree add` en una carpeta temporal, lo analiza y
 * borra el worktree. Es **lento** (N análisis completos), por eso es opt-in.
 *
 * Devuelve `null` si la carpeta no es un repo git o tiene menos de 2 commits.
 */
export async function buildSnapshots(
  rootDir: string,
  options: SnapshotOptions = {},
): Promise<SnapshotSeries | null> {
  const count = Math.max(2, Math.min(60, options.count ?? 20));

  const headSha = (await runGit(rootDir, ['rev-parse', 'HEAD']))?.trim();
  if (!headSha) return null;

  const log = await runGit(rootDir, [
    'log',
    '--first-parent',
    '--reverse',
    `--format=%H${US_SNAP}%aI${US_SNAP}%s`,
  ]);
  if (!log) return null;

  const commits = log
    .trim()
    .split('\n')
    .map((line) => {
      const [sha, date, subject] = line.split(US_SNAP);
      return { sha: sha ?? '', date: date ?? '', subject: subject ?? '' };
    })
    .filter((c) => c.sha);
  if (commits.length < 2) return null;

  const picked = pickEvenly(commits, count);

  await runGit(rootDir, ['worktree', 'prune']);

  const points: SnapshotPoint[] = [];
  const base = join(tmpdir(), `codegraph-snap-${process.pid}`);

  for (let i = 0; i < picked.length; i++) {
    const commit = picked[i]!;
    options.onProgress?.(i, picked.length, commit.sha.slice(0, 7));

    const wt = `${base}-${i}`;
    const added = await runGit(rootDir, ['worktree', 'add', '--detach', '--force', wt, commit.sha]);
    if (added === null) continue;

    try {
      const { files } = await discoverFiles(wt);
      if (files.length > 0) {
        const resolve = await readProjectConfig(wt);
        const analysis = await analyzeProject(files, {
          projectName: 'snapshot',
          wasmDir: nodeWasmDir(),
          resolve,
        });
        points.push(toSnapshotPoint(commit, analysis));
      }
    } catch {
      /* un commit que no parsea limpio: lo saltamos */
    } finally {
      await runGit(rootDir, ['worktree', 'remove', '--force', wt]);
      await rm(wt, { recursive: true, force: true }).catch(() => {});
    }
  }

  options.onProgress?.(picked.length, picked.length, 'listo');
  await runGit(rootDir, ['worktree', 'prune']);

  if (points.length < 2) return null;
  return { headSha, generatedAt: new Date().toISOString(), points };
}