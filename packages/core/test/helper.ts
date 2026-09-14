/**
 * helper.ts — Utilidades compartidas por los tests.
 *
 * `analyzeProject` necesita `wasmDir` (la carpeta con los `.wasm` de tree-sitter).
 * En los tests corremos en Node, así que lo tomamos de `nodeWasmDir()` y lo
 * inyectamos automáticamente: los tests llaman `analyzeProject(sources, { ... })`
 * sin preocuparse por eso.
 */

import { analyzeProject as realAnalyzeProject } from '../src/analyze.js';
import { nodeWasmDir } from '../src/node/index.js';
import type { AnalyzeOptions, ProjectAnalysis, SourceFile } from '../src/model.js';

export const WASM_DIR = nodeWasmDir();

export function analyzeProject(
  sources: SourceFile[],
  options: Omit<AnalyzeOptions, 'wasmDir'> & { wasmDir?: string } = {},
): Promise<ProjectAnalysis> {
  return realAnalyzeProject(sources, { wasmDir: WASM_DIR, ...options });
}
