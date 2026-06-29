/**
 * GraphViewer.js — Capa UI
 * Responsabilidad: renderizar el grafo con D3.js y emitir eventos
 * de interacción. NO analiza código ni genera reportes.
 *
 * Eventos emitidos (CustomEvent en document):
 *   'node-selected'  → { detail: { node } }
 *   'node-deselected'
 */

export class GraphViewer {
  constructor(svgSelector) {
    this.svg = d3.select(svgSelector);
    this.container = null;
    this.sim = null;
    this.selected = null;

    // Colores
    this.COLOR_ERROR = '#f7614f';
    this.COLOR_CIRCULAR = '#c44fff';
    this.COLOR_LINK = '#2a2f45';
  }

  /**
   * Renderiza el grafo completo.
   * @param {{ nodes, edges }} graph — salida de CodeAnalyzer
   * @param {{ filterErrors, filterCircular }} options
   */
  render(graph, options = {}) {
    this.svg.selectAll('*').remove();
    this.graph = graph;

    const W = this.svg.node().clientWidth || 800;
    const H = this.svg.node().clientHeight || 600;

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

    // Preparar nodes/links para D3 (shallow copy para no mutar originals)
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
      .force('collide', d3.forceCollide(30));

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

    // Deselect al click en fondo
    this.svg.on('click', () => this._deselectNode(node));

    // Guardar referencias para métodos externos
    this._nodeSelection = node;
  }

  /* ---- PRIVADOS ---- */

  _nodeRadius(d) {
    // Radio proporcional a líneas de código, entre 10 y 28
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

  _selectNode(d, nodeSelection) {
    this.selected = d;
    nodeSelection.classed('selected', n => n.id === d.id);
    document.dispatchEvent(new CustomEvent('node-selected', { detail: { node: d } }));
  }

  _deselectNode(nodeSelection) {
    this.selected = null;
    nodeSelection.classed('selected', false);
    document.dispatchEvent(new CustomEvent('node-deselected'));
  }

  /** Resaltar nodos conectados al seleccionado */
  highlightConnections(nodeId) {
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
