/**
 * analyze.ts — El orquestador. Es la función principal del motor.
 *
 *   analyzeProject(sources)  →  ProjectAnalysis
 *
 * Pasos:
 *   1. filtra archivos ignorados y sin lenguaje conocido
 *   2. parsea cada archivo (imports, símbolos, métricas, issues)
 *   3. construye el grafo de conocimiento
 *   4. calcula el resumen + health score
 */

import type {
  AnalyzeOptions,
  ParsedFile,
  ProjectAnalysis,
  SourceFile,
} from './model.js';
import { isIgnored, languageOf } from './languages.js';
import { parseFile } from './parsing/index.js';
import { buildGraph } from './graph/build-graph.js';
import { buildSummary } from './metrics/summary.js';
import { applyGitToGraph, attachGitStats } from './git.js';

/** Pasa todos los separadores a "/" y saca "./" del principio. */
function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

export async function analyzeProject(
  sources: SourceFile[],
  options: AnalyzeOptions = {},
): Promise<ProjectAnalysis> {
  const start = Date.now();

  const usable = sources
    .map((s) => ({ path: normalizePath(s.path), content: s.content }))
    .filter((s) => !isIgnored(s.path) && languageOf(s.path) !== 'unknown');

  const projectName = options.projectName ?? 'proyecto';

  const files: ParsedFile[] = [];
  let done = 0;
  for (const src of usable) {
    files.push(await parseFile(src, options.wasmDir));
    done++;
    options.onProgress?.(done, usable.length, src.path);
  }
  files.sort((a, b) => a.path.localeCompare(b.path));

  if (options.git) attachGitStats(files, options.git);

  const graph = buildGraph(files, options.resolve);
  if (options.git) applyGitToGraph(graph, files);

  const summary = buildSummary(files, graph, projectName);

  return {
    projectName,
    analyzedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    files,
    graph,
    summary,
    ...(options.timeline ? { timeline: options.timeline } : {}),
  };
}
