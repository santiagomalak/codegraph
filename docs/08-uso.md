# 08 · Guía de uso

Todo lo que se puede hacer con Code Graph Unified, con ejemplos. Para entender
*cómo funciona* por dentro, ver [`03-el-motor.md`](./03-el-motor.md).

---

## Instalación

```bash
git clone https://github.com/santiagomalak/codegraph
cd codegraph
npm install
npm run build      # compila los 4 paquetes
```

Requisitos: **Node 20+**. `git` es opcional (si está, se activa la capa de
historial: hotspots, acoplamiento, timeline).

Todavía no está publicado en npm. Cuando lo esté, va a poder usarse con
`npx @codegraph/cli analyze <carpeta>` sin clonar nada.

---

## `codegraph analyze` — generar los archivos de análisis

```bash
npm run analyze -- "/ruta/a/tu-proyecto"
```

Recorre la carpeta, analiza y escribe en `tu-proyecto/.codegraph/`:

| Archivo | Qué es |
|---|---|
| `CODEMAP.md` | Resumen en Markdown para pegarle a una IA como contexto |
| `graph.json` | El grafo "slim" (archivos, dominios, imports) |
| `analysis.json` | El análisis completo |

En la terminal imprime un resumen: salud, archivos, complejidad, dominios,
hotspots, acoplamiento oculto y qué le baja la nota.

### Flags

| Flag | Ejemplo | Para qué |
|---|---|---|
| `-o, --out <dir>` | `--out ./analisis` | Cambiar la carpeta de salida |
| `--detail <nivel>` | `--detail compact` | `compact` (~200 tok) · `normal` (~1.5 K) · `full` (~3 K, con símbolos e issues) |
| `--max-tokens <n>` | `--max-tokens 1500` | Recorta el `CODEMAP.md` sección por sección hasta entrar en ~n tokens |
| `--graph-full` | | `graph.json` con símbolos y llamadas (pesa ~3–4×) |
| `--no-codemap` / `--no-json` | | No escribir ese archivo |
| `--stdout` | `--stdout > a.json` | Imprime el `analysis.json` por stdout (para pipelines); los logs van a stderr |
| `--fail-on-cycles` | | Sale con código ≠ 0 si hay dependencias circulares |
| `--fail-on-error` | | Sale con error si hay issues de severidad "error" |
| `--max-complexity <n>` | `--max-complexity 15` | Sale con error si la complejidad promedio supera `n` |

---

## `codegraph serve` — el grafo en el navegador

```bash
npm run serve -- "/ruta/a/tu-proyecto"
# → http://localhost:4173
```

Levanta un servidor local que sirve la interfaz web y el análisis por
`GET /api/analysis`. El código **no sale de tu máquina**.

| Flag | Para qué |
|---|---|
| `-p, --port <n>` | Cambiar el puerto (default 4173) |
| `-w, --watch` | Re-analiza al guardar cualquier archivo y refresca la web sola (SSE) |

Para cambiar de proyecto: `Ctrl+C` y volvé a correr con otra carpeta.

Qué se ve y cómo se navega: [`05-la-interfaz.md`](./05-la-interfaz.md).

### Desarrollo de la propia web

```bash
# terminal 1 — la API + el watcher
npm run serve -- "/ruta/a/un-proyecto" --watch
# terminal 2 — Vite con hot reload, proxya /api a :4173
npm run dev:web
```

---

## El servidor MCP — que Claude consulte el grafo

El repo trae un [`.mcp.json`](../.mcp.json). Después de `npm run build`, Claude
Code lo levanta solo y puede analizar **este** proyecto con 13 herramientas.

### Apuntarlo a otro proyecto

**Claude Code** — en el `.mcp.json` (o `~/.claude/mcp.json`):

```json
{
  "mcpServers": {
    "codegraph": {
      "command": "node",
      "args": ["/ruta/absoluta/a/codegraph/packages/mcp/dist/index.js", "--project", "/ruta/a/tu-proyecto"]
    }
  }
}
```

**Claude Desktop** — mismo bloque en su `claude_desktop_config.json`.

La primera herramienta que uses dispara el análisis (se cachea hasta que llames a
`refresh`). Lista completa de herramientas y el modelo de "peso para la IA":
[`06-servidor-mcp.md`](./06-servidor-mcp.md).

---

## Flujos de trabajo

### 1. Entender un proyecto nuevo (onboarding)

```bash
npm run serve -- "/ruta/al/proyecto-nuevo"
```

Mirá primero la **sidebar**: health score, stack, lista de dominios. Hacé clic en
cada dominio para aislarlo. Prendé **"Agrupar por dominio"** para ver las áreas
separadas. Los **entry points** (en el CODEMAP) te dicen por dónde empieza a
ejecutarse. Si hay historial de git, el **Timeline** te muestra en qué orden se
construyó.

### 2. Antes de un refactor — medir el impacto

Con el MCP: preguntale a Claude `impact_of` sobre el archivo que vas a tocar —
te dice **todo** lo que depende de él (transitivo). O en la web, seleccioná el
nodo y mirá "Lo importan".

El **acoplamiento oculto** te avisa de archivos que *siempre* cambian con el
tuyo aunque no se importen: probablemente también haya que tocarlos.

### 3. Encontrar dónde refactorizar primero

La sección **Hotspots**: archivos complejos que además cambian mucho. Ordenados
por score. Ahí es donde un refactor rinde más.

### 4. Gate en CI

```yaml
# .github/workflows/ci.yml
- run: npm run analyze -- . --fail-on-cycles --max-complexity 20
```

Corta el build si aparecen dependencias circulares o si la complejidad promedio
se dispara. También `--fail-on-error` para issues graves.

### 5. Darle contexto a una IA sin gastar tokens de más

```bash
npm run analyze -- . --detail normal --max-tokens 2000
# pegá el CODEMAP.md al inicio de la conversación
```

O mejor: conectá el **servidor MCP** y la IA consulta lo que necesita, cuando lo
necesita (~100–500 tokens por consulta en vez de 50 K de golpe).

### 6. Pipeline / script propio

```bash
npm run analyze -- . --stdout \
  | jq '.summary.hotspots[] | select(.score > 0.6) | .path'
```

`--stdout` manda solo el JSON a stdout; los logs van a stderr, así que el pipe
queda limpio.

---

## Preguntas frecuentes

**¿Sube mi código a algún lado?** No. Todo corre local: el CLI, el server web y
el MCP. No hay backend ni API keys.

**¿Funciona sin git?** Sí. Sin historial no hay hotspots, acoplamiento ni
timeline; todo lo demás igual.

**¿Y si el proyecto es enorme?** El motor aguanta miles de archivos. La web con
render SVG se pone lenta pasando ~500 nodos (el render en canvas está en el
roadmap). Mientras tanto: filtrá por dominio, o usá el MCP en vez de la web.

**¿Archivos muy grandes?** Los de más de ~1,5 MB entran en la lista pero no se
parsean con AST (quedan sin símbolos, con `parseError`).

**¿Puedo usar solo el motor?** Sí: `import { analyzeProject } from
'@codegraph/core'` (ver [`packages/core/README.md`](../packages/core/README.md)).
