# @codegraph/core

El motor de análisis de Code Graph Unified. **No toca el disco ni la red**: recibe
archivos ya leídos y devuelve datos. Corre igual en Node (el CLI) y en el navegador
(la web).

## Uso

```ts
import { analyzeProject } from '@codegraph/core';

const analysis = await analyzeProject(
  [
    { path: 'src/app.ts', content: '…' },
    { path: 'src/utils.ts', content: '…' },
  ],
  { projectName: 'mi-app' },
);

analysis.files    // ParsedFile[]  — un objeto por archivo (imports, símbolos, issues, métricas)
analysis.graph    // KnowledgeGraph — nodos y aristas de varios "planos"
analysis.summary  // ProjectSummary — totales, stack detectado, health score
```

## Qué hace, en orden

1. **Filtra** archivos ignorados (`node_modules`, `dist`, …) y sin lenguaje conocido.
2. **Parsea** cada archivo con [tree-sitter](https://tree-sitter.github.io/) (Python y JS/TS/JSX/TSX):
   imports, funciones, clases, métodos, llamadas entre símbolos, docstrings.
3. **Métricas e issues** de texto: líneas, complejidad ciclomática, `console.log`, `eval`, TODOs…
4. **Construye el grafo**: `file → symbol` (contains), `file → file` (imports),
   `symbol → symbol` (calls), `file → domain` (member-of).
5. **Detecta ciclos** de dependencias (algoritmo de Tarjan).
6. **Agrupa en dominios** con detección de comunidades (Louvain) sobre el grafo de imports.
7. **Cruza con git** (si le pasás el historial): calcula **hotspots** = complejo + cambia mucho.
8. **Resume** todo y calcula un **health score** 0–100 con el desglose.

El historial de git lo lee `readGitHistory` de `@codegraph/core/node` y se pasa
por `options.git`. El core en sí no toca git (así sigue andando en el navegador).

## Estructura del código

```
src/
├── model.ts              # todos los tipos (el "contrato" de datos)
├── languages.ts          # extensiones, colores, carpetas ignoradas
├── analyze.ts            # analyzeProject() — el orquestador
├── parsing/
│   ├── parser-registry.ts   # carga los .wasm de tree-sitter (cacheado)
│   ├── ast-utils.ts         # helpers para recorrer el árbol de sintaxis
│   ├── parse-python.ts      # extrae estructura de .py
│   ├── parse-javascript.ts  # extrae estructura de .js/.ts/.jsx/.tsx
│   ├── rules.ts             # reglas heurísticas (issues)
│   └── index.ts             # parseFile() — junta todo por archivo
├── graph/
│   ├── resolve-imports.ts   # "./utils" → "src/utils.ts"
│   ├── cycles.ts            # dependencias circulares (Tarjan)
│   ├── domains.ts           # clustering en dominios (Louvain)
│   └── build-graph.ts       # arma nodos y aristas
├── metrics/
│   ├── file-metrics.ts      # loc / sloc / comentarios
│   └── summary.ts           # ProjectSummary + stack + health + hotspots
├── git.ts                   # cruza churn + complejidad → hotspot
├── queries.ts               # consultas puras sobre el análisis (las usa el MCP)
├── node-fs.ts               # discoverFiles + readGitHistory (solo Node → @codegraph/core/node)
└── exporters/
    ├── codemap.ts           # ProjectAnalysis → CODEMAP.md (con niveles)
    └── graph-json.ts        # grafo → JSON slim o completo
```

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run build` | Compila `src/` → `dist/` con TypeScript |
| `npm test` | Tests con Vitest |
| `npm run typecheck` | Solo chequeo de tipos |

## Notas

- Los `.wasm` de las gramáticas vienen del paquete `tree-sitter-wasms`. En Node se
  encuentran solos; en el navegador hay que servirlos y pasar `wasmDir`.
- Archivos de más de ~1,5 MB no se parsean con AST (se listan igual, con `parseError`).
- Si hay más de 6000 símbolos en total, el grafo omite los nodos de símbolo para no
  volverse ilegible (los archivos y dominios siguen).
