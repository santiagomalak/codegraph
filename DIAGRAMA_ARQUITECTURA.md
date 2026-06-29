# 🏗️ Code Graph Unified - Diagrama de Arquitectura

## Estructura de Carpetas (Visualización)

```
code-graph-unified/
│
├── 📁 public/                          ← Punto de entrada
│   └── index.html                      ← Abre esto en navegador
│
├── 📁 src/                             ← Código fuente profesional
│   │
│   ├── 📁 core/                        ← CAPA LÓGICA (sin UI)
│   │   └── analyzer.js                 • Análisis AST
│   │                                   • Detección de errores
│   │                                   • Cálculo de métricas
│   │                                   • Reutilizable (Node.js, etc)
│   │
│   ├── 📁 ui/                          ← CAPA VISUALIZACIÓN
│   │   ├── components/
│   │   │   └── GraphViewer.js          • Renderiza grafo (D3.js)
│   │   │                               • Maneja interacciones
│   │   │                               • Emite eventos
│   │   │
│   │   └── styles/
│   │       └── main.css                • Estilos globales
│   │                                   • Variables CSS
│   │                                   • Responsive
│   │
│   ├── 📁 api/                         ← CAPA EXPORTACIÓN
│   │   └── codemapGenerator.js         • Genera CODEMAP.md
│   │                                   • Genera reportes
│   │                                   • Exporta JSON
│   │
│   └── app.js                          ← ORQUESTADOR
│                                       • Inyección de dependencias
│                                       • Conecta módulos
│                                       • Maneja flujo global
│
├── package.json                        ← Configuración Node.js
├── README.md                           ← Documentación principal
├── VSCODE_GUIDE.md                     ← Guía para VSCode
├── .gitignore                          ← Git configuration
└── [otros archivos documentación]
```

---

## Cómo Se Comunican los Módulos

```
┌────────────────────────────────────────────────────────┐
│                   app.js (ORQUESTADOR)                 │
│  • Instancia módulos                                   │
│  • Maneja eventos globales                            │
│  • Conecta Core ↔ UI ↔ API                            │
└────────────────────────────────────────────────────────┘
                     ↑        ↑        ↑
         ┌───────────┼────────┼────────┼─────────┐
         │           │        │        │         │
    ┌────▼────┐  ┌───▼────┐  │    ┌───▼────┐  (eventos)
    │          │  │        │  │    │        │
┌───┴────────┐ │  │  ┌─────┴──┴────┤ ┌────┴───┐
│   CORE     │ │  │  │   UI        │ │  API   │
│ analyzer.js│ │  │  │ GraphViewer │ │ codemap│
│            │ │  │  │  + CSS      │ │ gener. │
│ • Analiza  │ │  │  │             │ │        │
│ • Errores  │ │  │  │ • Renderiza │ │ • Exp. │
│ • Métricas │ │  │  │ • Interacta │ │ • JSON │
│            │ │  │  │             │ │ • .md  │
└────────────┘ │  │  └─────────────┘ └────────┘
     ↑         │  │        ↑              ↑
     │         │  │        └──────┬───────┘
     └─────────┼──┼─────────────────┘
               └──┘
          (sin dependencias
           circulares)
```

---

## Flujo de Ejecución

```
1. USUARIO ABRE index.html EN NAVEGADOR
            ↓
2. HTML CARGA MÓDULOS EN ORDEN
   • analyzer.js       ← Core
   • GraphViewer.js    ← UI
   • codemapGenerator.js ← API
   • app.js            ← Orquestador
            ↓
3. DOMContentLoaded DISPARA
   new CodeGraphApp()
            ↓
4. app.js.init():
   • this.analyzer = new CodeAnalyzer()
   • this.graphViewer = new GraphViewer()
   • Setup event listeners
            ↓
5. USUARIO: Click "Cargar Proyecto"
            ↓
6. app.js RECIBE CARPETA
   analyzer.analyzeFiles(files)
            ↓
7. ANALYZER RETORNA (JSON PURO):
   {
     files: [...análisis de cada archivo...],
     graph: {...dependencias...},
     summary: {totalFiles, totalErrors, ...}
   }
            ↓
8. app.js RENDERIZA:
   graphViewer.render(graph)
            ↓
9. GRAPHVIEWER DIBUJA CON D3.JS
            ↓
10. USUARIO: Click EN NODO
            ↓
11. GRAPHVIEWER EMITE: 'node-selected'
            ↓
12. app.js ESCUCHA Y ACTUALIZA INSPECTOR
            ↓
13. USUARIO: "Descargar CODEMAP"
            ↓
14. app.js LLAMA:
    codemapGenerator.download()
            ↓
15. CODEMAPGENERATOR CREA ARCHIVO .md
            ↓
16. NAVEGADOR DESCARGA ARCHIVO
```

---

## Responsabilidad de Cada Módulo

### analyzer.js (Core - 300 líneas)
```
ENTRADA:  File[] (archivos del navegador)
    ↓
PROCESA: 
  • Lee cada archivo
  • Analiza código (imports, funciones, clases)
  • Detecta errores (debugger, console.log, etc)
  • Calcula complejidad ciclomática
  • Construye grafo de dependencias
    ↓
SALIDA:  {
  files: [{file, type, metrics, imports, errors, ...}],
  graph: {nodes, edges, circular},
  summary: {totalFiles, totalErrors, ...}
}
    ↓
NOTA: JSON PURO - Sin conocer UI
```

### GraphViewer.js (UI - 250 líneas)
```
ENTRADA: {nodes: [], links: []}
    ↓
PROCESA:
  • Crea simulación de fuerzas (D3.js)
  • Renderiza círculos (nodos)
  • Renderiza líneas (links)
  • Setup drag & drop
  • Setup zoom
  • Setup click listeners
    ↓
EMITE:
  • 'node-selected' ← cuando usuario clickea
  • 'node-hover' ← cuando usuario hoverea
  • 'node-leave' ← cuando mouse sale
    ↓
NOTA: Solo visualización - Sin lógica de análisis
```

### codemapGenerator.js (API - 300 líneas)
```
ENTRADA: (analyzedFiles, graph, options)
    ↓
PROCESA:
  • Ordena datos por relevancia
  • Crea secciones Markdown
  • Genera recomendaciones
  • Formatea para legibilidad
    ↓
SALIDA: 
  • Markdown string
  • O descarga directa .md
    ↓
NOTA: No toca UI - Solo transformación de datos
```

### app.js (Orquestador - 250 líneas)
```
RESPONSABLE DE:
  • Instanciar: analyzer, graphViewer, codemapGenerator
  • Setup event listeners globales
  • Manejar flujo de la aplicación
  • Conectar módulos
  • Inyectar dependencias
    ↓
NO ANALIZA CÓDIGO (eso es analyzer)
NO DIBUJA GRAFO (eso es graphViewer)
NO GENERA MARKDOWN (eso es codemapGenerator)
    ↓
SOLO: "Qué hace el usuario? → Qué módulo lo maneja?"
```

---

## Cambios: Dónde Editar

```
¿QUIERES CAMBIAR?              ARCHIVO A EDITAR
─────────────────────────────────────────────────────
Color de nodos                 src/ui/styles/main.css
                               O: GraphViewer.js

Detección de errores           src/core/analyzer.js
                               (función: detectErrors)

Cálculo de complejidad         src/core/analyzer.js
                               (función: calculateComplexity)

Exportar a PDF                 Crear: src/api/pdfExporter.js

Exportar a HTML                Crear: src/api/htmlExporter.js

Cambiar interacción            src/ui/components/GraphViewer.js

Agregar métrica nueva          src/core/analyzer.js
                               + ui para mostrar

Cambiar layout inspector       src/app.js (renderInspector)
                               + src/ui/styles/main.css
```

---

## Testing: Cómo Testear Cada Módulo

```
┌──────────────────────────────────────────────────────┐
│ TESTING MODULAR                                      │
├──────────────────────────────────────────────────────┤
│                                                      │
│ // Test Core (sin UI)                               │
│ const analyzer = new CodeAnalyzer();                │
│ const result = await analyzer.analyzeFiles(mockFiles);
│ expect(result.summary.totalErrors).toBe(3);        │
│                                                      │
│ // Test UI (sin Backend)                            │
│ const viewer = new GraphViewer('#test');           │
│ viewer.render(mockGraph);                           │
│ expect(viewer.getSelectedNode()).toBeNull();       │
│                                                      │
│ // Test API (sin UI)                                │
│ const gen = new CodemapGenerator(files, graph);    │
│ const md = gen.getContent();                        │
│ expect(md).toContain('# CODEMAP');                 │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## Escalabilidad: Agregar Nuevas Features

```
ESCENARIO 1: Detectar Memory Leaks

1. Editar: src/core/analyzer.js
   Agregar método: detectMemoryLeaks(content)
   
2. Llamar en: analyzeFile()
   analysis.memoryLeaks = this.detectMemoryLeaks(content)
   
3. Listo - No tocaste UI ni API
   Costo: ~20 líneas en 1 archivo

────────────────────────────────────────────────────

ESCENARIO 2: Exportar a CSV

1. Crear: src/api/csvExporter.js
   class CsvExporter { ... }
   
2. En app.js:
   this.csvExporter = new CsvExporter(this.analyzedData)
   
3. En index.html:
   <script src="./src/api/csvExporter.js"></script>
   
4. Listo - Archivo nuevo, sin modificar existentes
   Costo: 1 archivo nuevo

────────────────────────────────────────────────────

ESCENARIO 3: Cambiar visualización D3 a Three.js

1. Crear: src/ui/components/GraphViewerThree.js
   class GraphViewerThree { ... }
   
2. En app.js:
   // this.graphViewer = new GraphViewer()  ← comentar
   this.graphViewer = new GraphViewerThree()  ← usar 3D
   
3. Listo - Sin afectar Core ni API
   Costo: 1 archivo nuevo + 1 línea en app.js
```

---

## Tamaño de Archivos

```
analyzer.js              ~300 líneas (12 KB)
GraphViewer.js          ~250 líneas (10 KB)
codemapGenerator.js     ~300 líneas (12 KB)
app.js                  ~250 líneas (10 KB)
main.css                ~200 líneas (8 KB)
index.html              ~50 líneas (2 KB)
────────────────────────────────────
TOTAL                   ~1350 líneas (54 KB)

VS Antes:
code_graph_unified.html ~2000 líneas (80 KB) monolítico
```

---

## Ventajas de Esta Estructura

```
✅ MODULAR
  Cada archivo = 1 responsabilidad

✅ ESCALABLE
  Agregar features sin romper existentes

✅ TESTEABLE
  Test cada módulo independientemente

✅ MANTENIBLE
  Fácil encontrar y cambiar código

✅ COLABORATIVO
  Team work sin conflictos de merge

✅ PROFESIONAL
  Sigue patrones reales de industria

✅ REUTILIZABLE
  Core se puede usar en otros proyectos
```

---

## Comparación Visual: Antes vs Después

```
ANTES (Monolítico)
─────────────────────────────────────
code_graph_unified.html (2000+ líneas)
  ├─ HTML
  ├─ CSS (200 líneas)
  ├─ UI (400 líneas)
  ├─ Core (800 líneas)
  ├─ API (300 líneas)
  └─ Lógica mezclada

Problemas:
❌ Difícil cambiar
❌ Imposible testear módulos
❌ Difícil colaborar
❌ No reutilizable


DESPUÉS (Modular)
─────────────────────────────────────
src/
├─ core/analyzer.js (300 líneas)
├─ ui/
│  ├─ components/GraphViewer.js (250)
│  └─ styles/main.css (200)
├─ api/codemapGenerator.js (300)
└─ app.js (250)

Ventajas:
✅ Fácil cambiar
✅ Testeo modular
✅ Colaboración limpia
✅ Core reutilizable
```

---

## Conclusión

```
RECIBISTE:
✅ Arquitectura profesional real
✅ 10 archivos bien organizados
✅ Capas separadas (Core, UI, API)
✅ Documentación completa
✅ Guía VSCode
✅ Sistema modular escalable

AHORA PUEDES:
✅ Cambiar código fácilmente
✅ Agregar features sin romper
✅ Testear módulos aislados
✅ Trabajar en equipo sin conflictos
✅ Expandir sin límite

SIGUIENTE PASO:
1. Descargar carpeta code-graph-unified
2. Abrir en VSCode
3. Seguir VSCODE_GUIDE.md
4. Ejecutar y explorar
5. Modificar algún archivo y ver el cambio inmediato
```

---

**¡Ahora tienes una aplicación profesional, modular y escalable!** 🚀
