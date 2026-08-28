# 04 · El grafo de conocimiento

El resultado central del análisis es `analysis.graph`, un `KnowledgeGraph`:

```ts
interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  cycles: string[][];     // grupos de archivos que forman ciclos
  domains: DomainInfo[];  // áreas del proyecto
}
```

Es **un solo grafo** que mezcla varios planos. La UI decide cuáles mostrar.

## Nodos (`GraphNode`)

| `type` | Qué representa | Campos propios |
|---|---|---|
| `file` | un archivo del proyecto | `path`, `language`, `loc`, `complexity`, `issues`, `domain`, `risk` |
| `symbol` | una función / clase / método | `kind`, `file`, `exported` |
| `domain` | un área del proyecto (auth, ui, parsing…) | `fileCount`, `color` |
| `external` | un paquete de terceros (`react`, `os`…) | — |

`risk` es un número 0–1 por archivo (mezcla de complejidad e issues). Sirve para
pintar "zonas calientes" en la UI.

## Aristas (`GraphEdge`)

| `type` | Va de → a | Significado |
|---|---|---|
| `contains` | file → symbol | el archivo declara ese símbolo |
| `imports` | file → file \| external | dependencia de módulo |
| `calls` | symbol → symbol | una función llama a otra |
| `member-of` | file → domain | el archivo pertenece a esa área |

Las aristas `imports` que forman parte de un ciclo tienen `circular: true`.

### Nota sobre `calls`

Resolver "qué función es la que se llama" es difícil sin análisis de tipos. Somos
**conservadores**: si el nombre coincide con una función del mismo archivo, se
conecta; si coincide con exactamente una función en todo el proyecto, también;
si es ambiguo, se descarta. Preferimos menos aristas pero correctas.

## Dominios

Un "dominio" es un grupo de archivos que probablemente son la misma parte del
sistema. Se detectan con **Louvain** (detección de comunidades): busca grupos de
nodos muy conectados entre sí y poco con el resto, sobre el grafo de imports.

El nombre sale de la carpeta que comparten (`src/core/*` → "core"). Los dominios
de un solo archivo se fusionan al dominio grande que comparte su carpeta.

Si el proyecto no tiene imports internos, se agrupa directamente por carpeta.

## Ciclos

Una dependencia circular es cuando A importa B, B importa C y C importa A (o
cualquier vuelta). Es una señal de mal diseño: esos archivos no se pueden
entender ni testear por separado.

Se detectan con **Tarjan** (componentes fuertemente conexos). Cada entrada de
`cycles` es la lista de archivos de un ciclo.

## Ejemplo de recorrido

```
graph.nodes.filter(n => n.type === 'domain')       // las áreas del proyecto
graph.nodes.filter(n => n.type === 'file' && n.risk > 0.5)   // archivos de riesgo
graph.edges.filter(e => e.circular)                // aristas dentro de ciclos
graph.edges.filter(e => e.type === 'calls' && e.source === 'src/app.ts#main')
```
