/**
 * graph-model.ts — Convierte el análisis del motor en algo que la simulación de
 * fuerzas puede dibujar: nodos y links con posición.
 *
 * Por ahora la vista muestra los NODOS DE ARCHIVO y las aristas `imports` entre
 * ellos. Los símbolos y dominios se usan para colorear y agrupar.
 */

import type { ProjectAnalysis, LanguageId } from '@codegraph/core';

export interface VizNode {
  id: string;
  label: string;
  path: string;
  language: LanguageId;
  loc: number;
  complexity: number;
  issues: number;
  risk: number;
  domain: string | undefined;
  color: string;
  isExternal: boolean;
  inCycle: boolean;
  // posición (la llena d3-force)
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface VizLink {
  source: string | VizNode;
  target: string | VizNode;
  circular: boolean;
}

export interface VizGraph {
  nodes: VizNode[];
  links: VizLink[];
  domainColor: Map<string, string>;
}

const EXTERNAL_COLOR = '#4b5563';
const NO_DOMAIN_COLOR = '#64748b';

export function buildVizGraph(
  analysis: ProjectAnalysis,
  opts: { showExternal: boolean },
): VizGraph {
  const domainColor = new Map<string, string>();
  for (const d of analysis.graph.domains) domainColor.set(d.id, d.color);

  const inCycle = new Set<string>();
  for (const cycle of analysis.graph.cycles) for (const f of cycle) inCycle.add(f);

  const nodes: VizNode[] = [];
  const visibleIds = new Set<string>();

  for (const n of analysis.graph.nodes) {
    if (n.type === 'file') {
      nodes.push({
        id: n.id,
        label: n.label,
        path: n.path ?? n.id,
        language: n.language ?? 'unknown',
        loc: n.loc ?? 0,
        complexity: n.complexity ?? 1,
        issues: n.issues ?? 0,
        risk: n.risk ?? 0,
        domain: n.domain,
        color: n.domain ? (domainColor.get(n.domain) ?? NO_DOMAIN_COLOR) : NO_DOMAIN_COLOR,
        isExternal: false,
        inCycle: inCycle.has(n.id),
      });
      visibleIds.add(n.id);
    } else if (n.type === 'external' && opts.showExternal) {
      nodes.push({
        id: n.id,
        label: n.label,
        path: n.label,
        language: 'unknown',
        loc: 0,
        complexity: 0,
        issues: 0,
        risk: 0,
        domain: undefined,
        color: EXTERNAL_COLOR,
        isExternal: true,
        inCycle: false,
      });
      visibleIds.add(n.id);
    }
  }

  const links: VizLink[] = [];
  for (const e of analysis.graph.edges) {
    if (e.type !== 'imports') continue;
    if (!visibleIds.has(e.source) || !visibleIds.has(e.target)) continue;
    links.push({ source: e.source, target: e.target, circular: Boolean(e.circular) });
  }

  return { nodes, links, domainColor };
}

/** Radio de un nodo según sus líneas de código. */
export function nodeRadius(node: VizNode): number {
  if (node.isExternal) return 5;
  return Math.max(5, Math.min(26, Math.sqrt(node.loc) * 1.1));
}
