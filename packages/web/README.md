# @codegraph/web

La interfaz web de Code Graph Unified. Muestra el grafo de conocimiento del
proyecto de forma interactiva.

No analiza nada por su cuenta: le pide el análisis al CLI (`codegraph serve`) por
`GET /api/analysis`. Si no hay servidor (deploy estático), usa un
`demo-analysis.json` de ejemplo.

## Cómo verla

```bash
# desde la raíz del monorepo
npm run build
npm run serve -- /ruta/a/tu-proyecto           # http://localhost:4173
npm run serve -- /ruta/a/tu-proyecto --watch   # + live reload
```

## Desarrollo

```bash
npm run serve -- /ruta/a/tu-proyecto --watch   # terminal 1 (API :4173)
npm run dev:web                                 # terminal 2 (Vite :5173)
```

## Qué muestra

- **Vista Archivos**: nodo = archivo (tamaño = LOC, color = dominio, borde rojo =
  issues, borde violeta = ciclo, glow = riesgo). Aristas curvas = imports.
- **Vista Símbolos**: nodo = función (círculo) o clase (rombo). Aristas = llamadas.
- **Sidebar**: health score, métricas, stack, lenguajes, dominios (clic para aislar).
- **Inspector**: detalle del archivo/símbolo, con links clicables a sus vecinos.
- **Ctrl/Cmd + K**: buscador rápido.
- **Toolbar**: agrupar por dominio, mostrar externos, re-analizar, indicador "en vivo".
- Zoom/pan, arrastre de nodos, auto-encuadre.

Detalle completo en [`docs/05-la-interfaz.md`](../../docs/05-la-interfaz.md).

## Estructura

```
src/
├── App.tsx              # layout + estado
├── api.ts               # fetch /api/analysis + SSE + fallback a demo
├── graph-model.ts       # análisis → nodos/links (archivos o símbolos)
├── lib/hull.ts          # el "blob" de cada dominio
└── components/
    ├── ForceGraph.tsx   # el grafo (d3-force + SVG)
    ├── Sidebar.tsx
    ├── Inspector.tsx
    ├── Toolbar.tsx
    └── CommandPalette.tsx
```

## Próximo

- Render en canvas/WebGL para proyectos muy grandes.
- Panel de IA ("explicá este nodo / este dominio").
