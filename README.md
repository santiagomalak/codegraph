# Code Graph Unified

Analizador de proyectos de código con visualización de grafo interactivo y generación de CODEMAP para agentes IA.

## Funcionalidades

- Carga una carpeta completa de proyecto desde el navegador
- Visualiza las dependencias como grafo interactivo (D3.js) con drag & drop y zoom
- Detecta errores automáticamente: `console.log`, `debugger`, `eval`, `innerHTML`, TODO/FIXME, etc.
- Calcula métricas: complejidad ciclomática, líneas, doc coverage
- Inspector por archivo con 4 tabs: Overview / Errores / Dependencias / JSON para IA
- Exporta `CODEMAP.md` listo para compartir con Claude u otro agente IA
- Exporta JSON completo del análisis para pipelines de IA

## Lenguajes soportados

JavaScript, TypeScript, JSX, TSX, Python, CSS, SCSS, JSON, Markdown

## Cómo correr

### Opción 1 — VSCode Live Server (recomendado)

1. Instalar extensión **Live Server** en VSCode
2. Click derecho en `public/index.html` → **Open with Live Server**
3. Se abre en `http://127.0.0.1:5500`

### Opción 2 — Python

```bash
python3 -m http.server 3000 --directory public
# Abrir: http://localhost:3000
```

### Opción 3 — npm

```bash
npm install
npm start
# Abre automáticamente en http://localhost:3000
```

## Estructura

```
code-graph-unified/
├── public/
│   └── index.html              # Punto de entrada (abrir en navegador)
├── src/
│   ├── core/
│   │   └── analyzer.js         # Análisis AST, errores, métricas
│   ├── ui/
│   │   ├── components/
│   │   │   └── GraphViewer.js  # Grafo D3.js, eventos
│   │   └── styles/
│   │       └── main.css        # Estilos y variables CSS
│   ├── api/
│   │   └── codemapGenerator.js # Genera CODEMAP.md y JSON
│   └── app.js                  # Orquestador: conecta todo
├── package.json
└── README.md
```

## Cómo usar con Claude

1. Cargá tu proyecto
2. Exportá el **JSON para IA** o el **CODEMAP.md**
3. Pegalo al inicio de una conversación con Claude:

```
Contexto de mi proyecto:
[pegar contenido del CODEMAP.md o JSON]

Pregunta: ...
```

## Arquitectura

El proyecto usa separación estricta de capas:

| Capa    | Archivo            | Responsabilidad                        |
|---------|--------------------|----------------------------------------|
| Core    | `analyzer.js`      | Lógica pura, sin UI                    |
| UI      | `GraphViewer.js`   | Visualización, emite eventos           |
| API     | `codemapGenerator` | Transformación de datos, exportación   |
| Orq.    | `app.js`           | Conecta capas, maneja flujo            |

---

Creado por Santiago Malak
