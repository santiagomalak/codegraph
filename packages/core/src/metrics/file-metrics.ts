/**
 * file-metrics.ts — Métricas básicas de un archivo a partir del texto.
 *
 * loc      = líneas totales
 * comments = líneas que son comentario
 * sloc     = loc - comments - blancos  (líneas de código "reales")
 *
 * La complejidad ciclomática se calcula aparte, desde el AST (ver ast-utils.ts),
 * y se pasa acá ya calculada.
 */

import type { FileMetrics, LanguageId } from '../model.js';

function countComments(lines: string[], language: LanguageId): number {
  let count = 0;
  let inBlock = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (language === 'python') {
      // Bloques con """ o ''' (aproximado: cuenta como comentario/doc).
      const triples = (line.match(/"""|'''/g) ?? []).length;
      if (inBlock) {
        count++;
        if (triples % 2 === 1) inBlock = false;
        continue;
      }
      if (triples % 2 === 1) {
        inBlock = true;
        count++;
        continue;
      }
      if (line.startsWith('#')) count++;
      continue;
    }
    // Lenguajes estilo C (js/ts/css)
    if (inBlock) {
      count++;
      if (line.includes('*/')) inBlock = false;
      continue;
    }
    if (line.startsWith('/*')) {
      count++;
      if (!line.includes('*/')) inBlock = true;
      continue;
    }
    if (line.startsWith('//') || line.startsWith('*')) count++;
  }
  return count;
}

export function computeFileMetrics(
  content: string,
  language: LanguageId,
  complexity: number,
  docCoverage: number,
): FileMetrics {
  const lines = content.split('\n');
  const loc = lines.length;
  const comments = countComments(lines, language);
  const blank = lines.filter((l) => l.trim() === '').length;
  const sloc = Math.max(0, loc - comments - blank);
  return { loc, sloc, comments, complexity, docCoverage };
}
