/**
 * @codegraph/core — API pública del motor de análisis.
 *
 * Uso típico:
 *
 *   import { analyzeProject } from '@codegraph/core';
 *
 *   const analysis = await analyzeProject([
 *     { path: 'src/app.ts', content: '...' },
 *     { path: 'src/utils.ts', content: '...' },
 *   ], { projectName: 'mi-app' });
 *
 *   analysis.graph.nodes  // nodos del grafo
 *   analysis.summary      // resumen + health score
 *
 * El core NO toca el disco ni la red: recibe archivos ya leídos y devuelve datos.
 * Quien lee los archivos es el CLI (Node) o la web (navegador).
 */

export { analyzeProject } from './analyze.js';
export { toCodemapMarkdown } from './exporters/codemap.js';
export type { CodemapDetail, CodemapOptions } from './exporters/codemap.js';
export { toGraphJson } from './exporters/graph-json.js';
export * from './queries.js';

// Piezas reutilizables (por si un consumidor quiere usarlas sueltas)
export { parseFile } from './parsing/index.js';
export { buildGraph } from './graph/build-graph.js';
export { buildSummary } from './metrics/summary.js';
export { detectDomains } from './graph/domains.js';
export { detectCycles } from './graph/cycles.js';
export { ImportResolver } from './graph/resolve-imports.js';
export {
  languageOf,
  isIgnored,
  LANGUAGE_COLOR,
  EXTENSION_LANGUAGE,
  IGNORE_DIRS,
  IGNORE_FILES,
} from './languages.js';

// Todos los tipos del dominio
export type * from './model.js';
