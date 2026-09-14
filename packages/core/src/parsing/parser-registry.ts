/**
 * parser-registry.ts — Carga y cachea los parsers tree-sitter.
 *
 * tree-sitter viene compilado a WebAssembly. Cada lenguaje es un `.wasm` aparte.
 * Cargar un `.wasm` es asíncrono y algo lento, así que:
 *   1. Inicializamos tree-sitter una sola vez.
 *   2. Cargamos cada gramática la primera vez que se pide y la guardamos.
 *
 * Este archivo NO importa `node:*` a propósito: corre igual en Node y en el
 * navegador. Por eso `wasmDir` (la carpeta con los `.wasm`) es obligatoria y la
 * pone quien llama:
 *   - En Node: `nodeWasmDir()` de `@codegraph/core/node`.
 *   - En el navegador: una URL servida por la web (ej: "/wasm").
 */

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

/** Une carpeta + archivo con "/" (sin `node:path`, sirve para rutas y URLs). */
function joinUrl(dir: string, file: string): string {
  return `${dir.replace(/\/+$/, '')}/${file}`;
}

/** En el navegador hay `document`; en Node no. */
const IS_BROWSER = typeof (globalThis as { document?: unknown }).document !== 'undefined';

function ensureInit(wasmDir: string): Promise<void> {
  if (!initPromise) {
    // En el navegador le decimos a web-tree-sitter dónde está su runtime
    // (`tree-sitter.wasm`): en `wasmDir`, junto a las gramáticas. En Node lo
    // resuelve solo desde node_modules, así que no tocamos nada.
    initPromise = Parser.init(
      IS_BROWSER ? { locateFile: (name: string) => joinUrl(wasmDir, name) } : undefined,
    );
  }
  return initPromise;
}

/**
 * Devuelve un parser listo para el lenguaje pedido (cacheado).
 * Lanza si el lenguaje no tiene gramática.
 */
export async function getParser(lang: LanguageId, wasmDir: string): Promise<LoadedParser> {
  const file = GRAMMAR_FILE[lang];
  if (!file) throw new Error(`No hay gramática tree-sitter para "${lang}"`);

  let pending = cache.get(lang);
  if (!pending) {
    pending = (async () => {
      await ensureInit(wasmDir);
      const language = await Parser.Language.load(joinUrl(wasmDir, file));
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
