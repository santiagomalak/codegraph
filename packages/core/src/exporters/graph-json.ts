/**
 * graph-json.ts — Exporta el grafo como JSON, en dos tamaños.
 *
 *   toGraphJson(graph)                → "slim": solo archivos, dominios e imports
 *   toGraphJson(graph, { full: true })→ todo (símbolos, llamadas, contains…)
 *
 * El "slim" pesa ~65% menos y es lo que necesitan la mayoría de las
 * herramientas y visualizaciones. El "full" es para análisis profundo.
 */

import type { KnowledgeGraph } from '../model.js';

export interface GraphJsonOptions {
  full?: boolean;
}

export function toGraphJson(graph: KnowledgeGraph, opts: GraphJsonOptions = {}): string {
  if (opts.full) return JSON.stringify(graph, null, 2);

  const slim = {
    nodes: graph.nodes
      .filter((n) => n.type === 'file' || n.type === 'domain')
      .map((n) => {
        if (n.type === 'domain') {
          return { id: n.id, type: 'domain', label: n.label, color: n.color, files: n.fileCount };
        }
        return {
          id: n.id,
          type: 'file',
          label: n.label,
          lang: n.language,
          loc: n.loc,
          complexity: n.complexity,
          issues: n.issues,
          domain: n.domain,
          risk: n.risk,
          ...(n.churn !== undefined ? { churn: n.churn } : {}),
          ...(n.hotspot !== undefined ? { hotspot: n.hotspot } : {}),
        };
      }),
    edges: graph.edges
      .filter((e) => e.type === 'imports' || e.type === 'member-of' || e.type === 'co-change')
      .map((e) => ({
        from: e.source,
        to: e.target,
        type: e.type,
        ...(e.circular ? { circular: true } : {}),
        ...(e.weight !== undefined ? { weight: e.weight } : {}),
        ...(e.hidden ? { hidden: true } : {}),
      })),
    domains: graph.domains,
    cycles: graph.cycles,
  };

  return JSON.stringify(slim, null, 2);
}
