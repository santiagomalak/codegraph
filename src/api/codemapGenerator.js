/**
 * codemapGenerator.js — Capa API
 * Responsabilidad: transformar los datos analizados en
 * CODEMAP.md descargable y JSON para agentes IA.
 * NO conoce la UI ni el DOM (excepto para trigger de descarga).
 */

export class CodemapGenerator {
  /**
   * @param {{ files, graph, summary, projectName }} analysisResult
   */
  constructor(analysisResult) {
    this.files = analysisResult.files;
    this.graph = analysisResult.graph;
    this.summary = analysisResult.summary;
    this.projectName = analysisResult.projectName;
  }

  /* ================================================================== */
  /* CODEMAP.md                                                           */
  /* ================================================================== */

  /**
   * Genera el contenido completo del CODEMAP.md
   * @returns {string}
   */
  getCodemapContent() {
    const s = this.summary;
    const now = new Date().toLocaleDateString('es-AR', { dateStyle: 'long' });

    const langList = Object.entries(s.byLang)
      .sort((a, b) => b[1] - a[1])
      .map(([lang, count]) => `${lang} (${count})`)
      .join(', ');

    const topFiles = [...this.files]
      .sort((a, b) => b.lines - a.lines)
      .slice(0, 10)
      .map(f => `  - \`${f.path}\` — ${f.lines} líneas, complejidad ${f.complexity}`)
      .join('\n');

    const errorFiles = this.files
      .filter(f => f.errors.length > 0)
      .sort((a, b) => b.errors.length - a.errors.length)
      .slice(0, 10)
      .map(f => {
        const list = f.errors
          .slice(0, 3)
          .map(e => `    - [${e.type.toUpperCase()}] línea ${e.line}: ${e.msg}`)
          .join('\n');
        return `  - \`${f.path}\` (${f.errors.length} errores)\n${list}`;
      })
      .join('\n');

    const depTree = this._buildDependencyTree();

    const circularSection =
      this.graph.circular.length > 0
        ? `### ⚠️ Dependencias Circulares Detectadas\n${this.graph.circular.map(c => `  - \`${c}\``).join('\n')}`
        : '### ✅ Sin dependencias circulares';

    const allFunctions = this.files
      .filter(f => f.functions.length > 0)
      .map(
        f =>
          `  - \`${f.path}\`: ${f.functions.slice(0, 5).join(', ')}${f.functions.length > 5 ? ` +${f.functions.length - 5}` : ''}`
      )
      .join('\n');

    const allClasses = this.files
      .filter(f => f.classes.length > 0)
      .map(f => `  - \`${f.path}\`: ${f.classes.join(', ')}`)
      .join('\n');

    return `# CODEMAP — ${this.projectName}
> Generado automáticamente por Code Graph Unified · ${now}

---

## 📊 Resumen Ejecutivo

| Métrica              | Valor              |
|----------------------|--------------------|
| Total archivos       | ${s.totalFiles}    |
| Total líneas         | ${s.totalLines.toLocaleString()} |
| Errores detectados   | ${s.totalErrors}   |
| Funciones            | ${s.totalFunctions}|
| Complejidad promedio | ${s.avgComplexity} |
| Dependencias (edges) | ${s.totalEdges}    |
| Deps. circulares     | ${s.circularDeps}  |

**Lenguajes:** ${langList}

---

## 📁 Estructura de Archivos

### Por tamaño (Top 10)
${topFiles || '  (sin archivos)'}

---

## 🔗 Grafo de Dependencias

${circularSection}

### Árbol de imports
\`\`\`
${depTree}
\`\`\`

---

## ⚠️ Errores Detectados

${errorFiles || '  ✅ Sin errores detectados'}

---

## 🔧 Funciones y Clases

### Funciones Exportadas
${allFunctions || '  (ninguna)'}

### Clases
${allClasses || '  (ninguna)'}

---

## 🤖 Notas para Agentes IA

Este proyecto tiene **${s.totalFiles} archivos** con un total de **${s.totalLines.toLocaleString()} líneas**.
Los archivos más críticos (por complejidad o errores) son los que deben priorizarse en revisión.

### Archivos de entrada probables
${
  this._inferEntryPoints()
    .map(f => `- \`${f}\``)
    .join('\n') || '- (no detectados)'
}

### Stack detectado
${
  this._inferStack()
    .map(s => `- ${s}`)
    .join('\n') || '- (no detectado)'
}

---
*CODEMAP generado por [Code Graph Unified](https://github.com/santiagomalak/code-graph-unified)*
`;
  }

  /** Descarga el CODEMAP.md en el navegador */
  downloadCodemap() {
    const content = this.getCodemapContent();
    const filename = `CODEMAP_${this.projectName}_${this._timestamp()}.md`;
    this._triggerDownload(content, filename, 'text/markdown');
  }

  /* ================================================================== */
  /* JSON para IA                                                         */
  /* ================================================================== */

  /**
   * Genera el JSON completo optimizado para agentes IA
   * @returns {object}
   */
  getJsonPayload() {
    return {
      meta: {
        project: this.projectName,
        generated: new Date().toISOString(),
        tool: 'Code Graph Unified v1.0',
      },
      summary: this.summary,
      stack: this._inferStack(),
      entryPoints: this._inferEntryPoints(),
      files: this.files.map(f => ({
        path: f.path,
        lang: f.lang,
        lines: f.lines,
        complexity: f.complexity,
        functions: f.functions,
        classes: f.classes,
        imports: f.imports.map(i => i.module),
        exports: f.exports.map(e => e.name),
        errors: f.errors,
        docCoverage: f.docCoverage,
      })),
      dependencyGraph: {
        edges: this.graph.edges.map(e => ({
          from: e.source?.id || e.source,
          to: e.target?.id || e.target,
          circular: e.circular,
        })),
        circular: this.graph.circular,
      },
    };
  }

  /** Devuelve el JSON como string formateado */
  getJsonContent() {
    return JSON.stringify(this.getJsonPayload(), null, 2);
  }

  /** Descarga el JSON en el navegador */
  downloadJson() {
    const content = this.getJsonContent();
    const filename = `codegraph_${this.projectName}_${this._timestamp()}.json`;
    this._triggerDownload(content, filename, 'application/json');
  }

  /* ================================================================== */
  /* HELPERS PRIVADOS                                                     */
  /* ================================================================== */

  _buildDependencyTree() {
    const lines = [];
    const roots = this.graph.nodes.filter(n => {
      return !this.graph.edges.some(e => (e.target?.id || e.target) === n.id);
    });

    const visited = new Set();
    const print = (nodeId, indent = '') => {
      if (visited.has(nodeId)) {
        lines.push(`${indent}${nodeId} (circular)`);
        return;
      }
      visited.add(nodeId);
      const node = this.graph.nodes.find(n => n.id === nodeId);
      lines.push(`${indent}${node?.name || nodeId}`);
      const children = this.graph.edges
        .filter(e => (e.source?.id || e.source) === nodeId)
        .map(e => e.target?.id || e.target);
      for (const child of children) {
        print(child, indent + '  ');
      }
    };

    for (const root of roots.slice(0, 20)) print(root.id);
    return lines.join('\n') || '(sin dependencias internas)';
  }

  _inferEntryPoints() {
    const candidates = [
      'index.js',
      'index.ts',
      'main.js',
      'main.ts',
      'app.js',
      'app.ts',
      'server.js',
      'server.ts',
      'index.jsx',
      'index.tsx',
      'main.py',
      'app.py',
    ];
    return this.files.filter(f => candidates.includes(f.name)).map(f => f.path);
  }

  _inferStack() {
    const stack = [];
    const names = this.files.map(f => f.name.toLowerCase());
    const hasFile = (...ns) => ns.some(n => names.includes(n));

    if (hasFile('next.config.js', 'next.config.ts')) stack.push('Next.js');
    else if (this.files.some(f => f.imports.some(i => i.module === 'react'))) stack.push('React');

    if (this.files.some(f => f.ext === 'ts' || f.ext === 'tsx')) stack.push('TypeScript');
    if (hasFile('tailwind.config.js', 'tailwind.config.ts')) stack.push('Tailwind CSS');
    if (hasFile('vite.config.js', 'vite.config.ts')) stack.push('Vite');
    if (this.files.some(f => f.imports.some(i => i.module === 'express'))) stack.push('Express.js');
    if (this.files.some(f => f.ext === 'py')) stack.push('Python');
    if (hasFile('docker-compose.yml', 'dockerfile')) stack.push('Docker');
    if (hasFile('dbt_project.yml')) stack.push('dbt');
    if (hasFile('.env', '.env.example', '.env.local')) stack.push('Variables de entorno');

    return stack;
  }

  _timestamp() {
    return new Date().toISOString().slice(0, 10);
  }

  _triggerDownload(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
