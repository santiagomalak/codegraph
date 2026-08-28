/**
 * analysis.ts — Corre el motor de Code Graph sobre la carpeta abierta.
 *
 * Es una envoltura fina sobre `@codegraph/core`: descubre archivos, lee el
 * historial de git y la config, y analiza. Debounce para no re-analizar en cada
 * tecla.
 */

import { join } from 'node:path';
import type { ProjectAnalysis } from '@codegraph/core';
import { analyzeProject } from '@codegraph/core';
import {
  buildSnapshots,
  discoverFiles,
  readGitHistory,
  readProjectConfig,
} from '@codegraph/core/node';

/** Carpeta con los `.wasm` de tree-sitter, dentro de la extensión (dist/wasm). */
export function wasmDir(extensionPath: string): string {
  return join(extensionPath, 'dist', 'wasm');
}

export interface AnalyzeResult {
  analysis: ProjectAnalysis;
  durationMs: number;
}

export async function analyzeWorkspace(
  rootDir: string,
  extensionPath: string,
): Promise<AnalyzeResult | null> {
  const started = Date.now();
  const { files } = await discoverFiles(rootDir);
  if (files.length === 0) return null;

  const [{ stats: git, timeline, coupling }, resolve] = await Promise.all([
    readGitHistory(
      rootDir,
      files.map((f) => f.path),
    ),
    readProjectConfig(rootDir),
  ]);

  const analysis = await analyzeProject(files, {
    projectName: rootDir.split(/[/\\]/).pop() ?? 'proyecto',
    wasmDir: wasmDir(extensionPath),
    git: Object.keys(git).length > 0 ? git : undefined,
    timeline: timeline ?? undefined,
    coupling,
    resolve,
  });

  return { analysis, durationMs: Date.now() - started };
}

export { buildSnapshots };

/** Debouncer simple: junta llamadas seguidas en una sola. */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): (...args: A) => void {
  let t: NodeJS.Timeout | undefined;
  return (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
