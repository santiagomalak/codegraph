# Migración v2 → v3

Este documento explica qué cambió al pasar de la web-only con parsing por regex
(v2) al monorepo con motor tree-sitter (v3). Es una migración **en curso**: la
Fase 1 está hecha, la interfaz web se migra en la Fase 2.

## Qué se hizo (Fase 1)

- El repo pasó a ser un **monorepo con npm workspaces**.
- Se creó **`packages/core`**: el motor de análisis, reescrito desde cero con
  tree-sitter (AST real) en vez de expresiones regulares.
- Se creó **`packages/cli`**: el comando `codegraph`.
- Se agregó **documentación** en `docs/`.

## Qué se movió / reemplazó

| v2 (antes) | v3 (ahora) | Nota |
|---|---|---|
| `src/core/analyzer.js` (regex) | `packages/core/src/parsing/` (tree-sitter) | reescrito |
| `src/core/parsers/*Parser.js` | `packages/core/src/parsing/parse-*.ts` | reescrito |
| `src/core/graphBuilder.js` | `packages/core/src/graph/build-graph.ts` | reescrito y ampliado |
| `src/core/incrementalAnalyzer.js` | — | se rehará sobre el motor nuevo cuando haga falta |
| `src/api/codemapGenerator.js` | `packages/core/src/exporters/codemap.ts` | reescrito |
| `src/types/index.ts` | `packages/core/src/model.ts` | reescrito (solo lo que se usa) |
| `src/utils/hash.js`, `storage.js` | — | específicos del navegador; vuelven en `packages/web` |
| `.github/action/` | — | se actualizará para usar el CLI nuevo (Fase 4) |

## Qué sigue en pie (por ahora)

Estos archivos y carpetas **todavía están** y funcionan con la config vieja. Se
migran o se borran en la Fase 2, no antes, para no romper nada a mitad de camino:

- `src/`, `public/` — la web vieja. Scripts `npm run legacy:dev` / `legacy:build`.
- `vite.config.ts`, `vite.config.vercel.ts`, `tailwind.config.js`, `postcss.config.js`
- `landing/` — landing en Astro, intacta.
- `dist/` — build viejo (ignorado por git).

## Cambios que vas a notar

- **`package.json` raíz**: ahora tiene `"workspaces"` y `"private": true`. Los
  scripts `dev`/`build` viejos pasaron a llamarse `legacy:dev`/`legacy:build`.
- Correr el análisis ya no es abrir el navegador: `node packages/cli/dist/index.js analyze <carpeta>`.
- La salida va a `<carpeta>/.codegraph/` (agregado al `.gitignore`).

## Cómo levantar todo desde cero

```bash
npm install        # instala el monorepo entero
npm run build      # compila core y cli
npm test           # corre los tests
node packages/cli/dist/index.js analyze .    # analiza este mismo repo
```
