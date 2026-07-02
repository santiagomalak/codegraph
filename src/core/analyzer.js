/**
 * analyzer.js — Capa Core
 * Responsabilidad: análisis AST de archivos, detección de errores,
 * métricas y construcción de grafo de dependencias.
 * NO conoce la UI ni el DOM.
 */

import { parserFactory } from './parsers/ParserFactory.js';
import { pluginRegistry } from './plugins/PluginRegistry.ts';

export class CodeAnalyzer {
  constructor() {
    this.EXTENSIONS = {
      js: { lang: 'JavaScript', color: '#f7d94f' },
      jsx: { lang: 'JSX', color: '#f7d94f' },
      ts: { lang: 'TypeScript', color: '#4f8ef7' },
      tsx: { lang: 'TSX', color: '#4f8ef7' },
      py: { lang: 'Python', color: '#4fbbf7' },
      css: { lang: 'CSS', color: '#f74f9e' },
      scss: { lang: 'SCSS', color: '#f74f9e' },
      md: { lang: 'Markdown', color: '#8b91a8' },
      json: { lang: 'JSON', color: '#4ff7a1' },
      vue: { lang: 'Vue', color: '#42b883' },
    };

    this.IGNORE_DIRS = new Set([
      'node_modules',
      '.git',
      'dist',
      'build',
      '.next',
      '__pycache__',
      '.cache',
      'coverage',
      '.venv',
      'venv',
    ]);

    this.IGNORE_FILES = new Set([
      '.DS_Store',
      '.gitignore',
      '.env',
      '.env.local',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
    ]);
  }

  /**
   * Punto de entrada principal.
   * @param {FileList} fileList — resultado de input[webkitdirectory]
   * @returns {{ files, graph, summary, projectName }}
   */
  async analyzeFiles(fileList) {
    // Hook: inicio de análisis
    await pluginRegistry.emit('onAnalysisStart', { fileCount: fileList.length });

    const files = await this._filterAndRead(fileList);
    if (files.length === 0) throw new Error('No se encontraron archivos válidos.');

    const analyzed = [];
    for (const file of files) {
      const result = this._analyzeFile(file);
      analyzed.push(result);

      // Hook: archivo analizado
      await pluginRegistry.emit('onFileAnalyzed', result);
    }

    const graph = this._buildGraph(analyzed);

    // Hook: grafo construido
    await pluginRegistry.emit('onGraphBuilt', graph);

    const summary = this._buildSummary(analyzed, graph);

    // Hook: análisis completado
    await pluginRegistry.emit('onAnalysisComplete', { files: analyzed, graph, summary });

    return {
      files: analyzed,
      graph,
      summary,
      projectName: this._inferProjectName(fileList),
    };
  }

  /* ------------------------------------------------------------------ */
  /* PRIVATE                                                              */
  /* ------------------------------------------------------------------ */

  async _filterAndRead(fileList) {
    const result = [];
    for (const file of fileList) {
      const parts = file.webkitRelativePath.split('/');

      // Ignorar directorios conocidos
      if (parts.some(p => this.IGNORE_DIRS.has(p))) continue;
      // Ignorar archivos conocidos
      if (this.IGNORE_FILES.has(file.name)) continue;
      // Solo extensiones conocidas
      const ext = file.name.split('.').pop().toLowerCase();
      if (!this.EXTENSIONS[ext]) continue;

      try {
        const content = await file.text();
        result.push({ file, ext, content, path: file.webkitRelativePath });
      } catch (_) {
        /* archivo no legible, saltar */
      }
    }
    return result;
  }

  _analyzeFile({ file, ext, content, path }) {
    const parser = parserFactory.getParser(ext);
    if (!parser) {
      // Fallback para extensiones sin parser (md, json)
      return this._analyzeFallback({ file, ext, content, path });
    }

    const fileInfo = { content, path, name: file.name, ext };
    const parsed = parser.parse(fileInfo);

    return {
      name: file.name,
      path,
      ext,
      lang: this.EXTENSIONS[ext]?.lang || ext,
      color: this.EXTENSIONS[ext]?.color || '#8b91a8',
      size: file.size,
      lines: parsed.metrics.lines,
      imports: parsed.imports,
      exports: parsed.exports,
      functions: parsed.functions,
      classes: parsed.classes,
      errors: parsed.errors,
      complexity: parsed.metrics.complexity,
      docCoverage: parsed.metrics.docCoverage,
    };
  }

  _analyzeFallback({ file, ext, content, path }) {
    const lines = content.split('\n');
    return {
      name: file.name,
      path,
      ext,
      lang: this.EXTENSIONS[ext]?.lang || ext,
      color: this.EXTENSIONS[ext]?.color || '#8b91a8',
      size: file.size,
      lines: lines.length,
      imports: [],
      exports: [],
      functions: [],
      classes: [],
      errors: [],
      complexity: 1,
      docCoverage: 100,
    };
  }

  /* ---- GRAFO DE DEPENDENCIAS ---- */
  _buildGraph(analyzed) {
    const nodes = analyzed.map((f, i) => ({
      id: f.path,
      name: f.name,
      lang: f.lang,
      color: f.color,
      errors: f.errors.length,
      complexity: f.complexity,
      lines: f.lines,
      index: i,
    }));

    const edges = [];
    const edgeSet = new Set();

    for (const f of analyzed) {
      for (const imp of f.imports.filter(i => i.type === 'internal')) {
        // Resolver ruta relativa
        const base = f.path.split('/').slice(0, -1).join('/');
        const resolved = this._resolveRelative(base, imp.module);

        const target = analyzed.find(
          a =>
            a.path === resolved ||
            a.path.startsWith(resolved + '.') ||
            a.path === resolved + '/index.js' ||
            a.path === resolved + '/index.ts'
        );

        if (target) {
          const key = `${f.path}→${target.path}`;
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            edges.push({ source: f.path, target: target.path, circular: false });
          }
        }
      }
    }

    // Detectar dependencias circulares
    const circular = this._detectCircular(edges);
    edges.forEach(e => {
      if (circular.has(`${e.source}→${e.target}`)) e.circular = true;
    });

    return { nodes, edges, circular: [...circular] };
  }

  _resolveRelative(base, rel) {
    const parts = (base + '/' + rel).split('/');
    const stack = [];
    for (const p of parts) {
      if (p === '..') stack.pop();
      else if (p && p !== '.') stack.push(p);
    }
    return stack.join('/');
  }

  _detectCircular(edges) {
    const adj = {};
    for (const e of edges) {
      if (!adj[e.source]) adj[e.source] = [];
      adj[e.source].push(e.target);
    }

    const circular = new Set();
    const visited = new Set();
    const stack = new Set();

    const dfs = (node, path) => {
      visited.add(node);
      stack.add(node);
      for (const neighbor of adj[node] || []) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, [...path, neighbor]);
        } else if (stack.has(neighbor)) {
          // Ciclo detectado
          const cycleStart = path.indexOf(neighbor);
          const cycle = path.slice(cycleStart);
          for (let i = 0; i < cycle.length; i++) {
            circular.add(`${cycle[i]}→${cycle[(i + 1) % cycle.length]}`);
          }
        }
      }
      stack.delete(node);
    };

    for (const node of Object.keys(adj)) {
      if (!visited.has(node)) dfs(node, [node]);
    }

    return circular;
  }

  /* ---- SUMMARY ---- */
  _buildSummary(analyzed, graph) {
    const totalErrors = analyzed.reduce((s, f) => s + f.errors.length, 0);
    const totalLines = analyzed.reduce((s, f) => s + f.lines, 0);
    const totalFuncs = analyzed.reduce((s, f) => s + f.functions.length, 0);
    const avgComplexity = analyzed.length
      ? Math.round(analyzed.reduce((s, f) => s + f.complexity, 0) / analyzed.length)
      : 0;

    const byLang = {};
    for (const f of analyzed) {
      byLang[f.lang] = (byLang[f.lang] || 0) + 1;
    }

    return {
      totalFiles: analyzed.length,
      totalLines,
      totalErrors,
      totalFunctions: totalFuncs,
      avgComplexity,
      totalEdges: graph.edges.length,
      circularDeps: graph.circular.length,
      byLang,
    };
  }

  _inferProjectName(fileList) {
    if (!fileList[0]) return 'Proyecto';
    return fileList[0].webkitRelativePath.split('/')[0] || 'Proyecto';
  }
}
