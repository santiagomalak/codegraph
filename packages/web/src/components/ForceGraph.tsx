/**
 * ForceGraph.tsx — El grafo interactivo (SVG + simulación de fuerzas de d3).
 *
 * - d3-force calcula las posiciones.
 * - d3-zoom maneja el zoom/pan (rueda + arrastrar el fondo).
 * - El arrastre de nodos se hace con pointer events de React (más simple que
 *   mezclar el data-join de d3 con React).
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
} from 'd3-force';
import { select } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom';
import type { VizGraph, VizLink, VizNode } from '../graph-model.js';
import { nodeRadius } from '../graph-model.js';

interface Props {
  graph: VizGraph;
  groupByDomain: boolean;
  selectedId: string | null;
  search: string;
  onSelect: (node: VizNode | null) => void;
}

interface Transform {
  x: number;
  y: number;
  k: number;
}

export function ForceGraph({ graph, groupByDomain, selectedId, search, onSelect }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const simRef = useRef<Simulation<VizNode, VizLink> | null>(null);
  const nodesRef = useRef<VizNode[]>([]);
  const linksRef = useRef<VizLink[]>([]);
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 });
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  // Adyacencia para resaltar vecinos
  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const add = (a: string, b: string) => {
      if (!map.has(a)) map.set(a, new Set());
      map.get(a)!.add(b);
    };
    for (const l of graph.links) {
      const s = typeof l.source === 'string' ? l.source : l.source.id;
      const t = typeof l.target === 'string' ? l.target : l.target.id;
      add(s, t);
      add(t, s);
    }
    return map;
  }, [graph]);

  // Medir el contenedor
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Zoom / pan
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const userInteractedRef = useRef(false);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const behavior = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .filter((event: Event) => {
        const target = event.target as Element;
        return !target.closest?.('[data-node]');
      })
      .on('zoom', (event) => {
        if (event.sourceEvent) userInteractedRef.current = true;
        const t = event.transform;
        setTransform({ x: t.x, y: t.y, k: t.k });
      });
    zoomRef.current = behavior;
    select(svg).call(behavior);
    return () => {
      select(svg).on('.zoom', null);
    };
  }, []);

  /** Ajusta el zoom para que todo el grafo entre en pantalla. */
  const fitView = useCallback(() => {
    const svg = svgRef.current;
    const zoom = zoomRef.current;
    const ns = nodesRef.current.filter((n) => n.x != null && n.y != null);
    if (!svg || !zoom || ns.length === 0) return;

    const pad = 70;
    const minX = Math.min(...ns.map((n) => n.x!)) - pad;
    const maxX = Math.max(...ns.map((n) => n.x!)) + pad;
    const minY = Math.min(...ns.map((n) => n.y!)) - pad;
    const maxY = Math.max(...ns.map((n) => n.y!)) + pad;
    const w = svg.clientWidth || 800;
    const h = svg.clientHeight || 600;
    const k = Math.max(0.1, Math.min(2, Math.min(w / (maxX - minX), h / (maxY - minY))));
    const tx = w / 2 - (k * (minX + maxX)) / 2;
    const ty = h / 2 - (k * (minY + maxY)) / 2;

    select(svg)
      .transition()
      .duration(450)
      .call(zoom.transform as never, zoomIdentity.translate(tx, ty).scale(k));
  }, []);

  // Construir / reconstruir la simulación cuando cambian los datos o el modo
  useEffect(() => {
    // Clonamos para que d3 pueda mutar posiciones sin tocar las props
    const nodes: VizNode[] = graph.nodes.map((n) => ({ ...n }));
    const links: VizLink[] = graph.links.map((l) => ({ ...l }));
    nodesRef.current = nodes;
    linksRef.current = links;

    const sim = forceSimulation<VizNode>(nodes)
      .force(
        'link',
        forceLink<VizNode, VizLink>(links)
          .id((d) => d.id)
          .distance(80)
          .strength(0.4),
      )
      .force('charge', forceManyBody().strength(-220).distanceMax(500))
      .force('collide', forceCollide<VizNode>((d) => nodeRadius(d) + 7))
      .force('center', forceCenter(size.w / 2, size.h / 2))
      // Empujón suave hacia el centro: evita que los nodos sueltos vuelen lejos.
      .force('x', forceX<VizNode>(size.w / 2).strength(0.04))
      .force('y', forceY<VizNode>(size.h / 2).strength(0.04))
      .on('tick', rerender);

    if (groupByDomain) {
      // Empuja cada dominio hacia un punto propio en una grilla
      const domains = [...new Set(nodes.map((n) => n.domain ?? '∅'))];
      const cols = Math.ceil(Math.sqrt(domains.length));
      const anchor = new Map<string, { x: number; y: number }>();
      domains.forEach((d, i) => {
        anchor.set(d, {
          x: (size.w / (cols + 1)) * ((i % cols) + 1),
          y: (size.h / (Math.ceil(domains.length / cols) + 1)) * (Math.floor(i / cols) + 1),
        });
      });
      sim
        .force('x', forceX<VizNode>((d) => anchor.get(d.domain ?? '∅')!.x).strength(0.25))
        .force('y', forceY<VizNode>((d) => anchor.get(d.domain ?? '∅')!.y).strength(0.25));
    }

    simRef.current = sim;
    userInteractedRef.current = false;
    sim.alpha(1).restart();
    sim.on('end', () => {
      if (!userInteractedRef.current) fitView();
    });
    return () => {
      sim.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, groupByDomain]);

  // Al cambiar el tamaño del panel: recentrar sin rehacer toda la simulación.
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    sim.force('center', forceCenter(size.w / 2, size.h / 2));
    sim.alpha(0.15).restart();
    if (!userInteractedRef.current) {
      const id = setTimeout(fitView, 350);
      return () => clearTimeout(id);
    }
  }, [size.w, size.h, fitView]);

  // Arrastre de nodos
  const dragState = useRef<{ node: VizNode | null }>({ node: null });
  const toGraphCoords = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current!.getBoundingClientRect();
      return {
        x: (clientX - rect.left - transform.x) / transform.k,
        y: (clientY - rect.top - transform.y) / transform.k,
      };
    },
    [transform],
  );

  const onNodePointerDown = (e: ReactPointerEvent, node: VizNode) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    userInteractedRef.current = true;
    dragState.current.node = node;
    simRef.current?.alphaTarget(0.3).restart();
    const p = toGraphCoords(e.clientX, e.clientY);
    node.fx = p.x;
    node.fy = p.y;
  };
  const onNodePointerMove = (e: ReactPointerEvent) => {
    const node = dragState.current.node;
    if (!node) return;
    const p = toGraphCoords(e.clientX, e.clientY);
    node.fx = p.x;
    node.fy = p.y;
  };
  const onNodePointerUp = (node: VizNode) => {
    if (dragState.current.node !== node) return;
    dragState.current.node = null;
    simRef.current?.alphaTarget(0);
    node.fx = null;
    node.fy = null;
  };

  const resetView = () => {
    userInteractedRef.current = false;
    fitView();
  };

  const nodes = nodesRef.current;
  const links = linksRef.current;
  const searchLower = search.trim().toLowerCase();
  const matches = (n: VizNode) => searchLower !== '' && n.path.toLowerCase().includes(searchLower);
  const anyMatch = searchLower !== '' && nodes.some(matches);

  const focusId = hoverId ?? selectedId;
  const neighbors = focusId ? (adjacency.get(focusId) ?? new Set<string>()) : null;
  const isDimmed = (id: string) => {
    if (anyMatch) return !nodes.find((n) => n.id === id && matches(n));
    if (neighbors) return id !== focusId && !neighbors.has(id);
    return false;
  };

  return (
    <div className="relative h-full w-full">
      <svg
        ref={svgRef}
        className="h-full w-full"
        onClick={() => onSelect(null)}
        onPointerMove={onNodePointerMove}
      >
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          {/* Aristas */}
          {links.map((l, i) => {
            const s = l.source as VizNode;
            const t = l.target as VizNode;
            if (s.x == null || t.x == null) return null;
            const dim = isDimmed(s.id) && isDimmed(t.id);
            const hot =
              focusId && (s.id === focusId || t.id === focusId) && !l.circular;
            return (
              <line
                key={i}
                className={`graph-edge ${l.circular ? 'circular' : ''} ${hot ? 'highlight' : ''}`}
                x1={s.x}
                y1={s.y}
                x2={t.x}
                y2={t.y}
                opacity={dim ? 0.06 : 1}
              />
            );
          })}
          {/* Nodos */}
          {nodes.map((n) => {
            if (n.x == null || n.y == null) return null;
            const r = nodeRadius(n);
            const selected = n.id === selectedId;
            const dim = isDimmed(n.id);
            return (
              <g
                key={n.id}
                data-node
                transform={`translate(${n.x},${n.y})`}
                style={{ cursor: 'pointer' }}
                opacity={dim ? 0.15 : 1}
                onPointerDown={(e) => onNodePointerDown(e, n)}
                onPointerUp={() => onNodePointerUp(n)}
                onPointerEnter={() => setHoverId(n.id)}
                onPointerLeave={() => setHoverId(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(n);
                }}
              >
                <circle
                  r={r}
                  fill={n.color}
                  fillOpacity={n.isExternal ? 0.25 : 0.85}
                  stroke={
                    n.inCycle ? '#c084fc' : n.issues > 0 ? '#f87171' : selected ? '#fff' : n.color
                  }
                  strokeWidth={selected ? 3 : n.inCycle || n.issues > 0 ? 2 : 1}
                  filter={n.risk > 0.5 ? 'url(#glow)' : undefined}
                />
                {(r > 9 || selected || n.id === focusId) && (
                  <text className="graph-node-label" y={r + 11} textAnchor="middle">
                    {n.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      <button
        onClick={resetView}
        className="absolute bottom-4 right-4 rounded-md border border-ink-600 bg-ink-800/80 px-3 py-1.5 text-xs text-slate-300 backdrop-blur hover:bg-ink-700"
      >
        Centrar vista
      </button>
    </div>
  );
}
