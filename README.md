<div align="center">

# Code Graph Unified

**Convierte cualquier proyecto de código en un grafo de conocimiento navegable.**

Todos los archivos, cómo se conectan, en qué lenguaje están, qué áreas lo
componen, dónde cambia más y dónde están los problemas — en un solo mapa, para
vos y para que una IA entienda el proyecto de un vistazo.

[Qué hace](#qué-hace) · [Empezar](#empezar) · [Uso](#uso) · [Lenguajes](#lenguajes-soportados) · [Para IA / Claude](#para-una-ia-servidor-mcp) · [Documentación](#documentación) · [Roadmap](#roadmap)

</div>

---

## Qué es

Le pasás una carpeta. El motor lee **el AST real** de cada archivo (con
tree-sitter, no expresiones regulares), reconstruye las dependencias, agrupa el
proyecto en áreas, cruza el historial de git y te devuelve:

- un **grafo interactivo** en el navegador — nodos = archivos o funciones,
  aristas = imports o llamadas, con dominios, hotspots y línea de tiempo;
- tres **archivos de análisis** (`analysis.json`, `graph.json`, `CODEMAP.md`);
- **13 herramientas MCP** para que Claude consulte el grafo sin cargar el repo entero.

Todo corre **local**. No sube tu código a ningún lado, no necesita API keys, no
tiene backend.

## Qué hace

| | |
|---|---|
| **Estructura** | Archivos, funciones, clases, métodos — con líneas de inicio/fin, si están exportados, si son `async`. |
| **Dependencias** | Imports internos y externos. Resuelve rutas relativas, alias de `tsconfig` (`@/x`), `baseUrl`, paquetes de un monorepo, re-exports, y los módulos de Go / Rust / Java. |
| **Dependencias circulares** | Algoritmo de Tarjan (SCC). Marca cada arista que participa de un ciclo. |
| **Dominios** | Agrupa el proyecto en áreas (`auth`, `parsing`, `ui`…) con detección de comunidades (Louvain), y les pone nombre según la carpeta. Determinista. |
| **Hotspots** | Cruza *cuánto cambia* un archivo (churn de git) con *qué tan complejo* es. Alto = donde suelen vivir los bugs. (Idea de *Your Code as a Crime Scene*.) |
| **Acoplamiento oculto** | Pares de archivos que se modifican juntos en git **pero no se importan**. Una dependencia real que el código no muestra. |
| **Timeline** | La historia dividida en 48 tramos: ves los archivos aparecer a medida que se crearon y pulsar cuando se los tocó. |
| **Métricas** | Líneas, complejidad ciclomática, cobertura de documentación por archivo. |
| **Issues** | Heurísticas: `console.log`, `eval`, `debugger`, `innerHTML =`, `== None`, `except:` pelado, `TODO`/`FIXME`… con categoría y severidad. |
| **Stack** | Detecta React, Vue, Next, Django, FastAPI, Prisma, Tailwind, Docker… por nombres de archivo e imports. |
| **Health score** | 0–100 con el desglose de qué le baja la nota (ciclos, complejidad, archivos gigantes, poca doc…). |

## Empezar

Requiere **Node 20+** y **git** (opcional, para la capa de historial).

```bash
git clone https://github.com/santiagomalak/codegraph
cd codegraph
npm install
npm run build
```

### Ver el grafo en el navegador

```bash
npm run serve -- "/ruta/a/tu-proyecto"
# abrí http://localhost:4173

npm run serve -- "/ruta/a/tu-proyecto" --watch   # + se re-analiza al guardar
```

### Generar los archivos de análisis

```bash
npm run analyze -- "/ruta/a/tu-proyecto"
```

Escribe en `tu-proyecto/.codegraph/`:

| Archivo | Qué es | Tamaño típico |
|---|---|---|
| `CODEMAP.md` | Resumen en Markdown para **pegarle a una IA** como contexto | ~200–3000 tokens |
| `graph.json` | El grafo "slim": archivos, dominios, imports | ~8 K tokens |
| `analysis.json` | El análisis completo (archivos + símbolos + grafo + resumen) | ~50 K+ tokens |

## Uso

### `codegraph analyze [carpeta]`

| Flag | Para qué |
|---|---|
| `-o, --out <dir>` | Carpeta de salida (default: `<carpeta>/.codegraph`) |
| `--detail <compact\|normal\|full>` | Nivel de detalle del `CODEMAP.md` |
| `--max-tokens <n>` | Recorta el `CODEMAP.md` para entrar en ~n tokens |
| `--graph-full` | `graph.json` completo (con símbolos y llamadas) |
| `--stdout` | Imprime el JSON por stdout (para pipelines) en vez de escribir archivos |
| `--fail-on-cycles` | Sale con error si hay dependencias circulares (útil en CI) |
| `--fail-on-error` | Sale con error si hay issues de severidad "error" |
| `--max-complexity <n>` | Sale con error si la complejidad promedio supera `n` |
| `--snapshots [n]` | Re-analiza ~n puntos de la historia (`git worktree`) → `snapshots.json` + evolución del proyecto. Lento. |

### `codegraph serve [carpeta]`

| Flag | Para qué |
|---|---|
| `-p, --port <n>` | Puerto (default: 4173) |
| `-w, --watch` | Re-analiza automáticamente al guardar archivos (live reload por SSE) |

Guía completa con ejemplos y flujos de trabajo (CI, onboarding, refactors, IA):
**[`docs/08-uso.md`](./docs/08-uso.md)**.

## Lenguajes soportados

| Lenguaje | Símbolos | Imports internos | Notas |
|---|:---:|:---:|---|
| **Python** | ✅ | ✅ | relativos + módulo absoluto |
| **JavaScript / TypeScript** (+ JSX/TSX) | ✅ | ✅ | relativos + alias tsconfig + `baseUrl` + monorepo + re-exports |
| **Go** | ✅ | ✅ | vía `module` de `go.mod` (por paquete/carpeta) |
| **Rust** | ✅ | ✅ | `mod`, `crate::`, `self::`, `super::` |
| **Java** | ✅ | ✅ | por nombre completo (`com.example.Foo`) |
| CSS / SCSS · JSON · Markdown | — | — | entran en la lista, sin símbolos |

Sumar un lenguaje = una gramática de `tree-sitter-wasms` + una entrada en
`packages/core/src/parsing/language-specs.ts`. Candidatos inmediatos: C#, Ruby,
Kotlin, PHP, C/C++, Swift.

Dónde rinde más y para qué tipo de proyecto:
**[`docs/09-lenguajes-y-casos.md`](./docs/09-lenguajes-y-casos.md)**.

## Para una IA (servidor MCP)

Este repo trae un [`.mcp.json`](./.mcp.json). Después de `npm run build`, Claude
Code (o Claude Desktop) puede analizar **este mismo proyecto** con 13
herramientas — `overview`, `describe_file`, `impact_of`, `find_symbol`,
`hotspots`, `temporal_coupling`… — sin cargar el repo entero en el contexto.

Para apuntarlo a **otro** proyecto, copiá el bloque de `.mcp.json` y cambiá
`--project` por la ruta. Ver [`docs/06-servidor-mcp.md`](./docs/06-servidor-mcp.md).

El modelo de "peso para la IA": `CODEMAP.md` (~200–3000 tokens, va al contexto) →
herramientas MCP (~100–500 tokens por consulta) → `analysis.json` (~50 K, solo
pipelines, nunca en un chat).

## Arquitectura

Monorepo con **npm workspaces**:

```
packages/
├── core/   @codegraph/core — el motor. Node + navegador, sin I/O.
│           tree-sitter · grafo · ciclos · dominios · git · exportadores
├── cli/    @codegraph/cli  — el comando `codegraph` (analyze / serve)
├── mcp/    @codegraph/mcp  — servidor MCP (13 herramientas para Claude)
└── web/    @codegraph/web  — la interfaz (React + Vite + Tailwind + d3-force)
docs/       documentación explicada, en castellano
```

El **core no toca disco ni red**: recibe archivos ya leídos y devuelve datos, así
puede correr también en el navegador. Quien lee el disco es el CLI (`@codegraph/core/node`).

Detalle en [`docs/02-arquitectura.md`](./docs/02-arquitectura.md).

## Scripts

| Comando | |
|---|---|
| `npm run build` | Compila los 4 paquetes |
| `npm run analyze -- <carpeta>` | Analiza y escribe `.codegraph/` |
| `npm run serve -- <carpeta> [--watch]` | Analiza y levanta la web local |
| `npm run mcp -- --project <carpeta>` | Arranca el servidor MCP a mano |
| `npm run dev:web` | Vite en modo dev (con `serve --watch` en otra terminal) |
| `npm test` | Tests (Vitest) |
| `npm run typecheck` | Chequeo de tipos de todos los paquetes |
| `npm run demo` | Regenera el análisis de ejemplo para el deploy estático |

## Documentación

| Doc | De qué trata |
|---|---|
| [01 · Visión y fases](./docs/01-vision-y-fases.md) | Qué se está construyendo y el plan por etapas |
| [02 · Arquitectura](./docs/02-arquitectura.md) | El monorepo, los paquetes y cómo se conectan |
| [03 · El motor](./docs/03-el-motor.md) | Cómo se convierte un archivo en datos, paso a paso |
| [04 · El grafo](./docs/04-el-grafo.md) | Nodos, aristas, dominios, ciclos |
| [05 · La interfaz](./docs/05-la-interfaz.md) | Cómo ver el grafo en el navegador |
| [06 · El servidor MCP](./docs/06-servidor-mcp.md) | Cómo Claude consulta el grafo sin cargarlo |
| [07 · La capa git](./docs/07-capa-git.md) | Hotspots, acoplamiento oculto, timeline |
| [08 · Guía de uso](./docs/08-uso.md) | Todos los comandos, flags y flujos de trabajo |
| [09 · Lenguajes y casos de uso](./docs/09-lenguajes-y-casos.md) | Qué se saca de cada lenguaje y para qué proyectos sirve |

Ver también [`MIGRATION.md`](./MIGRATION.md) (qué cambió respecto de la v2).

## Roadmap

Hecho: motor multi-lenguaje · CLI · web interactiva · servidor MCP · capa git
(hotspots, acoplamiento, timeline + snapshots históricos) · imports precisos.

En camino:

- **Render en canvas/WebGL** — para proyectos de miles de nodos (hoy el SVG se
  ahoga pasando ~500).
- **Extensión de VS Code** — el grafo como panel lateral, "explicá este archivo"
  vía MCP, marcas de hotspot en el gutter, saltar a dependencias. Ver
  [`docs/01`](./docs/01-vision-y-fases.md#extensión-de-vs-code).
- **Panel de IA en la web** — "explicá este nodo / este dominio" desde la UI.
- Más lenguajes · publicar los paquetes en npm.

## Contribuir

Ver [`CONTRIBUTING.md`](./CONTRIBUTING.md). En resumen: `npm run build && npm test
&& npm run typecheck` tiene que pasar; los cambios del motor van con test; la
documentación se actualiza en el mismo commit.

---

<div align="center">

Creado por **Santiago Malak** · Licencia **MIT**

</div>
