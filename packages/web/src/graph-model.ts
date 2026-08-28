/**
 * graph-model.ts — Convierte el análisis del motor en algo que la simulación de
 * fuerzas puede dibujar.
 *
 * Dos vistas:
 *   'files'   → un nodo por archivo, aristas = imports internos
 *   'symbols' → un nodo por función/clase, aristas = llamadas
 */

import type { GitTimeline, LanguageId, ProjectAnalysis } from '@codegraph/core';

export type VizMode = 'files' | 'symbols';

export interface VizNode {
  id: string;
  label: string;
  kind: 'file' | 'symbol' | 'external';
  color: string;
  domain: string | undefined;

  // file
  path?: string;
  language?: LanguageId;
  loc?: number;
  complexity?: number;
  issues?: number;
  risk?: number;
  churn?: number;
  hotspot?: number;
  inCycle?: boolean;

  // symbol
  file?: string;
  symKind?: 'function' | 'class' | 'method';
  exported?: boolean;
  span?: number;

  // posición (la llena d3-force)
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface VizLink {
  source: string | VizNode;
  target: string | VizNode;
  kind: 'import' | 'call';
  circular: boolean;
}

export interface VizDomain {
  id: string;
  label: string;
  color: string;
}

export interface VizGraph {
  mode: VizMode;
  nodes: VizNode[];
  links: VizLink[];
  domains: VizDomain[];
  /** Datos del timeline (pasan tal cual desde el análisis). */
  timeline?: GitTimeline;
}

export interface BuildOptions {
  mode: VizMode;
  showExternal: boolean;
  /** Si se pasa, solo se muestran los nodos de ese dominio (id). */
  domainFilter?: string | null;
}

const EXTERNAL_COLOR = '#4b5563';
const NO_DOMAIN_COLOR = '#64748b';

export function buildVizGraph(analysis: ProjectAnalysis, opts: BuildOptions): VizGraph {
  const domainColor = new Map<string, string>();
  const domainOfFile = new Map<string, string>();
  for (const d of analysis.graph.domains) {
    domainColor.set(d.id, d.color);
    for (const f of d.files) domainOfFile.set(f, d.id);
  }
  const domains: VizDomain[] = analysis.graph.domains.map((d) => ({
    id: d.id,
    label: d.label,
    color: d.color,
  }));
  const colorFor = (domainId: string | undefined) =>
    domainId ? (domainColor.get(domainId) ?? NO_DOMAIN_COLOR) : NO_DOMAIN_COLOR;

  const filter = opts.domainFilter ?? null;
  const nodes: VizNode[] = [];
  const visible = new Set<string>();

  if (opts.mode === 'symbols') {
    const span = new Map<string, number>();
    for (const f of analysis.files) {
      for (const s of f.symbols) span.set(s.id, Math.max(1, s.endLine - s.line));
    }
    for (const n of analysis.graph.nodes) {
      if (n.type !== 'symbol' || !n.file) continue;
      const domainId = domainOfFile.get(n.file);
      if (filter && domainId !== filter) continue;
      nodes.push({
        id: n.id,
        label: n.label,
        kind: 'symbol',
        file: n.file,
        symKind: n.kind ?? 'function',
        exported: n.exported,
        domain: domainId,
        color: colorFor(domainId),
        span: span.get(n.id) ?? 4,
      });
      visible.add(n.id);
    }
    const links: VizLink[] = [];
    for (const e of analysis.graph.edges) {
      if (e.type !== 'calls') continue;
      if (visible.has(e.source) && visible.has(e.target)) {
        links.push({ source: e.source, target: e.target, kind: 'call', circular: false });
      }
    }
    return { mode: 'symbols', nodes, links, domains, timeline: analysis.timeline };
  }

  // ── modo 'files' ─────────────────────────────────────────────────────────
  const inCycle = new Set<string>();
  for (const cycle of analysis.graph.cycles) for (const f of cycle) inCycle.add(f);

  for (const n of analysis.graph.nodes) {
    if (n.type === 'file') {
      if (filter && n.domain !== filter) continue;
      nodes.push({
        id: n.id,
        label: n.label,
        kind: 'file',
        path: n.path ?? n.id,
        language: n.language ?? 'unknown',
        loc: n.loc ?? 0,
        complexity: n.complexity ?? 1,
        issues: n.issues ?? 0,
        risk: n.risk ?? 0,
        churn: n.churn,
        hotspot: n.hotspot,
        domain: n.domain,
        color: colorFor(n.domain),
        inCycle: inCycle.has(n.id),
      });
      visible.add(n.id);
    } else if (n.type === 'external' && opts.showExternal && !filter) {
      nodes.push({
        id: n.id,
        label: n.label,
        kind: 'external',
        domain: undefined,
        color: EXTERNAL_COLOR,
      });
      visible.add(n.id);
    }
  }

  let links: VizLink[] = [];
  for (const e of analysis.graph.edges) {
    if (e.type !== 'imports') continue;
    if (visible.has(e.source) && visible.has(e.target)) {
      links.push({
        source: e.source,
        target: e.target,
        kind: 'import',
        circular: Boolean(e.circular),
      });
    }
  }

  // Los docs y configs sin ninguna dependencia solo ensucian la vista de imports.
  const degree = new Map<string, number>();
  for (const l of links) {
    degree.set(l.source as string, (degree.get(l.source as string) ?? 0) + 1);
    degree.set(l.target as string, (degree.get(l.target as string) ?? 0) + 1);
  }
  const kept = new Set(
    nodes
      .filter(
        (n) =>
          (degree.get(n.id) ?? 0) > 0 ||
          (n.language !== 'markdown' && n.language !== 'json' && n.kind !== 'external'),
      )
      .map((n) => n.id),
  );
  const filtered = nodes.filter((n) => kept.has(n.id));
  links = links.filter((l) => kept.has(l.source as string) && kept.has(l.target as string));

  return { mode: 'files', nodes: filtered, links, domains, timeline: analysis.timeline };
}

/** Radio de un nodo según su "peso". */
export function nodeRadius(node: VizNode): number {
  if (node.kind === 'external') return 5;
  if (node.kind === 'symbol') return Math.max(5, Math.min(16, Math.sqrt(node.span ?? 4) * 2));
  return Math.max(6, Math.min(26, Math.sqrt(node.loc ?? 1) * 1.1));
}
