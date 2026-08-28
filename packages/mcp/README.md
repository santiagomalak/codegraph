# @codegraph/mcp

Servidor **MCP** (Model Context Protocol) de Code Graph Unified.

En vez de pegarle a la IA todo el análisis del proyecto (decenas de miles de
tokens), este servidor le da herramientas para **consultar** el grafo con
preguntas chicas: "¿quién depende de este archivo?", "¿dónde está esta función?",
"¿qué se rompe si toco esto?".

## Configuración en Claude Code

Creá un `.mcp.json` en la raíz de tu proyecto:

```json
{
  "mcpServers": {
    "codegraph": {
      "command": "npx",
      "args": ["-y", "@codegraph/mcp", "--project", "."]
    }
  }
}
```

Mientras no esté publicado, desde este monorepo (después de `npm run build`):

```json
{
  "mcpServers": {
    "codegraph": {
      "command": "node",
      "args": ["/ruta/al/monorepo/packages/mcp/dist/index.js", "--project", "."]
    }
  }
}
```

A qué carpeta apunta, por orden de prioridad:
`--project <ruta>` → variable `CODEGRAPH_PROJECT` → directorio actual.

El análisis se calcula la primera vez que la IA usa una herramienta y se cachea
hasta que llame a `refresh`.

## Herramientas

| Herramienta | Qué devuelve |
|---|---|
| `overview` | Resumen del proyecto en Markdown (`detail`: compact/normal/full) |
| `list_files` | Todos los archivos con lenguaje, dominio, líneas, issues (`domain` para filtrar) |
| `list_domains` | Las áreas del proyecto y sus dependencias entre sí |
| `describe_file` | Todo sobre un archivo: métricas, imports, símbolos, issues, dependientes |
| `dependencies_of` | Qué importa un archivo (directo) |
| `dependents_of` | Quién importa un archivo (directo) |
| `impact_of` | Todo lo que se rompe si tocás un archivo (transitivo) |
| `find_symbol` | Dónde se define una función/clase y quién la llama |
| `hotspots` | Archivos complejos que además cambian mucho (según git) |
| `temporal_coupling` | Pares de archivos que cambian juntos pero no se importan (acoplamiento oculto) |
| `circular_dependencies` | Los ciclos de imports |
| `search` | Archivos cuya ruta contiene un texto |
| `refresh` | Vuelve a analizar la carpeta |

## Probarlo a mano

```bash
npm run build
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}' | node packages/mcp/dist/index.js --project .
```
