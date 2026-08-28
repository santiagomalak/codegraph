import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 20_000,
    // web-tree-sitter es un módulo WASM (emscripten). Si Vite lo transforma o lo
    // pre-empaqueta, su heap se corrompe entre llamadas. Lo dejamos "external"
    // para que Node lo cargue tal cual.
    server: { deps: { external: ['web-tree-sitter', 'tree-sitter-wasms'] } },
  },
});
