# Documentación — Code Graph Unified

Esta carpeta explica cómo está armado el proyecto y hacia dónde va, en castellano
y pensado para que lo entiendas sin ser experto en compiladores.

## Índice

| Doc | De qué trata |
|---|---|
| [01 · Visión y fases](./01-vision-y-fases.md) | Qué estamos construyendo y el plan por etapas |
| [02 · Arquitectura](./02-arquitectura.md) | El monorepo, los paquetes y cómo se conectan |
| [03 · El motor de análisis](./03-el-motor.md) | Cómo `@codegraph/core` convierte archivos en datos, paso a paso |
| [04 · El grafo de conocimiento](./04-el-grafo.md) | Qué son los nodos, aristas, dominios y ciclos |
| [05 · La interfaz web](./05-la-interfaz.md) | Cómo ver el grafo en el navegador |
| [06 · El servidor MCP](./06-servidor-mcp.md) | Cómo Claude consulta el grafo sin cargarlo entero |
| [07 · La capa git](./07-capa-git.md) | Hotspots: complejo + cambia mucho |

Ver también:
- [`MIGRATION.md`](../MIGRATION.md) — qué cambió respecto de la versión anterior (v2)
- [`packages/core/README.md`](../packages/core/README.md) — referencia del motor
- [`packages/cli/README.md`](../packages/cli/README.md) — referencia del CLI

## Estado actual (Fase 2, v1)

✅ **Fase 1 — Fundación**
- Monorepo con npm workspaces (`packages/core`, `packages/cli`, `packages/web`).
- Motor de análisis real con **tree-sitter** (AST de verdad, no regex) para
  Python y JavaScript/TypeScript.
- Grafo de conocimiento multicapa: archivos, símbolos, dominios, externos.
- Detección de dependencias circulares (Tarjan).
- Agrupación automática en dominios (Louvain).
- Métricas + detección de issues + health score.
- Exportador de `CODEMAP.md` para IA.
- CLI: `codegraph analyze` y `codegraph serve`.
- Tests del motor (Vitest).

✅ **Fase 2 — Interfaz**
- `packages/web`: SPA en React + Tailwind + d3-force.
- Dos vistas: **Archivos** (imports) y **Símbolos** (call graph).
- Grafo: aristas curvas animadas, blobs por dominio, glow de riesgo, auto-encuadre.
- Sidebar (dominios clicables), Inspector (archivo o símbolo, con links a vecinos),
  command palette (Ctrl/Cmd+K).
- `codegraph serve --watch`: live reload por SSE.
- Fallback a demo cuando no hay servidor (deploy estático).

✅ **Fase 3 — IA**
- `packages/mcp`: servidor MCP con 12 herramientas (`overview`, `describe_file`,
  `impact_of`, `find_symbol`, `hotspots`…) para que Claude consulte el grafo sin cargarlo.
- CODEMAP con niveles (`compact`/`normal`/`full`) y presupuesto de tokens.
- `graph.json` slim por defecto (−72% de tamaño).
- Funciones de consulta puras en `core/src/queries.ts`.

✅ **Capa git**
- Lee el historial y calcula **hotspots** (complejo + cambia mucho) por archivo.
- Se ve en el CLI, el CODEMAP, la web (glow naranja + lista clicable) y el MCP.
- **Timeline**: barra con el histograma de actividad + playhead; los archivos
  aparecen a medida que se crearon y pulsan cuando se los tocó en ese tramo.

🚧 **Sigue**
- Timeline con **snapshots reales** (métricas de cada época, no las actuales).
- Render en canvas/WebGL para proyectos muy grandes.
- Chat con el proyecto (RAG sobre el grafo) + "explicá este nodo" en la UI.
- Extensión de VS Code.
