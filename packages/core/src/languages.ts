/**
 * languages.ts — Qué archivos entiende el motor y cómo se ven.
 *
 * - EXTENSION_LANGUAGE: mapea ".ts" → "typescript", etc.
 * - LANGUAGE_COLOR: color de marca por lenguaje (para pintar los nodos).
 * - IGNORE_DIRS / IGNORE_FILES: qué se saltea siempre.
 * - PARSEABLE: lenguajes que tienen un parser AST de verdad (el resto entra como
 *   "archivo listado" pero sin símbolos ni imports).
 */

import type { LanguageId } from './model.js';

export const EXTENSION_LANGUAGE: Record<string, LanguageId> = {
  py: 'python',
  pyi: 'python',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  go: 'go',
  rs: 'rust',
  java: 'java',
  css: 'css',
  scss: 'css',
  json: 'json',
  md: 'markdown',
  mdx: 'markdown',
};

export const LANGUAGE_COLOR: Record<LanguageId, string> = {
  python: '#4b8bbe',
  javascript: '#f0db4f',
  typescript: '#3178c6',
  jsx: '#61dafb',
  tsx: '#61dafb',
  go: '#00add8',
  rust: '#dea584',
  java: '#e76f00',
  css: '#c65d97',
  json: '#8bc34a',
  markdown: '#8b91a8',
  unknown: '#6b7280',
};

/** Lenguajes con parser AST completo (tree-sitter). */
export const PARSEABLE: ReadonlySet<LanguageId> = new Set<LanguageId>([
  'python',
  'javascript',
  'typescript',
  'jsx',
  'tsx',
  'go',
  'rust',
  'java',
]);

export const IGNORE_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.svelte-kit',
  'coverage',
  '.cache',
  '.turbo',
  '.parcel-cache',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.venv',
  'venv',
  'env',
  '.tox',
  '.idea',
  '.vscode',
  'vendor',
  'target',
]);

export const IGNORE_FILES: ReadonlySet<string> = new Set([
  '.DS_Store',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'poetry.lock',
  'Pipfile.lock',
]);

/** Devuelve la extensión en minúsculas de un path (sin el punto). */
export function extname(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot + 1).toLowerCase();
}

/** Lenguaje de un path según su extensión. */
export function languageOf(path: string): LanguageId {
  return EXTENSION_LANGUAGE[extname(path)] ?? 'unknown';
}

/** `true` si el path cae dentro de una carpeta ignorada o es un archivo ignorado. */
export function isIgnored(path: string): boolean {
  const parts = path.split('/');
  const name = parts[parts.length - 1] ?? '';
  if (IGNORE_FILES.has(name)) return true;
  return parts.slice(0, -1).some((p) => IGNORE_DIRS.has(p));
}
