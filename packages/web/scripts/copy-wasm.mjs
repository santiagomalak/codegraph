/**
 * copy-wasm.mjs — Copia los `.wasm` de tree-sitter a `public/wasm/`.
 *
 * La web analiza carpetas 100% en el navegador con tree-sitter compilado a
 * WebAssembly. Vite sirve `public/` tal cual, así que dejamos ahí:
 *   - las gramáticas de cada lenguaje (de `tree-sitter-wasms`)
 *   - el runtime `tree-sitter.wasm` (de `web-tree-sitter`)
 *
 * Corre solo antes de `dev` y `build` (ver package.json). La carpeta
 * `public/wasm/` está gitignoreada: se regenera desde node_modules.
 */

import { cp, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public', 'wasm');

// Las mismas gramáticas que soporta el motor (ver core/languages.ts → PARSEABLE).
const GRAMMARS = [
  'tree-sitter-python.wasm',
  'tree-sitter-javascript.wasm', // js + jsx
  'tree-sitter-typescript.wasm',
  'tree-sitter-tsx.wasm',
  'tree-sitter-go.wasm',
  'tree-sitter-rust.wasm',
  'tree-sitter-java.wasm',
];

await mkdir(outDir, { recursive: true });

const grammarsRoot = join(dirname(require.resolve('tree-sitter-wasms/package.json')), 'out');
for (const g of GRAMMARS) {
  await cp(join(grammarsRoot, g), join(outDir, g));
}

// El runtime de web-tree-sitter.
const runtime = join(dirname(require.resolve('web-tree-sitter/package.json')), 'tree-sitter.wasm');
await cp(runtime, join(outDir, 'tree-sitter.wasm'));

console.log(`wasm → public/wasm/ (${GRAMMARS.length} gramáticas + runtime)`);
