import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 20_000,
    // web-tree-sitter es un módulo WASM (emscripten). Si Vite lo transforma o lo
    // pre-empaqueta, su heap se corrompe entre llamadas. Lo dejamos "external"
    // para que Node lo cargue tal cual.
    server: { deps: { external: ['web-tree-sitter', 'tree-sitter-wasms'] } },
    coverage: {
      provider: 'v8',
      thresholds: { lines: 75, functions: 80, branches: 70, statements: 75 },
      include: ['src/**/*.ts'],
      exclude: ['src/model.ts', 'src/index.ts', 'src/parsing/types.ts', 'src/node-fs.ts'],
    },
  },
});
