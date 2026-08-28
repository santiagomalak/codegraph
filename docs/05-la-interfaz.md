# 05 · La interfaz web (`@codegraph/web`)

## Cómo verla

```bash
npm install
npm run build
npm run serve -- "C:\ruta\a\tu-proyecto"       # abrí http://localhost:4173
npm run serve -- "C:\ruta\a\tu-proyecto" --watch  # + re-analiza al guardar
```

Para cambiar de proyecto: `Ctrl+C` y volvé a correr con otra carpeta.

## Cómo se conecta

```
navegador (la UI)  ──GET /api/analysis──▶  codegraph serve (Node)
                   ◀──SSE /api/events────   (avisa "updated" con --watch)
```

La UI **no** analiza nada: pide el JSON y lo dibuja. Si no hay servidor (deploy
estático en Vercel), cae a un `demo-analysis.json` de ejemplo y lo marca como
"modo demo".

## Qué se ve

### El grafo (centro)

**Vista "Archivos"** — cada círculo es un archivo:
- tamaño = líneas de código · color = dominio
- borde rojo = tiene issues · borde violeta = está en un ciclo
- glow = riesgo alto (complejidad + issues)
- líneas curvas = imports internos (punteadas violetas = circular)

**Vista "Símbolos"** — cada nodo es una función (círculo) o clase (rombo):
- color = dominio del archivo que la declara
- líneas = llamadas entre funciones (el call graph)

Interacción: rueda para zoom, arrastrar el fondo para moverte, arrastrar un nodo
para fijarlo, **hover** resalta los vecinos, **click** abre el Inspector,
**"Centrar vista"** reencuadra.

### Sidebar (izquierda)

Health score, métricas, stack, lenguajes y la lista de **dominios**. Click en un
dominio → aísla ese dominio en el grafo (click de nuevo para quitar el filtro).

### Inspector (derecha, al seleccionar)

- Archivo: métricas, dominio, qué **importa** y quién **lo importa** (links
  clicables para saltar), símbolos, issues.
- Símbolo: tipo, líneas, a qué funciones **llama** y qué funciones **lo llaman**.

### Toolbar (arriba)

- **Archivos / Símbolos** — cambia de vista.
- **Ctrl/Cmd + K** — buscador rápido de archivos y dominios (salta al nodo).
- **Agrupar por dominio** — separa las áreas en la pantalla y dibuja un "blob"
  detrás de cada una.
- **Paquetes externos** — agrega nodos para `react`, `os`, etc.
- **🔗 Acoplamiento** — (si hay historial de git) dibuja líneas punteadas entre
  archivos que se modifican juntos. Ámbar = "oculto" (no se importan entre sí).
- **⏱ Timeline** — (si la carpeta es un repo git) abre una barra abajo con el
  histograma de commits y un playhead. Al moverlo, el grafo muestra el proyecto
  como estaba en esa fecha: los archivos aparecen a medida que se crearon y los
  que se tocaron en ese tramo **pulsan**. Play para animarlo, "Hoy" para volver.
- **• en vivo** — aparece cuando `serve --watch` está conectado.
- **↻ Re-analizar** — vuelve a correr el análisis.

## Desarrollo con hot reload

```bash
# terminal 1
npm run serve -- /ruta/a/tu-proyecto --watch
# terminal 2
npm run dev:web        # Vite en :5173, proxya /api a :4173
```

## Estructura

```
src/
├── App.tsx              # layout + estado
├── api.ts               # fetch /api/analysis + SSE + fallback a demo
├── graph-model.ts       # análisis → nodos/links (vista archivos o símbolos)
├── lib/hull.ts          # el "blob" de cada dominio (convex hull suavizado)
└── components/
    ├── ForceGraph.tsx   # el grafo (d3-force + SVG, aristas curvas animadas)
    ├── Sidebar.tsx      # resumen + dominios clicables
    ├── Inspector.tsx    # detalle de archivo o símbolo
    ├── Toolbar.tsx      # barra superior
    └── CommandPalette.tsx  # Ctrl/Cmd + K
```
