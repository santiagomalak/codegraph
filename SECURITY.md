# Seguridad

Code Graph Unified analiza código y arma un grafo. No tiene cuentas de usuario,
no guarda datos en ningún servidor y **no manda tu código a ningún lado**.

## Dónde corre cada cosa

| Componente | Dónde corre | Qué toca |
|---|---|---|
| `@codegraph/core` | Node **o** el navegador | nada de I/O: recibe archivos ya leídos, devuelve datos |
| `@codegraph/cli` (`analyze` / `serve`) | tu máquina (Node) | lee la carpeta y el `.git`; `serve` levanta un HTTP **en localhost** |
| Web hosteada (Vercel) | el **navegador** del usuario | lee la carpeta que elegís con las APIs del navegador; el análisis pasa ahí mismo |
| `@codegraph/mcp` | tu máquina (Node) | lee la carpeta; habla con tu cliente MCP por stdio |
| Extensión de VS Code | tu máquina (host de la extensión) | analiza la carpeta abierta |

Ninguno hace requests de red con tu código. No hay telemetría, analytics ni API
keys. `codegraph serve` sirve en `localhost` y no se expone solo.

## La web hosteada

El deploy de Vercel es **estático** (HTML + JS + los `.wasm` de tree-sitter). Sin
backend. Cuando arrastrás o elegís una carpeta:

- se lee con la File System Access API, `<input webkitdirectory>` o
  `DataTransferItem` — todas requieren un gesto explícito tuyo;
- el análisis corre en el navegador (`analyzeProject`, tree-sitter compilado a
  WebAssembly);
- los archivos viven en memoria de la pestaña y se descartan al cerrarla. No se
  usan `localStorage`, `sessionStorage` ni IndexedDB para tu código;
- **cero** requests de red durante el análisis.

El único tráfico es bajar la app y los `.wasm` (estáticos, cacheados por el
navegador).

Detalle: [`docs/10-analisis-en-el-navegador.md`](./docs/10-analisis-en-el-navegador.md).

## Superficie y mitigaciones

| Vector | Estado |
|---|---|
| Lectura de archivos | Allowlist de extensiones + `IGNORE_DIRS`/`IGNORE_FILES`; tope de tamaño (1,5 MB) y de cantidad (4000) en la web |
| Ejecución de código del proyecto | Ninguna. tree-sitter parsea a AST, no evalúa. No hay `eval`/`Function` sobre contenido del usuario |
| Exfiltración de datos | Ninguna: no hay `fetch`/WebSocket en el camino de análisis |
| XSS en el Inspector | React (sin `dangerouslySetInnerHTML`); el texto entra como `children`, escapado |
| Traversal de rutas | Las rutas se normalizan a POSIX y se resuelven sin `..` que escape la raíz |
| `serve` en localhost | Bind a `localhost`; no maneja secretos ni autentica porque no expone datos de terceros |
| Dependencias | Pocas y con `package-lock.json`. `npm audit` en el flujo de contribución |

## `web-tree-sitter` y `eval`

El runtime de tree-sitter (emscripten) usa `eval` internamente para su glue de
WebAssembly. Es código de la librería, no del proyecto analizado, y no ejecuta
nada que venga de tus archivos. Si servís la web con una CSP propia, necesita
`script-src 'wasm-unsafe-eval'`.

## Reportar un problema

Abrí un *GitHub Security Advisory* en
[github.com/santiagomalak/codegraph](https://github.com/santiagomalak/codegraph)
o contactá al mantenedor (Santiago Malak).
