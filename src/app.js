/**
 * app.js — Orquestador
 * Responsabilidad: instanciar módulos, conectar eventos,
 * manejar el flujo de la aplicación.
 * NO analiza código, NO dibuja grafo, NO genera exportaciones.
 */

import { wrap } from 'comlink';
import { GraphViewer } from './ui/components/GraphViewer.js';
import { CodemapGenerator } from './api/codemapGenerator.js';
import { IncrementalAnalyzer } from './core/incrementalAnalyzer.js';
import { requestDirectoryHandle } from './utils/fsAccess.js';
import { FileTreeViewer } from './ui/components/FileTreeViewer.js';
import './ui/styles/main.css';

class CodeGraphApp {
  constructor() {
    const worker = new Worker(new URL('@workers/analyzer.worker.js', import.meta.url), {
      type: 'module',
    });
    const workerAnalyzer = wrap(worker);
    this.analyzer = new IncrementalAnalyzer(workerAnalyzer);
    this.graphViewer = new GraphViewer('#graphSvg');
    this.fileTreeViewer = new FileTreeViewer('#fileTreeContainer');
    this.codemapGenerator = null;
    this.analysisResult = null;
    this.projectDirHandle = null;

    this.fileTreeViewer.setCallbacks({
      onFileSelect: node => this._onFileTreeSelect(node),
    });

    this._bindUI();
    this._bindEvents();
  }

  /* ================================================================== */
  /* BINDING UI                                                           */
  /* ================================================================== */

  _bindUI() {
    this.$folderInput = document.getElementById('folderInput');
    this.$projectInfo = document.getElementById('projectInfo');
    this.$exportSection = document.getElementById('exportSection');
    this.$filterSection = document.getElementById('filterSection');
    this.$saveToProjectSection = document.getElementById('saveToProjectSection');
    this.$emptyState = document.getElementById('emptyState');
    this.$loadingState = document.getElementById('loadingState');
    this.$inspector = document.getElementById('inspector');
    this.$inspectorTitle = document.getElementById('inspectorTitle');

    // Stats
    this.$statFiles = document.getElementById('statFiles');
    this.$statLines = document.getElementById('statLines');
    this.$statErrors = document.getElementById('statErrors');
    this.$statDeps = document.getElementById('statDeps');
    this.$projectName = document.getElementById('projectName');

    // Inspector tabs
    this.$tabs = document.querySelectorAll('.tab');
    this.$tabContents = {
      overview: document.getElementById('tabOverview'),
      errors: document.getElementById('tabErrors'),
      deps: document.getElementById('tabDeps'),
      ai: document.getElementById('tabAi'),
    };

    // Inspector content
    this.$overviewContent = document.getElementById('overviewContent');
    this.$errorsContent = document.getElementById('errorsContent');
    this.$depsContent = document.getElementById('depsContent');
    this.$aiContent = document.getElementById('aiContent');

    // Botones exportar
    this.$btnCodemap = document.getElementById('btnCodemap');
    this.$btnJson = document.getElementById('btnJson');
    this.$btnCopyAi = document.getElementById('btnCopyAi');
    this.$btnSaveToProject = document.getElementById('btnSaveToProject');

    // Filtros
    this.$filterErrors = document.getElementById('filterErrors');
    this.$filterCircular = document.getElementById('filterCircular');

    // View mode toggle
    this.$viewModeToggle = document.getElementById('viewModeToggle');
    this.$viewModeLabel = document.getElementById('viewModeLabel');

    // Close inspector
    document.getElementById('closeInspector').addEventListener('click', () => {
      this.$inspector.style.display = 'none';
      this.graphViewer.resetHighlight();
    });
  }

  /* ================================================================== */
  /* BINDING EVENTOS                                                      */
  /* ================================================================== */

  _bindEvents() {
    // Carga de carpeta
    this.$folderInput.addEventListener('change', e => this._onFolderSelected(e));

    // Exportaciones
    this.$btnCodemap.addEventListener('click', () => this.codemapGenerator?.downloadCodemap());
    this.$btnJson.addEventListener('click', () => this.codemapGenerator?.downloadJson());
    this.$btnCopyAi.addEventListener('click', () => {
      navigator.clipboard.writeText(this.$aiContent.textContent).then(() => {
        this.$btnCopyAi.textContent = '✓ Copiado';
        setTimeout(() => {
          this.$btnCopyAi.textContent = 'Copiar JSON';
        }, 1500);
      });
    });

    // Guardar en proyecto (File System Access API)
    this.$btnSaveToProject.addEventListener('click', () => this._saveToProject());

    // Filtros
    this.$filterErrors.addEventListener('change', () => this._rerender());
    this.$filterCircular.addEventListener('change', () => this._rerender());

    // View mode toggle
    this.$viewModeToggle.addEventListener('change', () => this._toggleViewMode());

    // Node selected (GraphViewer emite CustomEvent)
    document.addEventListener('node-selected', e => this._onNodeSelected(e.detail.node));
    document.addEventListener('node-deselected', () => {
      this.$inspector.style.display = 'none';
      this.graphViewer.resetHighlight();
    });

    // Tabs inspector
    this.$tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.$tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        Object.entries(this.$tabContents).forEach(([key, el]) => {
          el.classList.toggle('hidden', key !== tab.dataset.tab);
        });
      });
    });
  }

  /* ================================================================== */
  /* FLUJO PRINCIPAL                                                      */
  /* ================================================================== */

  async _onFolderSelected(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    this._setLoading(true);

    try {
      this.analysisResult = await this.analyzer.analyzeFiles(files);
      this.codemapGenerator = new CodemapGenerator(this.analysisResult);

      this._updateSidebar(this.analysisResult);
      this._renderGraph();
      this._renderFileTree(this.analysisResult);
    } catch (err) {
      console.error('[CodeGraphApp] Error en análisis:', err);
      alert(`Error al analizar: ${err.message}`);
    } finally {
      this._setLoading(false);
    }

    // Reset input para poder recargar la misma carpeta
    e.target.value = '';
  }

  _renderFileTree(analysisResult) {
    this.fileTreeViewer.setData(analysisResult.files);
    // Pasar datos de árbol al GraphViewer para modo estructura
    this.graphViewer.setTreeData(this.fileTreeViewer.getTreeData());
    const fileTreePanel = document.getElementById('fileTreePanel');
    if (fileTreePanel) fileTreePanel.style.display = 'flex';
  }

  _renderGraph() {
    const options = {
      filterErrors: this.$filterErrors.checked,
      filterCircular: this.$filterCircular.checked,
    };
    this.graphViewer.render(this.analysisResult.graph, options);
  }

  _rerender() {
    if (this.analysisResult) this._renderGraph();
  }

  _toggleViewMode() {
    const isStructure = this.$viewModeToggle.checked;
    this.graphViewer.setMode(isStructure ? 'structure' : 'dependencies');
    this.$viewModeLabel.textContent = isStructure ? 'Estructura' : 'Dependencias';
    this._rerender();
  }

  /* ================================================================== */
  /* SIDEBAR                                                              */
  /* ================================================================== */

  _updateSidebar({ summary, projectName }) {
    this.$projectName.textContent = projectName;
    this.$statFiles.textContent = summary.totalFiles;
    this.$statLines.textContent = summary.totalLines.toLocaleString();
    this.$statErrors.textContent = summary.totalErrors;
    this.$statDeps.textContent = summary.totalEdges;

    this.$projectInfo.style.display = '';
    this.$exportSection.style.display = '';
    this.$filterSection.style.display = '';
    this.$saveToProjectSection.style.display = '';
    this.$emptyState.style.display = 'none';
  }

  /* ================================================================== */
  /* INSPECTOR                                                            */
  /* ================================================================== */

  _onNodeSelected(node) {
    const file = this.analysisResult?.files.find(f => f.path === node.id);
    if (!file) return;

    this.$inspectorTitle.textContent = file.name;
    this.$inspector.style.display = '';

    this._renderTabOverview(file);
    this._renderTabErrors(file);
    this._renderTabDeps(file);
    this._renderTabAi(file);

    this.graphViewer.highlightConnections(node.id);

    // Resetear a tab overview
    this.$tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === 'overview'));
    Object.entries(this.$tabContents).forEach(([k, el]) =>
      el.classList.toggle('hidden', k !== 'overview')
    );
  }

  _onFileTreeSelect(node) {
    // Seleccionar el nodo correspondiente en el grafo
    this.graphViewer.highlightConnections(node.path);

    // Simular el evento node-selected para que se abra el inspector
    const event = new CustomEvent('node-selected', {
      detail: { node: { id: node.path, name: node.name } },
    });
    document.dispatchEvent(event);
  }

  _renderTabOverview(file) {
    const rows = [
      ['Ruta', file.path],
      ['Lenguaje', file.lang],
      ['Líneas', file.lines.toLocaleString()],
      ['Funciones', file.functions.length],
      ['Clases', file.classes.length],
      ['Complejidad', file.complexity],
      ['Doc. coverage', `${file.docCoverage}%`],
      ['Imports', file.imports.length],
      ['Exports', file.exports.length],
      ['Errores', file.errors.length],
    ];

    this.$overviewContent.innerHTML = rows
      .map(
        ([k, v]) =>
          `<div class="metric-row">
        <span class="metric-key">${k}</span>
        <span class="metric-val">${v}</span>
      </div>`
      )
      .join('');
  }

  _renderTabErrors(file) {
    if (file.errors.length === 0) {
      this.$errorsContent.innerHTML = '<p class="empty-msg">✅ Sin errores detectados</p>';
      return;
    }
    this.$errorsContent.innerHTML = file.errors
      .map(
        e =>
          `<div class="error-item">
        <div class="error-type">${e.type}</div>
        <div class="error-line">Línea ${e.line}</div>
        <div class="error-msg">${e.msg}</div>
        ${e.snippet ? `<div class="error-line" style="margin-top:4px;opacity:.7">${this._escape(e.snippet)}</div>` : ''}
      </div>`
      )
      .join('');
  }

  _renderTabDeps(file) {
    if (file.imports.length === 0) {
      this.$depsContent.innerHTML = '<p class="empty-msg">Sin imports</p>';
      return;
    }
    this.$depsContent.innerHTML = file.imports
      .map(
        imp =>
          `<div class="dep-item">
        <span class="dep-badge ${imp.type}">${imp.type === 'internal' ? 'local' : 'npm'}</span>
        <span>${this._escape(imp.module)}</span>
      </div>`
      )
      .join('');
  }

  _renderTabAi(file) {
    const payload = {
      path: file.path,
      lang: file.lang,
      lines: file.lines,
      complexity: file.complexity,
      functions: file.functions,
      classes: file.classes,
      imports: file.imports.map(i => i.module),
      exports: file.exports.map(e => e.name),
      errors: file.errors,
    };
    this.$aiContent.textContent = JSON.stringify(payload, null, 2);
  }

  /* ================================================================== */
  /* HELPERS                                                              */
  /* ================================================================== */

  _setLoading(loading) {
    this.$loadingState.style.display = loading ? '' : 'none';
    this.$emptyState.style.display = loading ? 'none' : this.analysisResult ? 'none' : '';
  }

  _escape(str) {
    return String(str).replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
  }

  async _saveToProject() {
    if (!this.analysisResult) return;

    try {
      this.$btnSaveToProject.disabled = true;
      this.$btnSaveToProject.textContent = '⏳ Guardando...';

      if (!this.projectDirHandle) {
        this.projectDirHandle = await requestDirectoryHandle();
      }

      const fileName = await this._writeCodeMapFile(this.projectDirHandle);

      this.$btnSaveToProject.textContent = `✅ Guardado: ${fileName}`;
      setTimeout(() => {
        this.$btnSaveToProject.textContent = '💾 Guardar CODEMAP.json';
        this.$btnSaveToProject.disabled = false;
      }, 3000);
    } catch (err) {
      console.error('[CodeGraphApp] Error guardando en proyecto:', err);
      this.$btnSaveToProject.textContent = '❌ Error al guardar';
      this.$btnSaveToProject.disabled = false;
      setTimeout(() => {
        this.$btnSaveToProject.textContent = '💾 Guardar CODEMAP.json';
      }, 3000);
    }
  }

  async _writeCodeMapFile(directoryHandle) {
    const projectName = this.analysisResult.projectName || 'project';
    const safeName = projectName.replace(/[^a-z0-9-_]/gi, '_');
    const fileName = `CODEMAP_${safeName}.json`;

    const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });

    const payload = {
      meta: {
        project: projectName,
        generated: new Date().toISOString(),
        tool: 'Code Graph Unified v2.0',
        version: '2.0',
      },
      summary: this.analysisResult.summary,
      files: this.analysisResult.files.map(f => ({
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
        edges: this.analysisResult.graph.edges.map(e => ({
          from: e.source?.id || e.source,
          to: e.target?.id || e.target,
          circular: e.circular,
        })),
        circular: this.analysisResult.graph.circular,
      },
    };

    const content = JSON.stringify(payload, null, 2);
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();

    return fileName;
  }
}

/* ------------------------------------------------------------------ */
/* INIT                                                                 */
/* ------------------------------------------------------------------ */
document.addEventListener('DOMContentLoaded', () => {
  window.app = new CodeGraphApp();
});
