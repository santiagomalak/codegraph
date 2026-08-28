/**
 * git.ts — Cruza los datos de git con el análisis.
 *
 * La idea del "hotspot": un archivo que es **complejo** Y que además **cambia
 * mucho** es donde suelen concentrarse los bugs y donde más rinde refactorizar.
 * (Concepto de Adam Tornhill / "Your Code as a Crime Scene".)
 *
 *   hotspot = media geométrica( norm(complejidad) , norm(churn) )
 *
 * Ambos normalizados a 0..1; el churn con escala logarítmica porque los commits
 * están muy sesgados (unos pocos archivos acaparan la mayoría).
 */

import type {
  CouplingPair,
  KnowledgeGraph,
  ParsedFile,
  ProjectSummary,
} from './model.js';

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function churnNorm(commits: number, maxCommits: number): number {
  if (maxCommits <= 1) return 0;
  return clamp01(Math.log1p(commits) / Math.log1p(maxCommits));
}

/** Pega `file.git` (desde el mapa de opciones) a cada ParsedFile. */
export function attachGitStats(
  files: ParsedFile[],
  gitByPath: Record<string, ParsedFile['git']>,
): void {
  for (const file of files) {
    const stats = gitByPath[file.path];
    if (stats) file.git = stats;
  }
}

/** Agrega `churn` y `hotspot` a los nodos de archivo del grafo. */
export function applyGitToGraph(graph: KnowledgeGraph, files: ParsedFile[]): void {
  const withGit = files.filter((f) => f.git);
  if (withGit.length === 0) return;

  const maxCommits = Math.max(...withGit.map((f) => f.git!.commits));
  const byPath = new Map(files.map((f) => [f.path, f]));

  for (const node of graph.nodes) {
    if (node.type !== 'file' || !node.path) continue;
    const file = byPath.get(node.path);
    if (!file?.git) continue;

    node.churn = file.git.commits;
    const cx = clamp01((node.complexity ?? 1) / 40);
    const ch = churnNorm(file.git.commits, maxCommits);
    node.hotspot = Math.round(Math.sqrt(cx * ch) * 100) / 100;
  }
}

/**
 * Agrega aristas `co-change` al grafo (acoplamiento temporal) y marca cuáles son
 * "ocultas" (los dos archivos NO se importan entre sí). Devuelve los pares
 * ocultos, ordenados, para el resumen.
 */
export function applyCouplingToGraph(
  graph: KnowledgeGraph,
  coupling: CouplingPair[],
): ProjectSummary['temporalCoupling'] {
  if (coupling.length === 0) return [];

  const fileIds = new Set(graph.nodes.filter((n) => n.type === 'file').map((n) => n.id));
  // Pares que ya están conectados por un import (en cualquier dirección).
  const imported = new Set<string>();
  for (const e of graph.edges) {
    if (e.type !== 'imports') continue;
    imported.add(e.source < e.target ? `${e.source}|${e.target}` : `${e.target}|${e.source}`);
  }

  const hidden: ProjectSummary['temporalCoupling'] = [];
  for (const pair of coupling) {
    if (!fileIds.has(pair.a) || !fileIds.has(pair.b)) continue;
    const isImported = imported.has(`${pair.a}|${pair.b}`);
    graph.edges.push({
      id: `co-change:${pair.a}↔${pair.b}`,
      source: pair.a,
      target: pair.b,
      type: 'co-change',
      weight: pair.coupling,
      hidden: !isImported,
    });
    if (!isImported) {
      hidden.push({ a: pair.a, b: pair.b, shared: pair.shared, coupling: pair.coupling });
    }
  }
  return hidden.slice(0, 15);
}

/** Top archivos hotspot para el resumen. */
export function computeHotspots(
  files: ParsedFile[],
  graph: KnowledgeGraph,
): ProjectSummary['hotspots'] {
  const hotspotByPath = new Map(
    graph.nodes.filter((n) => n.type === 'file').map((n) => [n.path, n.hotspot ?? 0]),
  );

  return files
    .filter((f) => f.git && (hotspotByPath.get(f.path) ?? 0) > 0.05)
    .map((f) => ({
      path: f.path,
      score: hotspotByPath.get(f.path) ?? 0,
      complexity: f.metrics.complexity,
      commits: f.git!.commits,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}
