# 02 · Arquitectura

## Monorepo

Un solo repositorio con cuatro paquetes que comparten el motor. Se maneja con
**npm workspaces** (ya viene con npm, no hay que instalar nada).

```
codegraph/
├── package.json          # raíz: workspaces + scripts globales
├── .mcp.json             # config del servidor MCP para Claude Code
├── vercel.json           # build del deploy estático (la web en modo demo)
├── packages/
│   ├── core/             # @codegraph/core — el motor de análisis
│   ├── cli/              # @codegraph/cli  — el comando `codegraph`
│   ├── mcp/              # @codegraph/mcp  — servidor MCP para Claude
│   ├── web/              # @codegraph/web  — la interfaz (React + Vite + d3-force)
│   └── vscode/           # codegraph-vscode — extensión de VS Code (v0.1)
├── docs/                 # esta documentación
├── scripts/gen-demo.mjs  # genera el análisis de ejemplo para el deploy
└── landing/              # ⚠️ scaffold de landing en Astro, heredado de la v2 (sin uso)
```

### Por qué monorepo

- El **motor** (`core`) es uno solo y lo usan los otros tres paquetes. Copiado en
  cada lado se desincronizaría.
- Cada paquete tiene su `package.json`, su `README.md` y una responsabilidad clara.
- `npm install` en la raíz instala y "linkea" todo junto.

## Los paquetes

### `@codegraph/core` — el motor

Recibe archivos (texto) y devuelve datos. **No lee del disco ni hace requests.**
Por eso sirve igual en Node y en el navegador.

```
SourceFile[]  →  [ core ]  →  ProjectAnalysis { files, graph, summary, timeline?, coupling? }
```

Subrutas exportadas:

| Import | Qué trae | Dónde corre |
|---|---|---|
| `@codegraph/core` | `analyzeProject`, exportadores, tipos | Node + navegador |
| `@codegraph/core/queries` | funciones de consulta puras (`dependentsOf`, `impactOf`…) | Node + navegador |
| `@codegraph/core/node` | `discoverFiles`, `readGitHistory`, `readProjectConfig` | **solo Node** (toca disco y `git`) |

Detalle del pipeline en [`03-el-motor.md`](./03-el-motor.md).

### `@codegraph/cli` — el comando

La capa que **sí** toca el disco. `commander` para los argumentos.

```
codegraph analyze ./mi-proyecto
  → discoverFiles(carpeta)                      [core/node]
  → readGitHistory + readProjectConfig          [core/node]
  → analyzeProject(archivos, { git, timeline, coupling, resolve })   [core]
  → escribe .codegraph/{analysis.json, graph.json, CODEMAP.md}
  → imprime el resumen

codegraph serve ./mi-proyecto [--watch]
  → lo mismo + servidor HTTP local:
      GET /                → la web (packages/web/dist)
      GET /api/analysis    → el JSON  (?fresh=1 re-analiza)
      GET /api/events (SSE)→ "updated" cuando cambia un archivo
```

### `@codegraph/mcp` — servidor MCP

Expone el análisis como **13 herramientas** del Model Context Protocol para que
Claude Code / Claude Desktop consulten el grafo sin cargar el repo entero.
Cachea el análisis hasta que se llame a `refresh`.

Ver [`06-servidor-mcp.md`](./06-servidor-mcp.md).

### `@codegraph/web` — la interfaz

SPA en **React + Vite + Tailwind + d3-force**. No analiza nada: le pide el JSON al
CLI (`GET /api/analysis`) y lo dibuja. Si no hay servidor (deploy estático en
Vercel), cae a un `demo-analysis.json` de ejemplo y lo marca como "modo demo".
Dentro del webview de la extensión de VS Code, el análisis llega por
`postMessage` en vez de `fetch` (ver `src/vscode.ts`).

Ver [`05-la-interfaz.md`](./05-la-interfaz.md).

### `codegraph-vscode` — extensión de VS Code (v0.1)

Corre el motor en el proceso de la extensión y muestra el grafo en un webview
que **reusa `packages/web`** compilada. Clic en un nodo abre el archivo; los
hotspots se marcan en el gutter; el acoplamiento del archivo activo va en la
status bar. Se compila con esbuild (`build.mjs`).

Ver [`packages/vscode/README.md`](../packages/vscode/README.md).

## Cómo se conectan

```
                 ┌───────────────────┐
                 │  @codegraph/core  │   (motor puro, sin I/O)
                 └─────────▲─────────┘
                           │ importa
        ┌──────────────────┼──────────────────┐
        │                  │                  │
┌───────┴───────┐  ┌───────┴───────┐  ┌───────┴────────┐
│ @codegraph/cli│  │ @codegraph/mcp│  │ @codegraph/web │
│ (Node, disco) │  │ (Node, MCP)   │  │  (navegador)   │
└───────┬───────┘  └───────────────┘  └───────▲────────┘
        │              sirve /api/analysis    │
        └────────────────────────────────────-┘
```

El `core` no sabe quién lo usa. Los demás le dan de comer archivos y consumen el
resultado. La web nunca importa `core` en runtime (solo tipos y `queries`), para
no arrastrar `node:*` al bundle.

## Tecnologías

| Para qué | Herramienta |
|---|---|
| Lenguaje | TypeScript (ESM, `moduleResolution: Bundler` en core) |
| Parsing de código | tree-sitter vía `web-tree-sitter` + `tree-sitter-wasms` (WASM) |
| Clustering del grafo | `graphology` + `graphology-communities-louvain` |
| CLI | `commander` + `picocolors` |
| Web | React 18 · Vite · Tailwind · `d3-force` / `d3-zoom` / `d3-drag` |
| MCP | `@modelcontextprotocol/sdk` + `zod` |
| Tests | Vitest |
| Build | `tsc` (core/cli/mcp) · Vite (web) |
| CI | GitHub Actions (build → typecheck → test → analiza el propio repo → handshake MCP) |
| Deploy | Vercel (estático: la web en modo demo) |

## Scripts globales (desde la raíz)

Ver la tabla completa en el [README](../README.md#scripts). Los principales:
`npm run build`, `npm test`, `npm run typecheck`, `npm run analyze -- <carpeta>`,
`npm run serve -- <carpeta> [--watch]`.

## El contrato de datos

Todo pasa por los tipos de `packages/core/src/model.ts`. Si cambia algo ahí,
cambia la forma de los datos en todos los paquetes. Los principales:
`SourceFile` → `ParsedFile` → `KnowledgeGraph` + `ProjectSummary` = `ProjectAnalysis`.
