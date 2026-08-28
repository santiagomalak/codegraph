# @codegraph/cli

La línea de comandos de Code Graph Unified. Analiza una carpeta del disco y
genera el grafo, el `CODEMAP.md` y el JSON para IA.

## Instalación

Mientras no esté publicado en npm, desde el monorepo:

```bash
npm install
npm run build
node packages/cli/dist/index.js --help
```

(Cuando se publique: `npm install -g @codegraph/cli` y después `codegraph …`.)

## Comandos

### `codegraph analyze [carpeta]`

Analiza la carpeta (default: la actual) y escribe los resultados en
`<carpeta>/.codegraph/`:

| Archivo | Contenido |
|---|---|
| `analysis.json` | El análisis completo (archivos + grafo + resumen) |
| `graph.json` | Solo el grafo de conocimiento (nodos y aristas) |
| `CODEMAP.md` | Resumen en Markdown para pegarle a una IA |

Opciones:

| Flag | Efecto |
|---|---|
| `-o, --out <dir>` | Cambiar la carpeta de salida |
| `--no-json` / `--no-codemap` | No escribir esos archivos |
| `--detail <nivel>` | Nivel del CODEMAP: `compact` (~200 tok), `normal` (default), `full` |
| `--max-tokens <n>` | Recortar el CODEMAP para entrar en ~n tokens |
| `--graph-full` | `graph.json` completo (con símbolos y llamadas); por defecto es "slim" |
| `--stdout` | Imprimir el JSON completo por stdout (no escribe archivos) |
| `--fail-on-cycles` | Exit code 1 si hay dependencias circulares |
| `--fail-on-error` | Exit code 1 si hay issues de severidad "error" |
| `--max-complexity <n>` | Exit code 1 si la complejidad promedio supera `n` |

Ejemplos:

```bash
codegraph analyze                       # analiza la carpeta actual
codegraph analyze ./mi-proyecto
codegraph analyze . --stdout > cg.json  # para pipearlo a otra herramienta
codegraph analyze . --fail-on-cycles --max-complexity 15   # en CI
```

### `codegraph serve [carpeta]`

Analiza la carpeta y levanta la interfaz web local.

| Flag | Efecto |
|---|---|
| `-p, --port <n>` | Puerto (default 4173) |
| `-w, --watch` | Re-analiza automáticamente al guardar archivos (la web se actualiza sola) |

- `GET /api/analysis` → el JSON del análisis (`?fresh=1` fuerza re-análisis).
- `GET /api/events` → Server-Sent Events; avisa `updated` con `--watch`.

```bash
codegraph serve . --watch
```
