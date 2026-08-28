# 02 · Arquitectura

## Monorepo

Un solo repositorio con varios paquetes independientes que comparten el motor.
Se maneja con **npm workspaces** (ya viene con npm, no hay que instalar nada).

```
code-graph-unified/
├── package.json          # raíz: define los workspaces y scripts globales
├── packages/
│   ├── core/             # @codegraph/core — el motor de análisis
│   ├── cli/              # @codegraph/cli  — el comando `codegraph`
│   └── web/              # @codegraph/web  — la interfaz (Fase 2)
├── docs/                 # esta documentación
├── src/ , public/        # ⚠️ la web VIEJA (v2). Se migra a packages/web y se borra.
└── landing/              # landing page (Astro), sin tocar por ahora
```

### Por qué monorepo

- El **motor** (`core`) es uno solo y lo usan todos: el CLI, la web y (pronto) el
  servidor MCP. Si estuviera copiado en cada lado, se desincronizaría.
- Cada paquete tiene su `package.json`, su `README.md` y su responsabilidad clara.
- `npm install` en la raíz instala y "linkea" todo junto.

## Los paquetes

### `@codegraph/core` — el motor

Recibe archivos (texto) y devuelve datos. **No lee del disco ni hace requests.**
Eso lo hace que sirva igual en Node y en el navegador.

```
archivos  →  [ core ]  →  ProjectAnalysis { files, graph, summary }
```

Ver [`03-el-motor.md`](./03-el-motor.md) para el detalle.

### `@codegraph/cli` — el comando

La capa que **sí** toca el disco. Recorre una carpeta, lee los archivos, se los
pasa al motor y escribe los resultados.

```
codegraph analyze ./mi-proyecto
  → recorre la carpeta (discover.ts)
  → analyzeProject(archivos)          [core]
  → escribe .codegraph/analysis.json, graph.json, CODEMAP.md
  → imprime el resumen en la terminal
```

`codegraph serve` además levanta un servidor local con el análisis en
`/api/analysis` (y servirá la web cuando exista).

### `@codegraph/web` — la interfaz (Fase 2)

Va a ser una SPA (React + Tailwind + un motor de grafo WebGL). En el navegador el
usuario elige la carpeta con la File System Access API, el mismo `core` corre en
un Web Worker, y se dibuja el grafo con capas conmutables.

## Cómo se conectan

```
                 ┌───────────────────┐
                 │  @codegraph/core  │   (motor puro, sin I/O)
                 └─────────▲─────────┘
                           │ importa
        ┌──────────────────┼──────────────────┐
        │                  │                  │
┌───────┴───────┐  ┌───────┴───────┐  ┌───────┴────────┐
│ @codegraph/cli│  │ @codegraph/web│  │ @codegraph/mcp │  (Fase 3)
│  (Node, disco)│  │ (navegador)   │  │ (Node, MCP)    │
└───────────────┘  └───────────────┘  └────────────────┘
```

El `core` no sabe quién lo usa. Los demás paquetes le dan de comer archivos y
consumen el resultado.

## Herramientas

| Para qué | Herramienta |
|---|---|
| Lenguaje | TypeScript |
| Parsing de código | tree-sitter (WebAssembly) |
| Clustering del grafo | graphology + graphology-communities-louvain |
| CLI | commander + picocolors |
| Tests | Vitest |
| Build | `tsc` (por ahora; la web usará Vite) |

## Scripts globales (desde la raíz)

| Comando | Qué hace |
|---|---|
| `npm install` | Instala todo el monorepo |
| `npm run build` | Compila `core` y después `cli` |
| `npm test` | Corre los tests de todos los paquetes |
| `npm run typecheck` | Chequeo de tipos de todos los paquetes |
| `npm run analyze -- <carpeta>` | Atajo para `codegraph analyze` |
