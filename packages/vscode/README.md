# Code Graph — extensión de VS Code

El grafo de conocimiento de tu proyecto, dentro del editor.

> **v0.1 — en desarrollo.** Todavía no está publicada en el Marketplace.

## Qué hace

- **Comando `Code Graph: mostrar el grafo`** — abre un panel con el grafo
  interactivo (la misma UI que `codegraph serve`): archivos, dependencias,
  dominios, hotspots. Clic en un nodo → abre el archivo en el editor.
- **Marcas de hotspot en el gutter** — los archivos complejos que además cambian
  mucho (según git) llevan un punto naranja en la línea 1 y una marca en el
  minimapa.
- **Status bar** — al abrir un archivo muestra su hotspot y con qué otros
  archivos "cambia junto" (acoplamiento oculto). Clic → abre el grafo.
- **Re-análisis al guardar** (con debounce; se puede desactivar en settings).

## Probarla

Desde la raíz del monorepo:

```bash
npm install
npm run build          # compila core + web + la extensión
```

Después, en VS Code, `F5` (usa `.vscode/launch.json`) → abre una ventana nueva
con la extensión cargada. Abrí una carpeta de proyecto y corré el comando.

## Cómo está armada

```
src/
├── extension.ts     # activación, comandos, re-análisis al guardar
├── analysis.ts      # envoltura de @codegraph/core (+ wasmDir de tree-sitter)
├── panel.ts         # el webview (carga packages/web, habla por postMessage)
└── decorations.ts   # gutter de hotspots + status bar del archivo activo
media/hotspot.svg    # el icono del gutter
build.mjs            # esbuild + copia de la web y los .wasm a dist/
```

El motor corre en el proceso de la extensión (Node). El webview es la web de
`packages/web` compilada con rutas relativas; en vez de pedirle el análisis a un
servidor por `fetch`, lo recibe por `postMessage` (ver `packages/web/src/vscode.ts`).

## Settings

| Setting | Default | |
|---|---|---|
| `codegraph.analyzeOnSave` | `true` | Re-analizar al guardar |
| `codegraph.hotspotGutter` | `true` | Marcar hotspots en el gutter |

## Falta (próximas iteraciones)

- Empaquetar el `.vsix` y publicar en el Marketplace.
- "Explicá este archivo" vía el servidor MCP.
- Snapshots históricos dentro del panel.
- Análisis incremental (hoy re-analiza todo).
