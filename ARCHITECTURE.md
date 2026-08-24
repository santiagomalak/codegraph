# Code Graph Unified - Arquitectura del Sistema

## Visión General

Code Graph Unified es una aplicación web de análisis estático de código que transforma proyectos de software en grafos de dependencias interactivos, detecta errores y genera CODEMAPs para agentes IA.

```
┌─────────────────────────────────────────────────────────────────┐
│                        NAVEGADOR (Client)                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Sidebar   │  │  File Tree  │  │      Graph Panel        │  │
│  │  (Controls) │  │  (Navigator)│  │   (D3.js Visualization) │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│         │               │                     │                  │
│         └───────────────┼─────────────────────┘                  │
│                         ▼                                        │
│              ┌─────────────────────────┐                         │
│              │       App.js            │                         │
│              │    (Orchestrator)       │                         │
│              └───────────┬─────────────┘                         │
│                          ▼                                        │
│        ┌────────────────┴────────────────┐                       │
│        ▼                                 ▼                       │
│ ┌─────────────────┐            ┌─────────────────┐             │
│ │  UI Components  │            │  Core Engine    │             │
│ │ - GraphViewer   │            │ - CodeAnalyzer  │             │
│ │ - FileTreeViewer│            │ - PluginRegistry│             │
│ │ - Inspector     │            │ - IncrementalAnalyzer        │
│ └─────────────────┘            └────────┬────────┘             │
│                                           ▼                     │
│                        ┌─────────────────────────┐             │
│                        │   Web Worker            │             │
│                        │   (analyzer.worker.js)  │             │
│                        │   - CodeAnalyzer        │             │
│                        │   - PluginRegistry      │             │
│                        └─────────────────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

## Capas de la Arquitectura

### 1. Capa de Presentación (UI Layer)

**Ubicación**: `src/ui/`

| Componente | Responsabilidad |
|------------|-----------------|
| `GraphViewer.js` | Visualización D3.js del grafo de dependencias + árbol de estructura |
| `FileTreeViewer.js` | Navegador de archivos tipo árbol con badges |
| `main.css` | Sistema de diseño completo (variables CSS, componentes, dark mode) |

**Patrones**:
- Separación estricta: UI no conoce lógica de análisis
- Event-driven communication via CustomEvents
- D3.js para visualizaciones SVG interactivas

### 2. Capa de Orquestación (Orchestration Layer)

**Ubicación**: `src/app.js`

```javascript
class CodeGraphApp {
  // Instancia módulos
  this.analyzer = new IncrementalAnalyzer(workerAnalyzer);
  this.graphViewer = new GraphViewer('#graphSvg');
  this.fileTreeViewer = new FileTreeViewer('#fileTreeContainer');
  
  // Conecta eventos
  document.addEventListener('node-selected', e => this._onNodeSelected(e.detail.node));
}
```

**Responsabilidades**:
- Instanciar y conectar módulos
- Manejar eventos de UI → Core
- Gestionar estado de la aplicación
- Coordinar exportaciones (CODEMAP, JSON, Mermaid)

### 3. Capa Core (Core Layer)

**Ubicación**: `src/core/`

#### 3.1 CodeAnalyzer (`analyzer.js`)
```javascript
class CodeAnalyzer {
  // Análisis principal - pura lógica, sin DOM
  async analyzeFiles(fileList) {
    // 1. Filtrar y leer archivos
    // 2. Parsear con parsers registrados
    // 3. Construir grafo de dependencias
    // 4. Detectar ciclos
    // 5. Calcular métricas
    // 6. Emitir hooks para plugins
  }
}
```

**Responsabilidades**:
- Filtrado de archivos (ignore dirs/files, extensiones válidas)
- Parsing multi-lenguaje via ParserFactory
- Construcción de grafo de dependencias
- Detección de dependencias circulares (DFS)
- Cálculo de métricas (complejidad ciclomática, doc coverage)
- Hooks para plugins

#### 3.2 Plugin System (`src/core/plugins/`)
```
PluginRegistry (singleton)
├── register(manifest) → PluginManifest
├── unregister(name)
├── on/off/emit(hook, callback)
├── registerParser/rule/exporter
└── getPluginConfig(name)

Hooks disponibles:
- onAnalysisStart
- onFileAnalyzed
- onGraphBuilt
├── onExport
- onAnalysisComplete
- onError
```

**Tipos de Plugin**:
| Tipo | Propósito | Ejemplo |
|------|-----------|---------|
| `parser` | Parsing de nuevo lenguaje | `vue-parser.ts` |
| `rule` | Regla de linting custom | `no-console-log-rule.ts` |
| `exporter` | Exportador personalizado | `mermaid-exporter.ts` |
| `transformer` | Transformación de datos | (futuro) |

#### 3.3 IncrementalAnalyzer (`incrementalAnalyzer.js`)
```javascript
class IncrementalAnalyzer {
  async analyzeFiles(fileList, { forceFullScan = false }) {
    // 1. Compute project hash (SHA-256)
    // 2. Compare with cached hash
    // 3. If unchanged → load from IndexedDB
    // 4. Else: diff files, analyze only changed
    // 5. Store results in IndexedDB
  }
}
```

**Características**:
- SHA-256 para detección de cambios
- Cache persistente en IndexedDB
- Invalidación automática de archivos eliminados
- Carga instantánea en scans repetidos

#### 3.4 Parsers (`src/core/parsers/`)
| Parser | Extensiones | Lenguaje |
|--------|-------------|----------|
| JavaScriptParser | js, jsx, ts, tsx | JavaScript/TypeScript |
| TypeScriptParser | ts, tsx | TypeScript (extends JS) |
| PythonParser | py | Python |
| CssParser | css, scss | CSS/SCSS |
| VueParser (plugin) | vue | Vue SFC |

### 4. Capa API (API Layer)

**Ubicación**: `src/api/`

| Módulo | Responsabilidad |
|--------|-----------------|
| `codemapGenerator.js` | Genera CODEMAP.md (markdown) + JSON para agentes IA |

```javascript
class CodemapGenerator {
  getCodemapContent()  // Markdown completo
  downloadCodemap()    // Descarga .md
  getJsonPayload()     // JSON estructurado para IA
  downloadJson()       // Descarga .json
}
```

### 5. Capa de Workers (Worker Layer)

**Ubicación**: `src/workers/analyzer.worker.js`

```javascript
// Web Worker + Comlink para RPC
const analyzer = new CodeAnalyzer();
expose({
  async analyzeFiles(fileList) {
    const result = await analyzer.analyzeFiles(fileList);
    return result.files;
  }
});
```

**Beneficios**:
- No bloquea main thread (UI responsiva)
- Procesamiento paralelo de archivos
- Comlink para RPC type-safe

### 6. Capa de Persistencia (Storage Layer)

**Ubicación**: `src/utils/storage.js`, `src/utils/hash.js`

| Módulo | Tecnología | Propósito |
|--------|------------|-----------|
| `storage.js` | IndexedDB | Cache persistente de análisis |
| `hash.js` | Web Crypto API (SHA-256) | Detección de cambios |

**Schema IndexedDB**:
```
codegraph-db (v1)
├── files (objectStore, keyPath: 'path')
│   ├── path (string, primary)
│   ├── hash (string, indexed)
│   ├── data (object, FileAnalysis)
│   └── timestamp (number)
└── meta (objectStore, keyPath: 'key')
    ├── projectHash
    ├── lastScan
    └── projectName
```

### 7. Capa de Utilidades (Utils Layer)

| Módulo | Propósito |
|--------|-----------|
| `hash.js` | SHA-256 (Web Crypto) + hashString (fallback) |
| `fsAccess.js` | File System Access API wrapper |
| `graphBuilder.js` | Wrapper para métodos internos de CodeAnalyzer |

---

## Flujo de Datos Completo

```
┌──────────────┐
│  User Select │
│  Folder      │
└──────┬───────┘
       ▼
┌──────────────────┐
│  app.js          │
│ _onFolderSelected│
└──────┬───────────┘
       ▼
┌──────────────────────────┐
│ IncrementalAnalyzer      │
│ analyzeFiles()           │
└──────┬───────────────────┘
       ▼
┌──────────────────────────┐
│ Web Worker (Comlink)     │
│ CodeAnalyzer.analyze()   │
└──────┬───────────────────┘
       ▼
┌──────────────────────────┐
│ 1. _filterAndRead()      │  ← Filtra node_modules, .git, etc.
│ 2. _analyzeFile()        │  ← ParserFactory → Parser.parse()
│    - detectImports()     │
│    - detectExports()     │
│    - detectFunctions()   │
│    - detectClasses()     │
│    - detectErrors()      │
│    - calculateMetrics()  │
│ 3. _buildGraph()         │  ← Resolve imports → edges
│ 4. _detectCircular()     │  ← DFS cycle detection
│ 5. _buildSummary()       │  ← Aggregations
└──────┬───────────────────┘
       ▼
┌──────────────────────────┐
│ Hooks (PluginRegistry)   │
│ - onFileAnalyzed         │
│ - onGraphBuilt           │
│ - onAnalysisComplete     │
└──────┬───────────────────┘
       ▼
┌──────────────────────────┐
│ IndexedDB Cache          │
│ - SHA-256 per file       │
│ - Project hash           │
│ - Incremental updates    │
└──────┬───────────────────┘
       ▼
┌──────────────────────────┐
│ UI Render                │
│ - GraphViewer.render()   │
│ - FileTreeViewer.setData()│
│ - Sidebar stats          │
└──────────────────────────┘
```

---

## Communication Patterns

### 1. App → Core (Async)
```javascript
// app.js
this.analysisResult = await this.analyzer.analyzeFiles(files);
```

### 2. Core → Worker (Comlink RPC)
```javascript
// analyzer.worker.js
expose({
  async analyzeFiles(fileList) { ... }
});

// app.js
const workerAnalyzer = wrap(worker);
await workerAnalyzer.analyzeFiles(files);
```

### 3. Core → Plugins (Hooks)
```javascript
// CodeAnalyzer
await pluginRegistry.emit('onFileAnalyzed', result);

// Plugin
context.on('onFileAnalyzed', async (data) => { ... });
```

### 4. UI Events (CustomEvents)
```javascript
// GraphViewer
document.dispatchEvent(new CustomEvent('node-selected', { detail: { node } }));

// app.js
document.addEventListener('node-selected', e => this._onNodeSelected(e.detail.node));
```

---

## Security Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                    BROWSER SANDBOX                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Main Thread│  │ Web Worker  │  │   IndexedDB         │  │
│  │  (UI/Orch)  │  │  (Analysis) │  │  (Cache)            │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                      │            │
│         └────────────────┼──────────────────────┘            │
│                          ▼                                   │
│              ┌─────────────────────┐                         │
│              │  ORIGIN ISOLATION   │                         │
│              │  (Same-Origin Policy)│                        │
│              └─────────────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

**Límites de Seguridad**:
1. **Main Thread**: UI, orchestración, File System Access API
2. **Web Worker**: Análisis pesado, parsing, sin acceso DOM
3. **IndexedDB**: Almacenamiento local, same-origin
4. **File System Access API**: Solo con gesto de usuario, directorio elegido

---

## Tecnologías Clave

| Categoría | Tecnología | Versión | Propósito |
|-----------|------------|---------|-----------|
| Build | Vite | 5.x | Dev server, bundling, HMR |
| Language | TypeScript | 5.3 | Type safety |
| Styling | Tailwind CSS | 3.4 | Utility-first CSS |
| Visualization | D3.js | 7.9 | Graph/tree rendering |
| Worker RPC | Comlink | 4.4 | Worker RPC |
| Crypto | Web Crypto API | Native | SHA-256 hashing |
| Storage | IndexedDB | Native | Persistent cache |
| FS Access | File System Access API | Native | Directory access |
| Testing | Vitest | 1.3 | Unit/integration tests |
| Linting | ESLint + Prettier | 8.x/3.x | Code quality |

---

## Puntos de Extensión

| Punto | Tipo | Descripción |
|-------|------|-------------|
| `pluginRegistry.register(manifest)` | Plugin | Nuevo parser/rule/exporter |
| `context.on('onFileAnalyzed', cb)` | Hook | Reacción a análisis de archivo |
| `context.on('onGraphBuilt', cb)` | Hook | Post-procesamiento de grafo |
| `context.on('onExport', cb)` | Hook | Transformación de exportación |
| `parserFactory.registerParser(parser)` | Parser | Nuevo lenguaje |
| `context.registerRule(rule)` | Rule | Nueva regla de lint |

---

## Escalabilidad y Performance

| Aspecto | Implementación |
|---------|----------------|
| **Incremental Analysis** | SHA-256 diff → solo archivos cambiados |
| **Web Worker** | Offload CPU-intensive parsing |
| **IndexedDB** | Persistent cache, survive reloads |
| **Force-directed Graph** | D3.js forceSimulation (GPU accelerated) |
| **Tree Layout** | d3.tree() horizontal layout |
| **Virtual Scrolling** | FileTreeViewer (large projects) |
| **Debounced Render** | Filter changes debounced |

---

## Testing Strategy

```
src/
├── core/
│   ├── analyzer.test.js          # 14 tests (integration)
│   └── parsers/
│       └── *.test.ts             # Unit tests per parser (TODO)
├── utils/
│   └── *.test.ts                 # Utils tests (TODO)
└── e2e/                          # Playwright (TODO)
```

**Comandos**:
```bash
npm test          # Unit tests (Vitest)
npm run typecheck # TypeScript strict
npm run lint      # ESLint + Prettier
npm run build     # Production build
```

---

## Deployment

### Vercel (Recommended)
```json
{
  "buildCommand": "npm run build:vercel",
  "outputDirectory": "dist/public",
  "framework": "vite"
}
```

### Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npx", "serve", "dist", "-l", "3000"]
```

### Static Hosting
```bash
npm run build
# Sirve ./dist/public con cualquier static server
npx serve dist -l 3000
```

---

## Roadmap Técnico

### Q1 2025
- [ ] VS Code Extension
- [ ] GitHub Action oficial
- [ ] Landing page completa

### Q2 2025
- [ ] Plugin marketplace
- [ ] Real-time collaboration
- [ ] API REST para integración CI/CD

### Q3 2025
- [ ] SaaS version (cloud storage, teams)
- [ ] ML-powered complexity predictions
- [ ] Multi-language support (Go, Rust, Java)