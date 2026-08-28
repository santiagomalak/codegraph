/**
 * parser-registry.ts — Carga y cachea los parsers tree-sitter.
 *
 * tree-sitter viene compilado a WebAssembly. Cada lenguaje es un `.wasm` aparte.
 * Cargar un `.wasm` es asíncrono y algo lento, así que:
 *   1. Inicializamos tree-sitter una sola vez.
 *   2. Cargamos cada gramática la primera vez que se pide y la guardamos.
 *
 * En Node encontramos los `.wasm` dentro de `node_modules/tree-sitter-wasms`.
 * En el navegador hay que servir esos archivos y pasar `wasmDir` (ej: "/wasm").
 */

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import Parser from 'web-tree-sitter';
import type { LanguageId } from '../model.js';

/** Nombre del archivo `.wasm` por lenguaje (dentro de tree-sitter-wasms/out). */
const GRAMMAR_FILE: Partial<Record<LanguageId, string>> = {
  python: 'tree-sitter-python.wasm',
  javascript: 'tree-sitter-javascript.wasm',
  jsx: 'tree-sitter-javascript.wasm', // el grammar de JS ya soporta JSX
  typescript: 'tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-tsx.wasm',
  go: 'tree-sitter-go.wasm',
  rust: 'tree-sitter-rust.wasm',
  java: 'tree-sitter-java.wasm',
};

export type SyntaxNode = Parser.SyntaxNode;
export type TSLanguage = Parser.Language;

export interface LoadedParser {
  parser: Parser;
  language: TSLanguage;
}

let initPromise: Promise<void> | null = null;
const cache = new Map<LanguageId, Promise<LoadedParser>>();

/** Detecta la carpeta de `.wasm` en Node (o usa la que nos pasen). */
function resolveWasmDir(explicit?: string): string {
  if (explicit) return explicit;
  const require = createRequire(import.meta.url);
  const pkg = require.resolve('tree-sitter-wasms/package.json');
  return join(dirname(pkg), 'out');
}

async function ensureInit(): Promise<void> {
  if (!initPromise) initPromise = Parser.init();
  return initPromise;
}

/**
 * Devuelve un parser listo para el lenguaje pedido (cacheado).
 * Lanza si el lenguaje no tiene gramática.
 */
export async function getParser(lang: LanguageId, wasmDir?: string): Promise<LoadedParser> {
  const file = GRAMMAR_FILE[lang];
  if (!file) throw new Error(`No hay gramática tree-sitter para "${lang}"`);

  let pending = cache.get(lang);
  if (!pending) {
    pending = (async () => {
      await ensureInit();
      const language = await Parser.Language.load(join(resolveWasmDir(wasmDir), file));
      const parser = new Parser();
      parser.setLanguage(language);
      return { parser, language };
    })();
    cache.set(lang, pending);
  }
  return pending;
}

/** Punto de una posición 0-based de tree-sitter → línea 1-based para humanos. */
export function lineOf(node: SyntaxNode): number {
  return node.startPosition.row + 1;
}

export function endLineOf(node: SyntaxNode): number {
  return node.endPosition.row + 1;
}
