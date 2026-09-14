# @codegraph/web

La interfaz web de Code Graph Unified. Muestra el grafo de conocimiento del
proyecto de forma interactiva.

Orígenes del análisis: `codegraph serve` (`GET /api/analysis`), una **carpeta que
elegís o arrastrás y se analiza en el navegador** (`src/analyze-folder.ts`,
tree-sitter en WASM), el `demo-analysis.json` de ejemplo, o la extensión de VS
Code por `postMessage`. Con los dos primeros no hay backend. Ver
[`docs/10-analisis-en-el-navegador.md`](../../docs/10-analisis-en-el-navegador.md).

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
- **⏱ Timeline** (repos git): barra con el histograma de commits + playhead;
  los archivos aparecen a medida que se crearon y pulsan cuando se los tocó.
- **🔗 Acoplamiento** (repos git): líneas punteadas entre archivos que cambian
  juntos; ámbar = no se importan (acoplamiento oculto).
- **Toolbar**: agrupar por dominio, mostrar externos, **📂 Carpeta** (analizar una
  carpeta en el navegador), re-analizar (con `serve`), indicador "en vivo".
- Zoom/pan, arrastre de nodos, auto-encuadre.

Detalle completo en [`docs/05-la-interfaz.md`](../../docs/05-la-interfaz.md).

## Estructura

```
src/
├── App.tsx              # layout + estado
├── api.ts               # orígenes server / demo / embedded (+ SSE con --watch)
├── analyze-folder.ts    # leer una carpeta del disco y analizarla en el navegador
├── graph-model.ts       # análisis → nodos/links (archivos o símbolos)
├── lib/hull.ts          # el "blob" de cada dominio
└── components/
    ├── ForceGraph.tsx   # el grafo (d3-force + SVG)
    ├── Sidebar.tsx
    ├── Inspector.tsx
    ├── Toolbar.tsx
    ├── CommandPalette.tsx
    └── Timeline.tsx     # la barra temporal (repos git)

scripts/copy-wasm.mjs   # copia los .wasm de tree-sitter → public/wasm/ (corre en pre-dev/pre-build)
```

## Próximo

- Render en canvas/WebGL para proyectos muy grandes.
- Panel de IA ("explicá este nodo / este dominio").
