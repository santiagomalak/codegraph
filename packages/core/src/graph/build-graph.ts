/**
 * build-graph.ts — Arma el grafo de conocimiento a partir de los archivos parseados.
 *
 * Produce nodos y aristas de varios "planos" en una sola estructura:
 *
 *   file  ──contains──▶  symbol          (el archivo declara la función/clase)
 *   file  ──imports───▶  file | external (dependencia de módulo)
 *   symbol ──calls────▶  symbol          (una función llama a otra)
 *   file  ──member-of─▶  domain          (el archivo pertenece a un área)
 *
 * La UI decide qué planos mostrar. El core solo los calcula.
 */

import type {
  GraphEdge,
  GraphNode,
  KnowledgeGraph,
  ParsedFile,
} from '../model.js';
import { LANGUAGE_COLOR } from '../languages.js';
import { ImportResolver } from './resolve-imports.js';
import { detectCycles, edgeKey, type SimpleEdge } from './cycles.js';
import { detectDomains } from './domains.js';

/** Si hay más símbolos que esto, no emitimos nodos de símbolo (grafo ilegible). */
const MAX_SYMBOL_NODES = 6000;

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Riesgo 0..1 de un archivo: mezcla de complejidad e issues. */
function riskOf(file: ParsedFile): number {
  const complexityNorm = clamp01(file.metrics.complexity / 50);
  const issuesNorm = clamp01(file.issues.length / 10);
  return Math.round((0.55 * complexityNorm + 0.45 * issuesNorm) * 100) / 100;
}

export function buildGraph(files: ParsedFile[]): KnowledgeGraph {
  const paths = files.map((f) => f.path);
  const pathSet = new Set(paths);
  const resolver = new ImportResolver(pathSet);

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seenEdges = new Set<string>();

  const addEdge = (source: string, target: string, type: GraphEdge['type']): void => {
    const key = `${type}:${source}→${target}`;
    if (seenEdges.has(key) || source === target) return;
    seenEdges.add(key);
    edges.push({ id: key, source, target, type });
  };

  // ── 1. Resolver imports (marca `resolved` y sube a 'internal' si aplica) ──
  const importEdges: SimpleEdge[] = [];
  for (const file of files) {
    for (const imp of file.imports) {
      const resolved = resolver.resolve(file.path, imp);
      if (resolved) {
        imp.resolved = resolved;
        imp.kind = 'internal';
        importEdges.push({ source: file.path, target: resolved });
      }
    }
  }

  // ── 2. Ciclos y dominios ────────────────────────────────────────────────
  const { cycles, circularEdgeKeys } = detectCycles(paths, importEdges);
  const domains = detectDomains(paths, importEdges);
  const domainOfFile = new Map<string, string>();
  for (const d of domains) for (const f of d.files) domainOfFile.set(f, d.id);

  // ── 3. Nodos: archivos ──────────────────────────────────────────────────
  const totalSymbols = files.reduce((n, f) => n + f.symbols.length, 0);
  const emitSymbols = totalSymbols <= MAX_SYMBOL_NODES;

  for (const file of files) {
    nodes.push({
      id: file.path,
      type: 'file',
      label: basename(file.path),
      path: file.path,
      language: file.language,
      loc: file.metrics.loc,
      complexity: file.metrics.complexity,
      issues: file.issues.length,
      domain: domainOfFile.get(file.path),
      risk: riskOf(file),
    });
  }

  // ── 4. Nodos: dominios + aristas member-of ──────────────────────────────
  for (const d of domains) {
    nodes.push({
      id: d.id,
      type: 'domain',
      label: d.label,
      fileCount: d.files.length,
      color: d.color,
    });
    for (const f of d.files) addEdge(f, d.id, 'member-of');
  }

  // ── 5. Nodos: símbolos + aristas contains ───────────────────────────────
  const symbolsByName = new Map<string, string[]>(); // nombre simple → ids
  if (emitSymbols) {
    for (const file of files) {
      for (const sym of file.symbols) {
        nodes.push({
          id: sym.id,
          type: 'symbol',
          label: sym.name,
          kind: sym.kind,
          file: file.path,
          exported: sym.exported,
        });
        addEdge(file.path, sym.id, 'contains');

        const simple = sym.name.split('.').pop()!;
        if (!symbolsByName.has(simple)) symbolsByName.set(simple, []);
        symbolsByName.get(simple)!.push(sym.id);
      }
    }
  }

  // ── 6. Aristas: calls (símbolo → símbolo) ───────────────────────────────
  if (emitSymbols) {
    for (const file of files) {
      const localIds = new Map(file.symbols.map((s) => [s.name.split('.').pop()!, s.id]));
      for (const sym of file.symbols) {
        for (const callName of sym.calls) {
          // Preferencia: mismo archivo → único match global. Ambiguo = se descarta.
          const local = localIds.get(callName);
          if (local && local !== sym.id) {
            addEdge(sym.id, local, 'calls');
            continue;
          }
          const candidates = symbolsByName.get(callName);
          if (candidates && candidates.length === 1 && candidates[0] !== sym.id) {
            addEdge(sym.id, candidates[0]!, 'calls');
          }
        }
      }
    }
  }

  // ── 7. Aristas: imports (file → file | external) ────────────────────────
  const externalSeen = new Set<string>();
  for (const file of files) {
    for (const imp of file.imports) {
      if (imp.resolved) {
        addEdge(file.path, imp.resolved, 'imports');
      } else if (imp.kind === 'external') {
        const extId = `ext:${imp.specifier}`;
        if (!externalSeen.has(extId)) {
          externalSeen.add(extId);
          nodes.push({ id: extId, type: 'external', label: imp.specifier });
        }
        addEdge(file.path, extId, 'imports');
      }
    }
  }

  // ── 8. Marcar aristas circulares ───────────────────────────────────────
  for (const e of edges) {
    if (e.type === 'imports' && circularEdgeKeys.has(edgeKey(e.source, e.target))) {
      e.circular = true;
    }
  }

  return {
    nodes,
    edges,
    cycles,
    domains,
  };
}

export { LANGUAGE_COLOR };
