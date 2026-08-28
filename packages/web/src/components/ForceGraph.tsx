/**
 * ForceGraph.tsx — El grafo interactivo (SVG + simulación de fuerzas de d3).
 *
 * - d3-force calcula las posiciones.
 * - d3-zoom maneja el zoom/pan.
 * - El arrastre de nodos usa pointer events de React.
 * - Extras visuales: aristas curvas con "flujo" animado, blobs por dominio,
 *   fondo con degradé + grilla de puntos, glow en nodos de riesgo.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
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
import 'd3-transition'; // registra .transition() en las selecciones
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom';
import type { VizGraph, VizLink, VizNode } from '../graph-model.js';
import { nodeRadius } from '../graph-model.js';
import { hullPath } from '../lib/hull.js';

interface Props {
  graph: VizGraph;
  groupByDomain: boolean;
  domainFilter: string | null;
  selectedId: string | null;
  search: string;
  onSelect: (node: VizNode | null) => void;
}

interface Transform {
  x: number;
  y: number;
  k: number;
}

/** Punto de control de una curva cuadrática entre dos nodos. */
function controlPoint(s: VizNode, t: VizNode): [number, number] {
  const mx = (s.x! + t.x!) / 2;
  const my = (s.y! + t.y!) / 2;
  const dx = t.x! - s.x!;
  const dy = t.y! - s.y!;
  const len = Math.hypot(dx, dy) || 1;
  const curve = Math.min(40, len * 0.15);
  return [mx - (dy / len) * curve, my + (dx / len) * curve];
}

export function ForceGraph({
  graph,
  groupByDomain,
  domainFilter,
  selectedId,
  search,
  onSelect,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const simRef = useRef<Simulation<VizNode, VizLink> | null>(null);
  const nodesRef = useRef<VizNode[]>([]);
  const linksRef = useRef<VizLink[]>([]);
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 });
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

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

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Zoom / pan ─────────────────────────────────────────────────────────
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const userInteractedRef = useRef(false);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const behavior = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 4])
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

  const fitView = useCallback((animated = false) => {
    const svg = svgRef.current;
    const zoom = zoomRef.current;
    const all = nodesRef.current.filter((n) => n.x != null && n.y != null);
    if (!svg || !zoom || all.length === 0) return;

    // Ignoramos el 4% de nodos más lejanos del centroide (outliers sueltos) para
    // que un par de nodos perdidos no achiquen todo el grafo.
    const cx = all.reduce((s, n) => s + n.x!, 0) / all.length;
    const cy = all.reduce((s, n) => s + n.y!, 0) / all.length;
    const sorted = [...all].sort(
      (a, b) => Math.hypot(a.x! - cx, a.y! - cy) - Math.hypot(b.x! - cx, b.y! - cy),
    );
    const ns = sorted.slice(0, Math.max(1, Math.floor(sorted.length * 0.96)));

    const pad = 60;
    const minX = Math.min(...ns.map((n) => n.x!)) - pad;
    const maxX = Math.max(...ns.map((n) => n.x!)) + pad;
    const minY = Math.min(...ns.map((n) => n.y!)) - pad;
    const maxY = Math.max(...ns.map((n) => n.y!)) + pad;
    const w = svg.clientWidth || 800;
    const h = svg.clientHeight || 600;
    const k = Math.max(0.2, Math.min(1.3, Math.min(w / (maxX - minX), h / (maxY - minY))));
    const tx = w / 2 - (k * (minX + maxX)) / 2;
    const ty = h / 2 - (k * (minY + maxY)) / 2;
    const t = zoomIdentity.translate(tx, ty).scale(k);
    if (animated) {
      select(svg).transition().duration(400).call(zoom.transform as never, t);
    } else {
      zoom.transform(select(svg) as never, t);
    }
  }, []);

  // ── Simulación ─────────────────────────────────────────────────────────
  useEffect(() => {
    const nodes: VizNode[] = graph.nodes.map((n) => ({ ...n }));
    const links: VizLink[] = graph.links.map((l) => ({ ...l }));
    nodesRef.current = nodes;
    linksRef.current = links;

    const symbolMode = graph.mode === 'symbols';
    // Grado de cada nodo: los sueltos necesitan más empuje al centro para no
    // volar lejos, pero suave para no colapsar el grafo conectado.
    const degree = new Map<string, number>();
    for (const l of links) {
      const s = typeof l.source === 'string' ? l.source : (l.source as VizNode).id;
      const t = typeof l.target === 'string' ? l.target : (l.target as VizNode).id;
      degree.set(s, (degree.get(s) ?? 0) + 1);
      degree.set(t, (degree.get(t) ?? 0) + 1);
    }
    const pullStrength = (d: VizNode) => ((degree.get(d.id) ?? 0) === 0 ? 0.14 : 0.045);

    const sim = forceSimulation<VizNode>(nodes)
      .force(
        'link',
        forceLink<VizNode, VizLink>(links)
          .id((d) => d.id)
          .distance(symbolMode ? 55 : 85)
          .strength(symbolMode ? 0.5 : 0.4),
      )
      .force('charge', forceManyBody().strength(symbolMode ? -170 : -260).distanceMax(600))
      .force('collide', forceCollide<VizNode>((d) => nodeRadius(d) + (symbolMode ? 4 : 8)))
      .force('center', forceCenter(size.w / 2, size.h / 2))
      .force('x', forceX<VizNode>(size.w / 2).strength(pullStrength))
      .force('y', forceY<VizNode>(size.h / 2).strength(pullStrength))
      .on('tick', rerender);

    if (groupByDomain && !symbolMode) {
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
        .force('x', forceX<VizNode>((d) => anchor.get(d.domain ?? '∅')!.x).strength(0.28))
        .force('y', forceY<VizNode>((d) => anchor.get(d.domain ?? '∅')!.y).strength(0.28));
    }

    simRef.current = sim;
    userInteractedRef.current = false;
    sim.alpha(1).restart();

    // Reencuadrar varias veces mientras el layout se acomoda. Mientras el usuario
    // no toque nada, "auto" = seguir el grafo hasta que se asiente.
    const fitIfAuto = () => {
      if (!userInteractedRef.current) fitView();
    };
    const timers = [600, 1400, 2600, 4200].map((ms) => setTimeout(fitIfAuto, ms));
    sim.on('end', fitIfAuto);

    return () => {
      sim.stop();
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, groupByDomain]);

  const lastSize = useRef({ w: 0, h: 0 });
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    // Ignorar cambios chicos (evita reencuadres nerviosos).
    if (Math.abs(size.w - lastSize.current.w) < 24 && Math.abs(size.h - lastSize.current.h) < 24) {
      return;
    }
    lastSize.current = { w: size.w, h: size.h };

    sim.force('center', forceCenter(size.w / 2, size.h / 2));
    const fx = sim.force('x') as ReturnType<typeof forceX<VizNode>> | undefined;
    const fy = sim.force('y') as ReturnType<typeof forceY<VizNode>> | undefined;
    if (fx && fy && !groupByDomain) {
      fx.x(size.w / 2);
      fy.y(size.h / 2);
    }
    sim.alpha(0.1).restart();
    if (!userInteractedRef.current) {
      const id = setTimeout(fitView, 700);
      return () => clearTimeout(id);
    }
  }, [size.w, size.h, groupByDomain, fitView]);

  // ── Arrastre ───────────────────────────────────────────────────────────
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
    fitView(true);
  };

  // ── Estado derivado para el render ─────────────────────────────────────
  const nodes = nodesRef.current;
  const links = linksRef.current;
  const searchLower = search.trim().toLowerCase();
  const matches = (n: VizNode) =>
    searchLower !== '' && (n.path ?? n.label).toLowerCase().includes(searchLower);
  const anyMatch = searchLower !== '' && nodes.some(matches);

  // El foco solo cuenta si el nodo existe en la vista actual (si no, no dimear nada).
  const rawFocus = hoverId ?? selectedId;
  const focusId = rawFocus && nodes.some((n) => n.id === rawFocus) ? rawFocus : null;
  const neighbors = focusId ? (adjacency.get(focusId) ?? new Set<string>()) : null;
  const isDimmed = (id: string) => {
    if (anyMatch) return !nodes.some((n) => n.id === id && matches(n));
    if (neighbors) return id !== focusId && !neighbors.has(id);
    return false;
  };

  // Blobs por dominio: solo tienen sentido cuando los nodos están agrupados
  // por dominio (si no, los archivos de un dominio están desparramados).
  const hulls = useMemo(() => {
    if (graph.mode !== 'files' || domainFilter || !groupByDomain) return [];
    const byDomain = new Map<string, VizNode[]>();
    for (const n of nodes) {
      if (n.kind !== 'file' || !n.domain || n.x == null) continue;
      if (!byDomain.has(n.domain)) byDomain.set(n.domain, []);
      byDomain.get(n.domain)!.push(n);
    }
    return [...byDomain.entries()]
      .map(([domainId, members]) => {
        const d = graph.domains.find((x) => x.id === domainId);
        return { domainId, color: d?.color ?? '#64748b', path: hullPath(members, 22) };
      })
      .filter((h) => h.path);
    // recalcula cada render (posiciones cambian con el tick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, graph, domainFilter, groupByDomain, transform]);

  return (
    <div className="relative h-full w-full">
      <svg
        ref={svgRef}
        className="h-full w-full"
        onClick={() => onSelect(null)}
        onPointerMove={onNodePointerMove}
      >
        <defs>
          <radialGradient id="bg" cx="50%" cy="40%" r="75%">
            <stop offset="0%" stopColor="#141826" />
            <stop offset="100%" stopColor="#0a0c12" />
          </radialGradient>
          <pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1.5" fill="#1c2133" />
          </pattern>
          <filter id="glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="blobBlur" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
        </defs>

        <rect width="100%" height="100%" fill="url(#bg)" />
        <rect width="100%" height="100%" fill="url(#dots)" opacity="0.5" />

        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          {/* Blobs de dominio */}
          <g filter="url(#blobBlur)" opacity="0.16">
            {hulls.map((h) => (
              <path key={h.domainId} d={h.path} fill={h.color} />
            ))}
          </g>

          {/* Aristas */}
          <g fill="none">
            {links.map((l, i) => {
              const s = l.source as VizNode;
              const t = l.target as VizNode;
              if (s.x == null || t.x == null) return null;
              const dim = isDimmed(s.id) && isDimmed(t.id);
              const hot = focusId != null && (s.id === focusId || t.id === focusId);
              const [cx, cy] = controlPoint(s, t);
              const d = `M${s.x},${s.y} Q${cx},${cy} ${t.x},${t.y}`;
              return (
                <path
                  key={i}
                  d={d}
                  className={`gedge${l.circular ? ' gedge-circular' : ''}${hot ? ' gedge-hot' : ''}`}
                  opacity={dim ? 0.05 : hot ? 1 : 0.5}
                />
              );
            })}
          </g>

          {/* Nodos */}
          {nodes.map((n) => {
            if (n.x == null || n.y == null) return null;
            const r = nodeRadius(n);
            const selected = n.id === selectedId;
            const dim = isDimmed(n.id);
            const showLabel = r > 9 || selected || n.id === focusId || anyMatch;
            const isClass = n.kind === 'symbol' && n.symKind === 'class';
            return (
              <g
                key={n.id}
                data-node
                transform={`translate(${n.x},${n.y})`}
                className="gnode"
                style={{ cursor: 'pointer', opacity: dim ? 0.12 : 1 }}
                onPointerDown={(e) => onNodePointerDown(e, n)}
                onPointerUp={() => onNodePointerUp(n)}
                onPointerEnter={() => setHoverId(n.id)}
                onPointerLeave={() => setHoverId(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(n);
                }}
              >
                {/* halo de riesgo */}
                {(n.risk ?? 0) > 0.5 && (
                  <circle r={r + 5} fill={n.color} opacity={0.18} filter="url(#glow)" />
                )}
                {/* forma */}
                {isClass ? (
                  <rect
                    x={-r}
                    y={-r}
                    width={r * 2}
                    height={r * 2}
                    rx={3}
                    transform="rotate(45)"
                    fill={n.color}
                    fillOpacity={0.9}
                    stroke={selected ? '#fff' : n.color}
                    strokeWidth={selected ? 2.5 : 1}
                  />
                ) : (
                  <circle
                    r={r}
                    fill={n.color}
                    fillOpacity={n.kind === 'external' ? 0.25 : 0.88}
                    stroke={
                      n.inCycle
                        ? '#c084fc'
                        : (n.issues ?? 0) > 0
                          ? '#f87171'
                          : selected
                            ? '#ffffff'
                            : n.color
                    }
                    strokeWidth={selected ? 2.5 : n.inCycle || (n.issues ?? 0) > 0 ? 2 : 1}
                  />
                )}
                {/* badge de issues */}
                {(n.issues ?? 0) > 0 && (
                  <circle cx={r * 0.72} cy={-r * 0.72} r={3.2} fill="#f87171" stroke="#0a0c12" strokeWidth={1} />
                )}
                {showLabel && (
                  <text className="gnode-label" y={r + 12} textAnchor="middle">
                    {n.label.length > 28 ? n.label.slice(0, 26) + '…' : n.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      <div className="absolute bottom-4 right-4 flex gap-2">
        <button
          onClick={resetView}
          className="rounded-lg border border-ink-600 bg-ink-800/80 px-3 py-1.5 text-xs text-slate-300 backdrop-blur transition hover:bg-ink-700"
        >
          Centrar vista
        </button>
      </div>
    </div>
  );
}
