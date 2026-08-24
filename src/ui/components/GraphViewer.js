/**
 * GraphViewer.js — Capa UI
 * Responsabilidad: renderizar el grafo con D3.js y emitir eventos
 * de interacción. NO analiza código ni genera reportes.
 *
 * Eventos emitidos (CustomEvent en document):
 *   'node-selected'  → { detail: { node } }
 *   'node-deselected'
 *
 * Modos:
 *   'dependencies' — Grafo de dependencias (force-directed)
 *   'structure'    — Árbol de estructura del proyecto (tree layout)
 */

export class GraphViewer {
  constructor(svgSelector) {
    this.svg = d3.select(svgSelector);
    this.container = null;
    this.sim = null;
    this.selected = null;
    this.mode = 'dependencies'; // 'dependencies' | 'structure'
    this.treeData = null;

    // Colores
    this.COLOR_ERROR = '#f7614f';
    this.COLOR_CIRCULAR = '#c44fff';
    this.COLOR_LINK = '#2a2f45';
    this.COLOR_DIR = '#4f8ef7';
    this.COLOR_FILE = '#4ff7a1';
  }

  /**
   * Establece el modo de visualización
   * @param {'dependencies'|'structure'} mode
   */
  setMode(mode) {
    this.mode = mode;
  }

  /**
   * Establece los datos del árbol de estructura (para modo 'structure')
   * @param {Object} treeData - Datos del árbol de FileTreeViewer
   */
  setTreeData(treeData) {
    this.treeData = treeData;
  }

  /**
   * Renderiza según el modo actual.
   * @param {{ nodes, edges }} graph — salida de CodeAnalyzer
   * @param {{ filterErrors, filterCircular }} options
   */
  render(graph, options = {}) {
    this.svg.selectAll('*').remove();
    this.graph = graph;

    if (this.mode === 'structure') {
      this._renderStructureTree();
    } else {
      this._renderDependencyGraph(graph, options);
    }
  }

  /* =========================
   * MODO 1: DEPENDENCY GRAPH
   * ========================= */
  _renderDependencyGraph(graph, options = {}) {
    // Force SVG to fill container
    const svgNode = this.svg.node();
    if (svgNode) {
      svgNode.style.width = '100%';
      svgNode.style.height = '100%';
      svgNode.style.display = 'block';
    }

    const W = svgNode?.clientWidth || 1200;
    const H = svgNode?.clientHeight || 800;

    // Zoom
    const zoom = d3
      .zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', e => this.container.attr('transform', e.transform));

    this.svg.call(zoom);
    this.container = this.svg.append('g');

    // Defs: marker flecha
    this.svg
      .append('defs')
      .append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', this.COLOR_LINK);

    // Filtrar edges
    let edges = graph.edges;
    if (options.filterCircular === false) edges = edges.filter(e => !e.circular);

    const nodes = graph.nodes.map(n => ({ ...n }));
    const links = edges.map(e => ({ ...e }));

    // Simulación de fuerzas
    this.sim = d3
      .forceSimulation(nodes)
      .force(
        'link',
        d3
          .forceLink(links)
          .id(d => d.id)
          .distance(120)
          .strength(0.5)
      )
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collide', d3.forceCollide(30))
      .force('bounds', this._boundsForce(W, H));

    // Links
    const link = this.container
      .append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('class', d => `graph-link${d.circular ? ' circular' : ''}`)
      .attr('marker-end', 'url(#arrow)');

    // Nodes
    const node = this.container
      .append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('class', 'graph-node')
      .call(this._drag(this.sim))
      .on('click', (event, d) => {
        event.stopPropagation();
        this._selectNode(d, node);
      });

    // Círculo base
    node
      .append('circle')
      .attr('r', d => this._nodeRadius(d))
      .attr('fill', d => (d.errors > 0 ? this.COLOR_ERROR + '22' : d.color + '22'))
      .attr('stroke', d => (d.errors > 0 ? this.COLOR_ERROR : d.color));

    // Label
    node
      .append('text')
      .attr('dy', d => this._nodeRadius(d) + 12)
      .text(d => (d.name.length > 18 ? d.name.slice(0, 16) + '…' : d.name));

    // Badge de errores
    node
      .filter(d => d.errors > 0)
      .append('text')
      .attr('class', 'error-badge')
      .attr('x', d => this._nodeRadius(d) - 2)
      .attr('y', d => -this._nodeRadius(d) + 8)
      .attr('text-anchor', 'middle')
      .text(d => d.errors);

    // Tick
    this.sim.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Auto-center and scale graph
    this._centerGraph(nodes, W, H);

    // Deselect al click en fondo
    this.svg.on('click', () => this._deselectNode(node));

    this._nodeSelection = node;
    this._linkSelection = link;
  }

  _boundsForce(width, height) {
    const margin = 50;
    return () => {
      this.sim.nodes().forEach(node => {
        node.x = Math.max(margin, Math.min(width - margin, node.x));
        node.y = Math.max(margin, Math.min(height - margin, node.y));
      });
    };
  }

  _centerGraph(nodes, width, height) {
    if (!nodes.length) return;

    const minX = d3.min(nodes, d => d.x);
    const maxX = d3.max(nodes, d => d.x);
    const minY = d3.min(nodes, d => d.y);
    const maxY = d3.max(nodes, d => d.y);

    const graphWidth = maxX - minX;
    const graphHeight = maxY - minY;

    if (graphWidth === 0 || graphHeight === 0) return;

    const margin = 50;
    const scale = Math.min(
      (width - 2 * margin) / graphWidth,
      (height - 2 * margin) / graphHeight,
      1
    );

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const transform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(scale)
      .translate(-centerX, -centerY);

    this.svg.transition().duration(500).call(d3.zoom().transform, transform);
  }

  /* =========================
   * MODO 2: PROJECT STRUCTURE TREE
   * ========================= */
  _renderStructureTree() {
    if (!this.treeData) return;

    // Force SVG to fill container
    const svgNode = this.svg.node();
    if (svgNode) {
      svgNode.style.width = '100%';
      svgNode.style.height = '100%';
      svgNode.style.display = 'block';
    }

    // Zoom
    const zoom = d3
      .zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', e => this.container.attr('transform', e.transform));

    this.svg.call(zoom);
    this.container = this.svg.append('g').attr('transform', 'translate(40,40)');

    // Tree layout - reduced horizontal spacing
    const tree = d3.tree().nodeSize([18, 160]);
    const displayData = this.treeData.children
      ? { ...this.treeData, children: this.treeData.children }
      : this.treeData;
    const root = d3.hierarchy(displayData, d => d.children);
    tree(root);

    // Links
    this.container
      .append('g')
      .attr('fill', 'none')
      .attr('stroke', '#3a3f55')
      .attr('stroke-width', 1.5)
      .selectAll('path')
      .data(root.links())
      .join('path')
      .attr(
        'd',
        d3
          .linkHorizontal()
          .x(d => d.y)
          .y(d => d.x)
      );

    // Nodes - skip root node (depth 0) if it has no name
    const descendants = root.descendants().filter(d => d.depth > 0 || d.data.name);

    const node = this.container
      .append('g')
      .selectAll('g')
      .data(descendants)
      .join('g')
      .attr('transform', d => `translate(${d.y},${d.x})`)
      .attr('class', d => `tree-node ${d.data.type}`)
      .style('cursor', d => (d.data.type === 'file' ? 'pointer' : 'default'))
      .on('click', (event, d) => {
        event.stopPropagation();
        if (d.data.type === 'file') {
          this._selectNode(d.data, node);
        } else {
          this._toggleDirectory(d);
        }
      });

    // Circle
    node
      .append('circle')
      .attr('r', d => (d.data.type === 'directory' ? 10 : 8))
      .attr('fill', d => {
        if (d.data.type === 'directory') return this.COLOR_DIR + '33';
        if (d.data.errors > 0) return this.COLOR_ERROR + '33';
        return (d.data.color || this.COLOR_FILE) + '33';
      })
      .attr('stroke', d => {
        if (d.data.type === 'directory') return this.COLOR_DIR;
        if (d.data.errors > 0) return this.COLOR_ERROR;
        return d.data.color || this.COLOR_FILE;
      })
      .attr('stroke-width', 2);

    // Icon
    node
      .append('text')
      .attr('dy', '0.35em')
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .text(d => (d.data.type === 'directory' ? (d._children ? '▶' : '▼') : '📄'));

    // Name
    node
      .append('text')
      .attr('x', d => (d.data.type === 'directory' ? 14 : 12))
      .attr('dy', '0.35em')
      .attr('font-size', '11px')
      .attr('fill', '#e0e4ec')
      .text(d => d.data.name);

    // Badges for files
    node
      .filter(d => d.data.type === 'file')
      .append('text')
      .attr('x', d => 14 + d.data.name.length * 6.5)
      .attr('dy', '0.35em')
      .attr('font-size', '9px')
      .attr('fill', '#8b91a8')
      .text(d => {
        const parts = [];
        if (d.data.lines) parts.push(`${d.data.lines}L`);
        if (d.data.complexity > 5) parts.push(`⟳${d.data.complexity}`);
        if (d.data.errors) parts.push(`⚠${d.data.errors}`);
        return parts.join(' ');
      });

    // Auto-center tree
    this._centerTree(root);

    this._treeRoot = root;
    this._treeNodeSelection = node;
  }

  _toggleDirectory(d) {
    if (d.children) {
      d._children = d.children;
      d.children = null;
    } else {
      d.children = d._children;
      d._children = null;
    }
    this._renderStructureTree();
  }

  _centerTree(root) {
    const nodes = root.descendants().filter(d => d.depth > 0);
    if (nodes.length === 0) return;

    const minY = d3.min(nodes, d => d.x);
    const maxY = d3.max(nodes, d => d.x);
    const minX = d3.min(nodes, d => d.y);
    const maxX = d3.max(nodes, d => d.y);

    const treeWidth = maxX - minX;
    const treeHeight = maxY - minY;

    const svgWidth = this.svg.node().clientWidth || 1200;
    const svgHeight = this.svg.node().clientHeight || 800;

    const scale = Math.min((0.8 * svgWidth) / treeWidth, (0.8 * svgHeight) / treeHeight, 1);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const transform = d3.zoomIdentity
      .translate(svgWidth / 2, svgHeight / 2)
      .scale(scale)
      .translate(-centerX, -centerY);

    this.svg.transition().duration(500).call(d3.zoom().transform, transform);
  }

  /* =========================
   * COMUNES
   * ========================= */
  _nodeRadius(d) {
    return Math.min(28, Math.max(10, Math.sqrt(d.lines || 50) * 1.4));
  }

  _drag(sim) {
    return d3
      .drag()
      .on('start', (e, d) => {
        if (!e.active) sim.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (e, d) => {
        d.fx = e.x;
        d.fy = e.y;
      })
      .on('end', (e, d) => {
        if (!e.active) sim.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
  }

  _selectNode(data, nodeSelection) {
    this.selected = data;
    nodeSelection.classed(
      'selected',
      n => (n.data || n).id === data.id || (n.data || n).path === data.path
    );
    document.dispatchEvent(new CustomEvent('node-selected', { detail: { node: data } }));
  }

  _deselectNode(nodeSelection) {
    this.selected = null;
    nodeSelection.classed('selected', false);
    document.dispatchEvent(new CustomEvent('node-deselected'));
  }

  /** Resaltar nodos conectados al seleccionado (solo modo dependencies) */
  highlightConnections(nodeId) {
    if (this.mode !== 'dependencies') return;
    if (!this._nodeSelection || !this.graph) return;
    const connected = new Set([nodeId]);
    for (const e of this.graph.edges) {
      if (e.source === nodeId || e.source?.id === nodeId) connected.add(e.target?.id || e.target);
      if (e.target === nodeId || e.target?.id === nodeId) connected.add(e.source?.id || e.source);
    }
    this._nodeSelection.style('opacity', n => (connected.has(n.id) ? 1 : 0.25));
  }

  resetHighlight() {
    if (this._nodeSelection) this._nodeSelection.style('opacity', 1);
  }

  destroy() {
    if (this.sim) this.sim.stop();
    this.svg.selectAll('*').remove();
  }
}
