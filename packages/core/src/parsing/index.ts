/**
 * parsing/index.ts — El "dispatcher" de parsing.
 *
 * Recibe un archivo crudo (SourceFile) y devuelve su ParsedFile:
 *   1. detecta el lenguaje por la extensión
 *   2. calcula métricas de texto e issues (siempre)
 *   3. si el lenguaje tiene parser AST, extrae imports/exports/símbolos
 *
 * Si el parser falla, devuelve el archivo igual con `parseError` seteado
 * (nunca tira: un archivo roto no debe voltear todo el análisis).
 */

import type { ParsedFile, SourceFile } from '../model.js';
import { languageOf, PARSEABLE } from '../languages.js';
import { computeFileMetrics } from '../metrics/file-metrics.js';
import { detectIssues } from './rules.js';
import { getParser } from './parser-registry.js';
import { parsePython } from './parse-python.js';
import { parseJavaScript } from './parse-javascript.js';
import { parseGeneric } from './parse-generic.js';
import { LANGUAGE_SPECS } from './language-specs.js';

/** Más grande que esto no se parsea con AST (protege memoria/tiempo). */
const MAX_PARSE_BYTES = 1_500_000;

export async function parseFile(file: SourceFile, wasmDir?: string): Promise<ParsedFile> {
  const language = languageOf(file.path);

  const base: ParsedFile = {
    path: file.path,
    language,
    metrics: computeFileMetrics(file.content, language, 1, 100),
    imports: [],
    exports: [],
    symbols: [],
    issues: detectIssues(language, file.content),
  };

  if (!PARSEABLE.has(language)) return base;
  if (file.content.length > MAX_PARSE_BYTES) {
    return { ...base, parseError: 'archivo demasiado grande para parsear con AST' };
  }

  try {
    const { parser } = await getParser(language, wasmDir);
    const tree = parser.parse(file.content);
    const spec = LANGUAGE_SPECS[language];
    const struct = spec
      ? parseGeneric(tree.rootNode, file.path, spec)
      : language === 'python'
        ? parsePython(tree.rootNode, file.path)
        : parseJavaScript(tree.rootNode, file.path);

    return {
      ...base,
      imports: struct.imports,
      exports: struct.exports,
      symbols: struct.symbols,
      metrics: computeFileMetrics(file.content, language, struct.complexity, struct.documentedRatio),
    };
  } catch (err) {
    return { ...base, parseError: (err as Error).message };
  }
}

export { getParser } from './parser-registry.js';
