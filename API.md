# Code Graph Unified - API Reference

## Overview

This document describes the public APIs, plugin interfaces, and extension points for Code Graph Unified.

---

## Core Classes

### CodeAnalyzer

Main analysis engine. Pure logic, no DOM dependencies.

```typescript
import { CodeAnalyzer } from './core/analyzer.js';

const analyzer = new CodeAnalyzer();

// Analyze files from <input type="file" webkitdirectory>
const result = await analyzer.analyzeFiles(fileList);
```

#### `analyzeFiles(fileList: FileList): Promise<AnalysisResult>`

Main entry point. Analyzes a FileList from `<input type="file" webkitdirectory>`.

**Parameters**:
- `fileList`: FileList from `<input type="file" webkitdirectory multiple>`

**Returns**: `Promise<AnalysisResult>`

**Throws**: `Error` if no valid files found

---

### AnalysisResult

```typescript
interface AnalysisResult {
  files: FileAnalysis[];
  graph: DependencyGraph;
  summary: ProjectSummary;
  projectName: string;
}
```

#### FileAnalysis
```typescript
interface FileAnalysis {
  name: string;           // filename
  path: string;           // relative path from project root
  ext: string;            // file extension
  lang: string;           // language name
  color: string;          // hex color for UI
  size: number;           // file size in bytes
  lines: number;          // total lines
  imports: ImportInfo[];
  exports: ExportInfo[];
  functions: string[];    // function names
  classes: string[];      // class names
  errors: ErrorInfo[];    // detected issues
  complexity: number;     // cyclomatic complexity
  docCoverage: number;    // documentation coverage %
}
```

#### ImportInfo
```typescript
interface ImportInfo {
  module: string;         // module path/name
  type: 'internal' | 'external';  // relative vs npm
}
```

#### ExportInfo
```typescript
interface ExportInfo {
  name: string;           // export name
  type: 'named' | 'default' | 'type';
}
```

#### ErrorInfo
```typescript
interface ErrorInfo {
  type: 'debug' | 'todo' | 'fixme' | 'hack' | 'security' | 'style' | 'error';
  msg: string;            // human-readable message
  line: number;           // line number (1-indexed)
  snippet: string;        // code snippet (max 80 chars)
}
```

#### DependencyGraph
```typescript
interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  circular: string[];     // ["a→b", "b→c", "c→a"]
}

interface GraphNode {
  id: string;             // file path
  name: string;           // filename
  lang: string;           // language
  color: string;          // hex color
  errors: number;         // error count
  complexity: number;     // complexity
  lines: number;          // line count
  index: number;          // array index
}

interface GraphEdge {
  source: string;         // source file path
  target: string;         // target file path
  circular: boolean;      // part of cycle
}
```

#### ProjectSummary
```typescript
interface ProjectSummary {
  totalFiles: number;
  totalLines: number;
  totalErrors: number;
  totalFunctions: number;
  avgComplexity: number;
  totalEdges: number;
  circularDeps: number;
  byLang: Record<string, number>;
}
```

---

### IncrementalAnalyzer

Wrapper for cached, incremental analysis using IndexedDB.

```typescript
import { IncrementalAnalyzer } from './core/incrementalAnalyzer.js';
import { wrap } from 'comlink';

const worker = new Worker(new URL('@workers/analyzer.worker.js', import.meta.url), { type: 'module' });
const workerAnalyzer = wrap(worker);
const analyzer = new IncrementalAnalyzer(workerAnalyzer);

// Full scan (ignores cache)
const result = await analyzer.analyzeFiles(files, { forceFullScan: true });

// Incremental (uses cache)
const result = await analyzer.analyzeFiles(files);

// Cache management
await analyzer.clearCache();
const info = await analyzer.getCacheInfo();  // { count, lastScan, projectHash }
```

---

### CodemapGenerator

Generates exports for AI agents and documentation.

```typescript
import { CodemapGenerator } from './api/codemapGenerator.js';

const generator = new CodemapGenerator(analysisResult);

// Markdown for humans
const markdown = generator.getCodemapContent();
generator.downloadCodemap();  // triggers download

// JSON for AI agents
const json = generator.getJsonPayload();  // structured object
const jsonString = generator.getJsonContent();  // formatted string
generator.downloadJson();  // triggers download
```

#### JSON Payload Structure
```typescript
{
  meta: {
    project: string;
    generated: string;      // ISO timestamp
    tool: 'Code Graph Unified v2.0';
    version: '2.0';
  },
  summary: ProjectSummary,
  stack: string[],          // detected tech stack
  entryPoints: string[],    // detected entry points
  files: FileAnalysis[],
  dependencyGraph: {
    edges: { from: string, to: string, circular: boolean }[],
    circular: string[]
  }
}
```

---

## Plugin System API

### PluginManifest

```typescript
interface PluginManifest {
  metadata: PluginMetadata;
  init: (context: PluginContext) => Promise<void> | void;
  destroy?: () => Promise<void> | void;
}

interface PluginMetadata {
  name: string;              // unique identifier
  version: string;           // semver (1.0.0)
  description: string;
  author: string;
  type: 'parser' | 'rule' | 'exporter' | 'transformer';
  entryPoint: string;
  dependencies?: string[];
  configSchema?: Record<string, unknown>;
}
```

### PluginContext

Provided to plugins during `init(context)`.

```typescript
interface PluginContext {
  // Parser registration
  registerParser(parser: ParserPlugin): void;
  getParser(extension: string): ParserPlugin | undefined;
  getAllParsers(): ParserPlugin[];

  // Rule registration
  registerRule(rule: RulePlugin): void;
  getRules(language?: string): RulePlugin[];
  getAllRules(): RulePlugin[];

  // Exporter registration
  registerExporter(exporter: ExporterPlugin): void;
  getExporter(name: string): ExporterPlugin | undefined;
  getAllExporters(): ExporterPlugin[];

  // Hooks
  on(hook: HookName, callback: HookCallback): void;
  off(hook: HookName, callback: HookCallback): void;
  emit(hook: HookName, data: unknown): Promise<void>;

  // Utilities
  logger: PluginLogger;
  config: Record<string, unknown>;
}
```

### Hooks

| Hook | Data | When |
|------|------|------|
| `onAnalysisStart` | `{ fileCount: number }` | Before analysis starts |
| `onFileAnalyzed` | `FileAnalysis` | After each file analyzed |
| `onGraphBuilt` | `DependencyGraph` | After graph construction |
| `onExport` | `{ format: string, data: unknown }` | Before export |
| `onAnalysisComplete` | `{ files, graph, summary }` | After full analysis |
| `onError` | `{ error: Error, context: string }` | On any error |

```typescript
// Registering hooks
context.on('onFileAnalyzed', async (file) => {
  if (file.errors.length > 0) {
    logger.warn(`Errors in ${file.path}: ${file.errors.length}`);
  }
});
```

---

### Plugin Types

#### ParserPlugin
```typescript
interface ParserPlugin {
  name: string;
  extensions: string[];      // e.g., ['vue']
  language: string;          // e.g., 'Vue'
  parse(fileInfo: FileInfo): ParseResult;
}

interface FileInfo {
  content: string;
  path: string;
  name: string;
  ext: string;
}

interface ParseResult {
  imports: ImportInfo[];
  exports: ExportInfo[];
  functions: FunctionInfo[];
  classes: ClassInfo[];
  metrics: MetricsInfo;
  errors: ErrorInfo[];
}
```

**Example**: `vue-parser.ts`
```typescript
const vueParser: ParserPlugin = {
  name: 'vue-parser',
  extensions: ['vue'],
  language: 'Vue',
  parse: (content) => {
    // Extract <script>, <template>, <style> blocks
    // Return ParseResult
  }
};
```

#### RulePlugin
```typescript
interface RulePlugin {
  name: string;
  id: string;                // unique identifier
  languages: string[];       // applicable languages
  severity: 'error' | 'warning' | 'info';
  description: string;
  check(line: string, context: RuleContext): RuleViolation | null;
}

interface RuleContext {
  filePath: string;
  language: string;
  lineNumber: number;
  fullContent: string;
  lines: string[];
}

interface RuleViolation {
  message: string;
  line?: number;
  column?: number;
  severity?: 'error' | 'warning' | 'info';
  fix?: (content: string) => string;  // optional auto-fix
}
```

**Example**: `no-console-log-rule.ts`
```typescript
const noConsoleLogRule: RulePlugin = {
  name: 'no-console-log',
  id: 'custom:no-console-log',
  languages: ['javascript', 'typescript', 'vue', 'jsx', 'tsx'],
  severity: 'warning',
  description: 'Evita console.log en producción',
  check: (line, context) => {
    if (/\bconsole\.(log|debug|info)\s*\(/.test(line)) {
      return {
        message: 'Evita console.log/debug/info en producción. Usa un logger adecuado.',
        line: context.lineNumber,
        severity: 'warning',
        fix: (content) => content.replace(/console\.(log|debug|info)\s*\(/g, 'logger.$1(')
      };
    }
    return null;
  }
};
```

#### ExporterPlugin
```typescript
interface ExporterPlugin {
  name: string;
  description: string;
  extension: string;         // file extension
  mimeType: string;          // MIME type
  export(data: ExportData, options?: ExportOptions): string | Blob | Promise<string | Blob>;
}

interface ExportData {
  files: FileAnalysis[];
  graph: DependencyGraph;
  summary: ProjectSummary;
  projectName: string;
  analyzedAt: string;
}

interface ExportOptions {
  pretty?: boolean;
  includeContent?: boolean;
  minify?: boolean;
  format?: string;
}
```

**Example**: `mermaid-exporter.ts`
```typescript
const mermaidExporter: ExporterPlugin = {
  name: 'mermaid-diagram',
  description: 'Genera diagrama Mermaid.js',
  extension: 'mmd',
  mimeType: 'text/plain',
  export: async (data, options) => {
    // Generate Mermaid graph TD syntax
    return mermaidString;
  }
};
```

---

## Worker API

### Analyzer Worker (`analyzer.worker.js`)

```javascript
// Entry point for Web Worker
import { expose } from 'comlink';
import { CodeAnalyzer } from '@core/analyzer.js';

const analyzer = new CodeAnalyzer();

expose({
  async analyzeFiles(fileList) {
    const result = await analyzer.analyzeFiles(fileList);
    return result.files;  // Return only files (serializable)
  }
});
```

### Client Usage (Comlink)

```typescript
import { wrap } from 'comlink';

const worker = new Worker(new URL('@workers/analyzer.worker.js', import.meta.url), {
  type: 'module'
});

const analyzer = wrap(worker);

// Returns FileAnalysis[] (serialized via Comlink)
const files = await analyzer.analyzeFiles(fileList);
```

---

## CLI / GitHub Action API

### Entrypoint (`.github/action/entrypoint.js`)

```bash
# Analyze current directory
npx codegraph analyze --path . --format json --output CODEMAP.json

# Fail on errors
npx codegraph analyze --fail-on-errors --fail-on-circular --max-complexity 15

# Output formats
--format json|markdown|mermaid
```

### GitHub Action Usage

```yaml
# .github/workflows/analyze.yml
- uses: santiagomalak/codegraph@main
  with:
    path: '.'
    output-format: 'json'
    output-file: 'CODEMAP.json'
    fail-on-errors: 'true'
    fail-on-circular: 'true'
    max-complexity: 15

# Outputs available:
steps.cg.outputs.total-files
steps.cg.outputs.total-lines
steps.cg.outputs.total-errors
steps.cg.outputs.circular-deps
steps.cg.outputs.avg-complexity
steps.cg.outputs.output-file
```

---

## TypeScript Types (`src/types/index.ts`)

### Core Types
```typescript
export interface FileInfo { ... }
export interface ImportInfo { ... }
export interface ExportInfo { ... }
export interface FunctionInfo { ... }
export interface ClassInfo { ... }
export interface ErrorInfo { ... }
export interface MetricsInfo { ... }
export interface FileAnalysis { ... }
export interface GraphNode { ... }
export interface GraphEdge { ... }
export interface DependencyGraph { ... }
export interface ProjectSummary { ... }
export interface AnalysisResult { ... }
```

### Plugin Types
```typescript
export type PluginType = 'parser' | 'rule' | 'exporter' | 'transformer';
export interface PluginMetadata { ... }
export interface PluginManifest { ... }
export interface PluginContext { ... }
export type HookName = 'onFileAnalyzed' | 'onGraphBuilt' | 'onExport' | 'onAnalysisStart' | 'onAnalysisComplete' | 'onError';
export type HookCallback = (data: unknown, context: PluginContext) => Promise<void> | void;
export interface PluginConfig { ... }
export interface PluginRegistry { ... }
```

---

## Configuration

### `codegraph.config.json` (Optional)

```json
{
  "includePatterns": ["src/**/*", "lib/**/*"],
  "excludePatterns": ["**/*.test.ts", "**/*.spec.ts", "dist/**"],
  "maxFileSize": 1048576,
  "enableMetrics": true,
  "enableErrors": true,
  "enableGraph": true,
  "customRules": [],
  "tsconfigPath": "./tsconfig.json"
}
```

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `CODEGRAPH_DEBUG` | Enable debug logging | `false` |
| `CODEGRAPH_MAX_FILE_SIZE` | Max file size (bytes) | `1048576` |
| `CODEGRAPH_CACHE_TTL` | Cache TTL (ms) | `86400000` (24h) |

---

## Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| `NO_FILES` | No valid files found | Check include/exclude patterns |
| `PARSE_ERROR` | Parser threw exception | Check file syntax |
| `WORKER_ERROR` | Worker crashed | Check browser console |
| `CACHE_ERROR` | IndexedDB error | Clear cache, retry |
| `EXPORT_ERROR` | Export generation failed | Check data validity |
| `WORKER_UNAVAILABLE` | Worker failed to load | Check browser support |

---

## Versioning

- **Semantic Versioning**: MAJOR.MINOR.PATCH
- **Breaking Changes**: MAJOR version bump
- **Deprecation Policy**: 2 minor versions notice

```bash
# Check version
npm list code-graph-unified
# or in browser console:
console.log('Code Graph Unified v2.0.0');
```