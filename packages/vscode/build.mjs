/**
 * build.mjs — Compila la extensión.
 *
 *  1. esbuild empaqueta src/extension.ts → dist/extension.js (CJS, para VS Code).
 *     `@codegraph/core` se empaqueta adentro; `web-tree-sitter` y `vscode` quedan
 *     externos (los resuelve node_modules).
 *  2. Copia la web ya compilada (packages/web/dist) → dist/webview/.
 *  3. Copia los .wasm de las gramáticas tree-sitter → dist/wasm/.
 */

import { build, context } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, 'dist');
const require = createRequire(import.meta.url);
const watch = process.argv.includes('--watch');

const GRAMMARS = [
  'tree-sitter-python.wasm',
  'tree-sitter-javascript.wasm',
  'tree-sitter-typescript.wasm',
  'tree-sitter-tsx.wasm',
  'tree-sitter-go.wasm',
  'tree-sitter-rust.wasm',
  'tree-sitter-java.wasm',
];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

// ── 2. la web ─────────────────────────────────────────────────────────────
await cp(join(here, '..', 'web', 'dist'), join(dist, 'webview'), { recursive: true });

// ── 3. los .wasm de tree-sitter ──────────────────────────────────────────
const wasmDir = join(dist, 'wasm');
await mkdir(wasmDir, { recursive: true });
const wasmsRoot = dirname(require.resolve('tree-sitter-wasms/package.json'));
for (const g of GRAMMARS) {
  await cp(join(wasmsRoot, 'out', g), join(wasmDir, g));
}
// El runtime de web-tree-sitter (tree-sitter.wasm) lo resuelve él mismo desde
// node_modules porque queda como dependencia externa.

// ── 1. la extensión ──────────────────────────────────────────────────────
const options = {
  entryPoints: [join(here, 'src', 'extension.ts')],
  outfile: join(dist, 'extension.js'),
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  sourcemap: true,
  external: ['vscode', 'web-tree-sitter'],
  logLevel: 'info',
  // `@codegraph/core` usa `import.meta.url` para ubicar los .wasm cuando no se
  // le pasa `wasmDir`. Nosotros SÍ le pasamos wasmDir, pero igual damos un valor
  // válido para que no quede `undefined` y para el fallback.
  define: { 'import.meta.url': '__IMPORT_META_URL' },
  banner: {
    js: "const __IMPORT_META_URL = require('url').pathToFileURL(__filename).href;",
  },
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('esbuild watch activo');
} else {
  await build(options);
}
