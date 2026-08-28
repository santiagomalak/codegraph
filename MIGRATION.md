# Migración v2 → v3

Este documento explica qué cambió al pasar de la web-only con parsing por regex
(v2) al monorepo con motor tree-sitter (v3). Es una migración **en curso**: la
Fase 1 está hecha, la interfaz web se migra en la Fase 2.

## Qué se hizo (Fases 1–3)

- El repo pasó a ser un **monorepo con npm workspaces**.
- **`packages/core`**: motor de análisis reescrito con tree-sitter (AST real).
  Expone además `@codegraph/core/node` (utilidades de disco) y
  `core/src/queries.ts` (consultas puras sobre el grafo).
- **`packages/cli`**: el comando `codegraph` (`analyze`, `serve`).
- **`packages/web`**: la interfaz nueva (React + d3-force).
- **`packages/mcp`**: servidor MCP para Claude Code.
- **documentación** en `docs/` (6 documentos).

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

## Qué se borró (Fase 2/3)

La web vieja quedó totalmente reemplazada por `packages/web`, así que se sacó
todo lo que dependía de ella:

- `src/`, `public/` — la web vieja (regex + D3).
- `vite.config.ts`, `vite.config.vercel.ts`, `tailwind.config.js`,
  `postcss.config.js`, `.eslintrc.json`, `vitest.config.ts`, `tsconfig.json`
  (raíz) — configs de la web vieja.
- `Dockerfile`, `docker-compose.yml`, `nginx.conf` — deploy viejo.
- `.github/action/`, `scripts/build-action.js` — GitHub Action vieja.
- `.github/workflows/deploy-vercel.yml`, `release.yml`, `.releaserc.json` —
  el deploy ahora lo maneja `vercel.json`; el release automático se rehará
  cuando se publique a npm.
- `ARCHITECTURE.md`, `DIAGRAMA_ARQUITECTURA.md`, `RESUMEN_FINAL.md`,
  `ELITE_ROADMAP.md`, `API.md`, `PLUGIN_DEVELOPMENT.md` — docs de la v2,
  reemplazados por `docs/`.

Queda en pie: `landing/` (Astro, intacta), `CONTRIBUTING.md`, `SECURITY.md`
(se actualizan más adelante).

## Cómo levantar todo desde cero

```bash
npm install        # instala el monorepo entero
npm run build      # compila core, cli, mcp y web
npm test           # corre los tests
npm run serve -- . # analiza este repo y abre la web en :4173
```
