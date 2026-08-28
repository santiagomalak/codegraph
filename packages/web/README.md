# @codegraph/web

La interfaz web de Code Graph Unified. Muestra el grafo de conocimiento del
proyecto de forma interactiva.

No analiza nada por su cuenta: le pide el análisis al CLI (`codegraph serve`) por
`GET /api/analysis`.

## Cómo verla

```bash
# desde la raíz del monorepo
npm run build
npm run serve -- /ruta/a/tu-proyecto
# abrir http://localhost:4173
```

## Desarrollo

Necesita dos procesos:

```bash
# terminal 1 — el CLI analizando algún proyecto, en el puerto 4173
npm run serve -- /ruta/a/tu-proyecto

# terminal 2 — Vite con hot reload en :5173 (proxya /api a :4173)
npm run dev:web
```

## Qué muestra hoy (Fase 2, v1)

- **Grafo de archivos** con simulación de fuerzas: tamaño = líneas de código,
  color = dominio, borde rojo = tiene issues, borde violeta = parte de un ciclo.
- **Aristas** = imports internos. Las circulares van punteadas en violeta.
- **Sidebar**: health score, métricas, stack, lenguajes, dominios, qué baja la nota.
- **Inspector** (click en un nodo): lenguaje, métricas, imports resueltos,
  símbolos, issues.
- **Toolbar**: buscar archivo, "Agrupar por dominio", mostrar externos, re-analizar.
- Zoom/pan, arrastre de nodos, auto-encuadre.

## Estructura

```
src/
├── App.tsx              # layout + estado
├── api.ts               # fetch a /api/analysis
├── graph-model.ts       # análisis → nodos/links para la simulación
└── components/
    ├── ForceGraph.tsx   # el grafo (d3-force + SVG)
    ├── Sidebar.tsx      # resumen del proyecto
    ├── Inspector.tsx    # detalle del archivo seleccionado
    └── Toolbar.tsx      # barra superior
```

## Próximo

- Capa de símbolos (call graph) conmutable.
- Render en canvas/WebGL para proyectos grandes.
- Panel de IA ("explicá este nodo / este dominio").
