# Plugin Development Guide

## Overview

The plugin system allows extending Code Graph Unified with:
- **Parsers**: Support new languages/file formats
- **Rules**: Custom linting/detection rules
- **Exporters**: Custom output formats

---

## Quick Start

### 1. Create Plugin File

```typescript
// my-plugin.ts
import type { PluginManifest, PluginContext, ParserPlugin } from '../index.ts';

const myParser: ParserPlugin = {
  name: 'my-custom-parser',
  extensions: ['myext'],
  language: 'MyLang',
  parse: (fileInfo) => {
    // Your parsing logic
    return { imports: [], exports: [], functions: [], classes: [], metrics: {}, errors: [] };
  }
};

const myPlugin: PluginManifest = {
  metadata: {
    name: 'my-awesome-plugin',
    version: '1.0.0',
    description: 'Adds support for .myext files',
    author: 'Your Name',
    type: 'parser',
    entryPoint: 'my-plugin.ts'
  },
  async init(context) {
    context.registerParser(myParser);
  }
};

export default myPlugin;
```

### 2. Register Plugin

```typescript
// In your app initialization
import { pluginRegistry } from './core/plugins/PluginRegistry.ts';
import myPlugin from './my-plugin.ts';

await pluginRegistry.register(myPlugin);
```

---

## Plugin Types Deep Dive

### Parser Plugin

Parse a file and extract structured information.

```typescript
interface ParserPlugin {
  name: string;
  extensions: string[];
  language: string;
  parse(fileInfo: FileInfo): ParseResult;
}
```

**FileInfo Input**:
```typescript
interface FileInfo {
  content: string;      // Full file content
  path: string;         // Relative path from project root
  name: string;         // Filename with extension
  ext: string;          // Extension (e.g., 'js')
}
```

**ParseResult Output**:
```typescript
interface ParseResult {
  imports: ImportInfo[];
  exports: ExportInfo[];
  functions: FunctionInfo[];
  classes: ClassInfo[];
  metrics: MetricsInfo;
  errors: ErrorInfo[];
}
```

**Best Practices**:
- Return empty arrays, not null
- Deduplicate imports/exports/functions/classes
- Calculate metrics: lines, complexity, docCoverage
- Detect language-specific errors

**Example - Minimal Parser**:
```typescript
const minimalParser: ParserPlugin = {
  name: 'txt-parser',
  extensions: ['txt'],
  language: 'Text',
  parse: ({ content }) => ({
    imports: [],
    exports: [],
    functions: [],
    classes: [],
    metrics: {
      cyclomaticComplexity: 1,
      cognitiveComplexity: 0,
      linesOfCode: content.split('\n').length,
      linesOfComment: 0,
      docCoverage: 0,
      maintainabilityIndex: 100
    },
    errors: []
  }
};
```

---

### Rule Plugin

Detect patterns in code lines.

```typescript
interface RulePlugin {
  name: string;
  id: string;                    // Unique: 'custom:my-rule'
  languages: string[];           // ['javascript', 'typescript', ...]
  severity: 'error' | 'warning' | 'info';
  description: string;
  check(line: string, context: RuleContext): RuleViolation | null;
}
```

**RuleContext**:
```typescript
interface RuleContext {
  filePath: string;      // Relative path
  language: string;      // 'javascript', 'python', etc.
  lineNumber: number;    // 1-indexed
  fullContent: string;   // Entire file content
  lines: string[];       // All lines array
}
```

**RuleViolation**:
```typescript
interface RuleViolation {
  message: string;           // Human readable
  line?: number;             // Override line (default: context.lineNumber)
  column?: number;           // Column (optional)
  severity?: 'error' | 'warning' | 'info';  // Override severity
  fix?: (content: string) => string;  // Optional auto-fix
}
```

**Best Practices**:
- Return `null` for no violation (not `undefined`)
- Use precise regex with word boundaries
- Skip comments when appropriate
- Provide auto-fix when possible
- Test edge cases (strings, comments, template literals)

**Example - Detect TODO Comments**:
```typescript
const todoRule: RulePlugin = {
  name: 'todo-comment',
  id: 'custom:todo-comment',
  languages: ['javascript', 'typescript', 'python', 'vue'],
  severity: 'info',
  description: 'Detects TODO comments',
  check(line, context) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') && /TODO/i.test(trimmed)) {
      return {
        message: 'TODO comment found',
        line: context.lineNumber,
        severity: 'info'
      };
    }
    return null;
  }
};
```

---

### Exporter Plugin

Transform analysis results into custom formats.

```typescript
interface ExporterPlugin {
  name: string;
  description: string;
  extension: string;      // e.g., 'mmd', 'plantuml', 'csv'
  mimeType: string;       // 'text/plain', 'application/json', etc.
  export(data: ExportData, options?: ExportOptions): string | Blob | Promise<string | Blob>;
}
```

**ExportData**:
```typescript
interface ExportData {
  files: FileAnalysis[];
  graph: DependencyGraph;
  summary: ProjectSummary;
  projectName: string;
  analyzedAt: string;
}
```

**ExportOptions**:
```typescript
interface ExportOptions {
  pretty?: boolean;
  includeContent?: boolean;
  minify?: boolean;
  format?: string;
}
```

**Example - CSV Exporter**:
```typescript
const csvExporter: ExporterPlugin = {
  name: 'csv-dependencies',
  description: 'Export dependencies as CSV',
  extension: 'csv',
  mimeType: 'text/csv',
  export: async (data) => {
    const headers = ['Source', 'Target', 'Type', 'Circular'];
    const rows = data.graph.edges.map(e => [
      e.source,
      e.target,
      e.type || 'import',
      e.circular ? 'yes' : 'no'
    ]);
    return [headers, ...rows].map(r => r.join(',')).join('\n');
  }
};
```

---

## Plugin Registration

### Register at Startup

```typescript
import { pluginRegistry } from './core/plugins/PluginRegistry.ts';
import myPlugin from './my-plugin.ts';

async function initializePlugins() {
  await pluginRegistry.register(myPlugin);
}
```

### Configuration

```typescript
// In plugin manifest
configSchema: {
  enableFeature: { type: 'boolean', default: true },
  apiKey: { type: 'string', default: '' },
  threshold: { type: 'number', default: 10 }
}

// In plugin init
async init(context) {
  const config = context.config as { enableFeature: boolean; threshold: number };
  if (config.enableFeature) {
    // Use config.threshold
  }
}

// User can override via:
pluginRegistry.setConfig('my-plugin', { threshold: 20 });
```

---

## Hooks

### Available Hooks

| Hook | Data Payload | Use Case |
|------|--------------|----------|
| `onAnalysisStart` | `{ fileCount }` | Progress init, timer start |
| `onFileAnalyzed` | `FileAnalysis` | Live updates, logging |
| `onGraphBuilt` | `DependencyGraph` | Post-process graph |
| `onExport` | `{ format, data }` | Transform export |
| `onAnalysisComplete` | `{ files, graph, summary }` | Final stats, notifications |
| `onError` | `{ error, context }` | Error tracking |

### Subscribing

```typescript
async init(context) {
  context.on('onFileAnalyzed', async (file) => {
    if (file.errors.length > 10) {
      this.logger.warn(`High error count in ${file.path}`);
    }
  });

  context.on('onGraphBuilt', async (graph) => {
    if (graph.circular.length > 0) {
      this.logger.error(`Circular deps detected: ${graph.circular.length}`);
    }
  });

  // Cleanup
  return {
    destroy: async () => {
      this.off('onFileAnalyzed', handler);
    }
  };
}
```

---

## Publishing Plugins

### Package Structure

```
my-codegraph-plugin/
├── package.json
├── src/
│   ├── index.ts          # Main export
│   ├── parser.ts         # ParserPlugin
│   ├── rules.ts          # RulePlugin[]
│   └── exporter.ts       # ExporterPlugin
├── README.md
├── CHANGELOG.md
└── LICENSE
```

### package.json

```json
{
  "name": "codegraph-plugin-mylang",
  "version": "1.0.0",
  "description": "CodeGraph plugin for MyLang",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "prepublishOnly": "npm run build && npm test"
  },
  "peerDependencies": {
    "code-graph-unified": ">=2.0.0"
  },
  "keywords": ["codegraph", "plugin", "parser", "mylang"],
  "license": "MIT"
}
```

### Publishing

```bash
npm login
npm publish --access public
```

---

## Testing Plugins

### Unit Testing

```typescript
// my-parser.test.ts
import { describe, it, expect } from 'vitest';
import { myParser } from './my-parser.ts';

describe('MyParser', () => {
  it('parses imports correctly', () => {
    const content = `import foo from './foo'\nimport { bar } from 'bar'`;
    const result = myParser.parse({ content, path: 'test.myext', name: 'test.myext', ext: 'myext' });
    expect(result.imports).toHaveLength(2);
    expect(result.imports[0].module).toBe('./foo');
    expect(result.imports[1].module).toBe('bar');
  });

  it('handles empty files', () => {
    const result = myParser.parse({ content: '', path: 'empty.myext', name: 'empty.myext', ext: 'myext' });
    expect(result.imports).toHaveLength(0);
    expect(result.functions).toHaveLength(0);
  });
});
```

### Integration Testing

```typescript
// integration.test.ts
import { describe, it, expect } from 'vitest';
import { pluginRegistry } from '../core/plugins/PluginRegistry.ts';
import myPlugin from './my-plugin.ts';

describe('Plugin Integration', () => {
  it('registers and works with analyzer', async () => {
    await pluginRegistry.register(myPlugin);
    const parser = pluginRegistry._getExternalParser('myext');
    expect(parser).toBeDefined();
    expect(parser?.name).toBe('my-custom-parser');
  });
});
```

---

## Best Practices

### Performance
- Use `matchAll` with regex for streaming matches
- Avoid synchronous operations on large files
- Cache compiled regexes
- Use `Set`/`Map` for deduplication

### Error Handling
```typescript
parse(fileInfo) {
  try {
    // parsing logic
  } catch (err) {
    return {
      imports: [],
      exports: [],
      functions: [],
      classes: [],
      metrics: { cyclomaticComplexity: 1, cognitiveComplexity: 0, linesOfCode: 0, linesOfComment: 0, docCoverage: 0, maintainabilityIndex: 0 },
      errors: [{
        type: 'error',
        msg: `Parse failed: ${err.message}`,
        line: 1,
        snippet: ''
      }]
    };
  }
}
```

### Type Safety
```typescript
// Use strict types
import type { ParserPlugin, ParseResult, ImportInfo } from '../index.ts';

const myParser: ParserPlugin = {
  // TypeScript enforces correct return types
};
```

---

## Debugging Plugins

### Enable Debug Logging

```typescript
async init(context) {
  context.logger.debug('Plugin initializing', { name: this.metadata.name });
  context.on('onFileAnalyzed', (file) => {
    context.logger.debug('File analyzed', { path: file.path, errors: file.errors.length });
  });
}
```

### Inspector Panel

Open DevTools → Console:
```javascript
// List registered plugins
pluginRegistry.getAllPlugins().map(p => p.metadata.name)

// Check parsers
pluginRegistry._getAllExternalParsers()

// Check rules
pluginRegistry._getAllExternalRules()

// Check exporters
pluginRegistry._getAllExternalExporters()
```

---

## Publishing Checklist

- [ ] `package.json` with correct metadata
- [ ] `README.md` with usage examples
- [ ] `CHANGELOG.md` for versions
- [ ] TypeScript types exported (`.d.ts`)
- [ ] Tests passing (`npm test`)
- [ ] Build outputs to `dist/` (`npm run build`)
- [ ] Peer dependency on `code-graph-unified`
- [ ] License file (MIT recommended)
- [ ] Semantic versioning (1.0.0, 1.1.0, 2.0.0)
- [ ] GitHub repository with issues enabled

---

## Example Plugins in Repo

| Plugin | Type | Location |
|--------|------|----------|
| `vue-parser.ts` | Parser | `src/core/plugins/examples/vue-parser.ts` |
| `no-console-log-rule.ts` | Rule | `src/core/plugins/examples/no-console-log-rule.ts` |
| `mermaid-exporter.ts` | Exporter | `src/core/plugins/examples/mermaid-exporter.ts` |
| `essentials-plugin.ts` | Bundle | `src/core/plugins/examples/essentials-plugin.ts` |

---

## Advanced: Transformer Plugins (Future)

```typescript
interface TransformerPlugin {
  name: string;
  transform(data: AnalysisResult): AnalysisResult;
}

// Use case: Post-process analysis results
// - Filter internal dependencies
// - Add computed fields
// - Merge external data
```

---

## Migration Guide

### v1 → v2

| v1 | v2 |
|----|----|
| `registerParser(parser)` | `context.registerParser(parser)` |
| `parserFactory.register(parser)` | `context.registerParser(parser)` |
| `plugin.on('file', cb)` | `context.on('onFileAnalyzed', cb)` |

---

## Support

- Issues: GitHub Issues
- Discussions: GitHub Discussions
- Security: Private security advisory