# Code Graph Unified

Convierte un proyecto de código en un **grafo de conocimiento multicapa**: todos
los archivos, cómo se conectan, en qué lenguaje están, qué áreas lo componen y
dónde están los problemas. Para vos y para que la IA entienda el proyecto de
forma gráfica.

> **v3 en construcción.** El motor (tree-sitter, AST real), el CLI y una primera
> interfaz web ya funcionan. Ver [`docs/`](./docs/) y [`MIGRATION.md`](./MIGRATION.md).

## Empezar

```bash
npm install
npm run build

# Ver el grafo en el navegador
npm run serve -- "C:\ruta\a\mi-proyecto"
# abrir http://localhost:4173

# …o solo generar los archivos de análisis
npm run analyze -- "C:\ruta\a\mi-proyecto"
```

`analyze` genera en `mi-proyecto/.codegraph/`:

| Archivo | Para qué |
|---|---|
| `analysis.json` | El análisis completo (archivos + grafo + resumen) |
| `graph.json` | Solo el grafo (nodos y aristas) |
| `CODEMAP.md` | Resumen para pegarle a Claude como contexto |

## Qué detecta

- **Estructura**: archivos, funciones, clases, métodos (con AST real de tree-sitter).
- **Dependencias**: imports internos y externos, con resolución de rutas.
- **Dependencias circulares** (algoritmo de Tarjan).
- **Dominios**: agrupa el proyecto en áreas automáticamente (algoritmo de Louvain).
- **Métricas**: líneas, complejidad ciclomática, cobertura de documentación.
- **Issues**: `console.log`, `eval`, `debugger`, `== None`, `except:` pelado, TODOs…
- **Stack**: React, Vite, Django, FastAPI, Tailwind, Docker… por archivos e imports.
- **Health score** 0–100 con el desglose de qué le baja la nota.

**Lenguajes:** Python, JavaScript, TypeScript, JSX, TSX. (Más gramáticas =
más lenguajes, sin cambiar la arquitectura.)

## Estructura del repo

```
packages/
├── core/    @codegraph/core — el motor (Node + navegador, sin I/O)
├── cli/     @codegraph/cli  — el comando `codegraph`
└── web/     @codegraph/web  — la interfaz (React + d3-force)
docs/        documentación explicada, en castellano
src/ public/ ⚠️ web vieja (v2), reemplazada por packages/web — se borrará
landing/     landing page (Astro)
```

## Documentación

| Doc | |
|---|---|
| [docs/01 · Visión y fases](./docs/01-vision-y-fases.md) | El plan por etapas |
| [docs/02 · Arquitectura](./docs/02-arquitectura.md) | El monorepo y los paquetes |
| [docs/03 · El motor](./docs/03-el-motor.md) | Cómo se analiza un proyecto, paso a paso |
| [docs/04 · El grafo](./docs/04-el-grafo.md) | Nodos, aristas, dominios, ciclos |
| [docs/05 · La interfaz](./docs/05-la-interfaz.md) | Cómo ver el grafo en el navegador |

## Scripts

| Comando | |
|---|---|
| `npm run build` | Compila `core` y `cli` |
| `npm test` | Tests (Vitest) |
| `npm run typecheck` | Chequeo de tipos |

---

Creado por Santiago Malak · MIT
