# 10 · Analizar una carpeta en el navegador

La web hosteada ([codegraph-delta.vercel.app](https://codegraph-delta.vercel.app))
no tiene backend. Aun así podés analizar **cualquier carpeta**: el motor
`@codegraph/core` está compilado para correr también en el navegador, así que
todo el análisis pasa en tu máquina y **ningún archivo se sube a ningún lado**.

## Cómo se usa

1. Entrás a la web. Ves la pantalla de bienvenida.
2. **Arrastrás** una carpeta a la ventana, o tocás **📂 Analizar una carpeta**.
   - Chrome / Edge: se abre el selector de carpetas del sistema
     (`showDirectoryPicker`).
   - Firefox / Safari: cae a un `<input webkitdirectory>` (elegís la carpeta
     igual, con otro diálogo).
3. La web lee los archivos, los filtra igual que el CLI (ver abajo) y corre el
   análisis. Ves el progreso ("Leyendo archivos…", "Parseando 34/210").
4. Aparece el grafo. Un banner verde recuerda que fue local.

Para cambiar de proyecto: **📂 Carpeta** de nuevo.

## Qué NO tenés acá

La **capa de git** (hotspots, acoplamiento temporal, timeline, snapshots
históricos). El navegador no puede leer el `.git` ni correr `git`. Todo lo demás
es idéntico al CLI: estructura, imports, dominios, ciclos, métricas, issues,
health score, stack.

Si querés la capa de git, usá el CLI (`npm run serve -- <carpeta>`) o la
extensión de VS Code.

## Filtros y límites

Mismos que `discoverFiles` en el CLI, más dos topes por la memoria del navegador:

| Regla | Valor |
|---|---|
| Extensiones que entran | las de `EXTENSION_LANGUAGE` (`.py .js .ts .tsx .go .rs .java .css .json .md`…) |
| Carpetas que se saltean | `IGNORE_DIRS` (`node_modules`, `.git`, `dist`, `build`…) y cualquiera que empiece con `.` |
| Archivos que se saltean | `IGNORE_FILES` (`package-lock.json`, `.DS_Store`…) |
| Tamaño máximo por archivo | 1,5 MB (más grande: se saltea, avisa cuántos) |
| Tope de archivos | 4000 (más: analiza los primeros y avisa) |

## Cómo funciona por dentro

```
analyze-folder.ts
  pickAndAnalyze() / analyzeDrop()
        │  recorre la carpeta (File System Access API, <input>, o
        │  DataTransferItem.webkitGetAsEntry) y arma SourceFile[]
        ▼
  analyzeProject(sources, { wasmDir: "/wasm", onProgress })   ← @codegraph/core
        │  tree-sitter (web-tree-sitter) parsea cada archivo en WebAssembly
        ▼
  ProjectAnalysis  →  el mismo grafo que en el CLI
```

Los `.wasm` (7 gramáticas + el runtime `tree-sitter.wasm`) se sirven desde
`/wasm`. En el repo se copian desde `node_modules` en un paso `pre-build`
(`packages/web/scripts/copy-wasm.mjs`); la carpeta `packages/web/public/wasm/`
está gitignoreada.

En Node el motor sigue igual: los consumidores (CLI, MCP, extensión, `gen-demo`)
pasan `wasmDir: nodeWasmDir()` de `@codegraph/core/node`.

## Privacidad

- Los archivos se leen a memoria del navegador y se descartan al cerrar la
  pestaña. No hay `localStorage` ni IndexedDB con tu código.
- El análisis **no hace ni una request de red**. No hay telemetría ni API keys.
- El único tráfico es descargar la app y los `.wasm` (estáticos, cacheados).

Ver también [`SECURITY.md`](../SECURITY.md).
