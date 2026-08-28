/**
 * types.ts — Tipo interno compartido por los parsers de cada lenguaje.
 *
 * Los parsers (parse-python.ts, parse-javascript.ts) devuelven este `ParseStructure`.
 * El dispatcher (index.ts) le agrega métricas de texto e issues para armar el
 * `ParsedFile` final que ve el resto de la app.
 */

import type { ImportRef, SymbolDef } from '../model.js';

export interface ParseStructure {
  imports: ImportRef[];
  exports: string[];
  symbols: SymbolDef[];
  /** Complejidad ciclomática del archivo entero (desde el AST). */
  complexity: number;
  /** % de símbolos documentados (0..100). */
  documentedRatio: number;
}
