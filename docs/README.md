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

✅ **Fase 2 — Interfaz (v1)**
- `packages/web`: SPA en React + Tailwind + d3-force.
- Grafo interactivo: zoom/pan, arrastre, auto-encuadre, resaltado de vecinos.
- Sidebar con resumen, Inspector por archivo, Toolbar con búsqueda y capas.
- `codegraph serve` sirve la UI y expone `/api/analysis`.

✅ **Fase 3 — IA (v1)**
- `packages/mcp`: servidor MCP con 11 herramientas (`overview`, `describe_file`,
  `impact_of`, `find_symbol`…) para que Claude consulte el grafo sin cargarlo.
- CODEMAP con niveles (`compact`/`normal`/`full`) y presupuesto de tokens.
- `graph.json` slim por defecto (−72% de tamaño).
- Funciones de consulta puras en `core/src/queries.ts`.

🚧 **Sigue**
- Capa de símbolos (call graph) conmutable en la UI web.
- Render en canvas/WebGL para proyectos grandes.
- `codegraph watch`: re-analizar al guardar archivos.
- Chat con el proyecto (RAG sobre el grafo).
- Extensión de VS Code.
- Capa git (churn, hotspots, timeline).
