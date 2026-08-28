# 03 · El motor de análisis (`@codegraph/core`)

El motor toma archivos de texto y devuelve un objeto `ProjectAnalysis`. Nada más.
Acá va el recorrido completo, en el orden en que pasa.

## El flujo de los datos

```
SourceFile[]                       { path, content }
   │
   ▼  parseFile()  (uno por archivo)
ParsedFile[]                       { language, metrics, imports, exports, symbols, issues }
   │
   ├──▼  buildGraph()
   │   KnowledgeGraph              { nodes, edges, cycles, domains }
   │
   └──▼  buildSummary()
       ProjectSummary              { totals, stack, health, ... }
   │
   ▼
ProjectAnalysis                    { files, graph, summary, ... }
```

Todos estos tipos están definidos y comentados en `packages/core/src/model.ts`.
Ese archivo es **el contrato**: si querés saber qué forma tiene un dato, está ahí.

## Paso 1 — Filtrado

`analyze.ts` descarta:
- archivos en carpetas ignoradas (`node_modules`, `.git`, `dist`, `__pycache__`, …),
- archivos con extensión que no entendemos.

## Paso 2 — Parsing por archivo (`parsing/`)

### tree-sitter en dos palabras

tree-sitter es un parser que convierte código en un **árbol de sintaxis**. A
diferencia de una expresión regular, entiende la estructura real del lenguaje
(sabe qué es una función, un import, una llamada, aunque estén anidados o en
varias líneas).

Cada lenguaje es una "gramática" compilada a WebAssembly (`.wasm`). El archivo
`parser-registry.ts` las carga una sola vez y las cachea.

### Qué extraemos

Para cada archivo (`parsing/index.ts` → `parse-python.ts` / `parse-javascript.ts`):

| Dato | Cómo |
|---|---|
| **imports** | nodos `import_statement`, `require(...)`, `from ... import ...` |
| **exports** (JS/TS) | nodos `export ...` |
| **symbols** | funciones, clases y métodos, con línea de inicio/fin |
| **calls** por símbolo | nombres invocados dentro del cuerpo de cada función |
| **documented** | ¿tiene JSDoc / docstring? |
| **complexity** | 1 + cantidad de `if`/`for`/`while`/`case`/`&&`/`?`… en el archivo |

### Issues (`parsing/rules.ts`)

Reglas heurísticas que se aplican línea por línea: `console.log`, `debugger`,
`eval`, `innerHTML =`, `== None`, `except:` pelado, `TODO`/`FIXME`, etc. Cada una
tiene una **categoría** (debug, security, style, smell, todo) y una **severidad**
(info, warning, error).

### Métricas de texto (`metrics/file-metrics.ts`)

`loc` (líneas totales), `comments` (líneas de comentario), `sloc` (código real =
loc − comentarios − blancos).

> Si un archivo pesa más de ~1,5 MB no se parsea con AST: entra en la lista igual,
> con `parseError`, pero sin símbolos.

## Paso 3 — El grafo (`graph/build-graph.ts`)

Ver [`04-el-grafo.md`](./04-el-grafo.md). En resumen:

1. **Resolver imports**: `"./utils"` en `src/app.ts` → `src/utils.ts`
   (`resolve-imports.ts`). Los que resuelven pasan a ser dependencias internas;
   el resto quedan como externas (`react`, `os`, …).
2. **Nodos**: uno por archivo, uno por símbolo, uno por dominio, uno por paquete externo.
3. **Aristas**: `contains` (archivo→símbolo), `imports` (archivo→archivo/externo),
   `calls` (símbolo→símbolo), `member-of` (archivo→dominio).
4. **Ciclos** (`cycles.ts`): algoritmo de Tarjan. Marca las aristas `imports` que
   forman parte de un ciclo.
5. **Dominios** (`domains.ts`): algoritmo de Louvain sobre el grafo de imports.
   Agrupa archivos que se importan mucho entre sí y les pone nombre según la carpeta.
6. **Git** (`git.ts`, opcional): si le pasás el historial (`options.git`), agrega
   `churn` y `hotspot` a cada archivo. Ver [`07-capa-git.md`](./07-capa-git.md).

## Paso 4 — El resumen (`metrics/summary.ts`)

- Totales: archivos, líneas, símbolos, issues por severidad, archivos por lenguaje.
- **Stack**: mira nombres de archivo (`vite.config.ts`, `manage.py`, …) e imports
  (`react`, `fastapi`, …) y arma la lista de tecnologías.
- **Entry points**: archivos llamados `index`, `main`, `app`, `server`, `__main__.py`…
- **Health score** (0–100): arranca en 100 y resta por dependencias circulares,
  complejidad alta, issues graves, archivos gigantes y poca documentación. Cada
  resta queda registrada en `health.factors` con su motivo.

## Cómo probarlo suelto

```ts
import { analyzeProject, toCodemapMarkdown } from '@codegraph/core';

const analysis = await analyzeProject([
  { path: 'a.py', content: 'from .b import x\ndef run():\n    return x()\n' },
  { path: 'b.py', content: 'def x():\n    return 1\n' },
]);

console.log(analysis.summary.health);       // { score, grade, factors }
console.log(toCodemapMarkdown(analysis));   // el CODEMAP.md como string
```
