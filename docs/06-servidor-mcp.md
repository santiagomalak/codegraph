# 06 · El servidor MCP (`@codegraph/mcp`)

## El problema que resuelve

El análisis completo de un proyecto (`analysis.json`) pesa **decenas de miles de
tokens** — para 50 archivos ya son ~55.000. No entra cómodo en el contexto de una
IA, y para 500 archivos directamente no entra.

El `CODEMAP.md` es la respuesta para el **contexto inicial** (1–3K tokens). Pero
si la IA necesita algo puntual ("¿quién importa este archivo?"), no debería
tener que cargar todo el grafo.

**El servidor MCP le da herramientas para consultar el grafo**, y cada respuesta
son 100–500 tokens.

## Cómo se usa

Es un servidor [MCP](https://modelcontextprotocol.io) que se comunica por stdio.
Claude Code lo levanta según un `.mcp.json`:

```json
{
  "mcpServers": {
    "codegraph": {
      "command": "node",
      "args": ["packages/mcp/dist/index.js", "--project", "."]
    }
  }
}
```

Este repo ya trae ese `.mcp.json` (apuntando al build local). Después de
`npm run build`, Claude Code puede analizar **el propio Code Graph Unified**.

## Las herramientas

Ver la tabla completa en [`packages/mcp/README.md`](../packages/mcp/README.md).
Las más útiles:

- **`overview`** — arrancá por acá: stack, dominios, ciclos, entry points.
- **`describe_file`** — todo sobre un archivo sin leer su contenido.
- **`impact_of`** — antes de refactorizar: qué archivos dependen (directa o
  indirectamente) del que vas a tocar.
- **`find_symbol`** — dónde está una función y quién la llama.

## Cómo está hecho

```
packages/mcp/src/
├── index.ts     # define las 11 herramientas y arranca el servidor
└── project.ts   # carga y cachea el análisis de la carpeta
```

Las herramientas son finitas envolturas sobre `@codegraph/core`:
- `overview` → `toCodemapMarkdown()`
- `impact_of` / `dependents_of` / `find_symbol` / … → funciones de
  [`core/src/queries.ts`](../packages/core/src/queries.ts)

O sea: toda la lógica está en `core`, testeada. El paquete `mcp` solo la expone
por el protocolo.

## Los 3 niveles de "contexto para IA", juntos

| Necesidad | Herramienta | Peso |
|---|---|---|
| Entender el proyecto de entrada | `CODEMAP.md` / `overview` | 200 – 3.000 tokens |
| Preguntas puntuales mientras programa | herramientas MCP | 100 – 500 tokens c/u |
| Pipelines, la web | `analysis.json` / `graph.json` | 10K – 500K tokens (no lo lee una IA) |
