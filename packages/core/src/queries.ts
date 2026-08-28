/**
 * queries.ts — Preguntas sobre un análisis ya hecho.
 *
 * Son funciones puras: reciben el `ProjectAnalysis` y devuelven un pedazo chico.
 * Las usa el servidor MCP (para que la IA consulte el grafo sin cargarlo entero)
 * y también la web.
 */

import type { ParsedFile, ProjectAnalysis, SymbolDef } from './model.js';

function importEdges(analysis: ProjectAnalysis) {
  return analysis.graph.edges.filter(
    (e) => e.type === 'imports' && !e.target.startsWith('ext:'),
  );
}

/** Archivos que `path` importa (dependencias directas). */
export function dependenciesOf(analysis: ProjectAnalysis, path: string): string[] {
  return importEdges(analysis)
    .filter((e) => e.source === path)
    .map((e) => e.target)
    .sort();
}

/** Archivos que importan a `path` (dependientes directos). */
export function dependentsOf(analysis: ProjectAnalysis, path: string): string[] {
  return importEdges(analysis)
    .filter((e) => e.target === path)
    .map((e) => e.source)
    .sort();
}

/**
 * Todos los archivos que se ven afectados si tocás `path`
 * (dependientes directos + indirectos).
 */
export function impactOf(analysis: ProjectAnalysis, path: string): string[] {
  const reverse = new Map<string, string[]>();
  for (const e of importEdges(analysis)) {
    if (!reverse.has(e.target)) reverse.set(e.target, []);
    reverse.get(e.target)!.push(e.source);
  }
  const seen = new Set<string>();
  const queue = [path];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const dep of reverse.get(cur) ?? []) {
      if (!seen.has(dep)) {
        seen.add(dep);
        queue.push(dep);
      }
    }
  }
  seen.delete(path);
  return [...seen].sort();
}

export interface SymbolHit {
  symbol: SymbolDef;
  file: string;
  /** Archivos cuyo código llama a algo con este nombre. */
  calledBy: string[];
}

/** Dónde se define un símbolo (por nombre simple) y quién lo llama. */
export function findSymbol(analysis: ProjectAnalysis, name: string): SymbolHit[] {
  const simple = name.split('.').pop()!.toLowerCase();
  const hits: SymbolHit[] = [];

  for (const file of analysis.files) {
    for (const sym of file.symbols) {
      if (sym.name.split('.').pop()!.toLowerCase() !== simple) continue;
      const calledBy = analysis.files
        .filter((f) => f.symbols.some((s) => s.calls.includes(sym.name.split('.').pop()!)))
        .map((f) => f.path)
        .filter((p) => p !== file.path)
        .sort();
      hits.push({ symbol: sym, file: file.path, calledBy });
    }
  }
  return hits;
}

export interface FileDetail {
  path: string;
  language: string;
  metrics: ParsedFile['metrics'];
  domain: string | undefined;
  imports: { specifier: string; kind: string; resolved?: string }[];
  exports: string[];
  symbols: { name: string; kind: string; line: number; exported: boolean; documented: boolean }[];
  issues: { rule: string; severity: string; message: string; line: number }[];
  dependents: string[];
  inCycle: boolean;
}

/** Vista compacta de un archivo (sin el contenido, sin snippets largos). */
export function fileDetail(analysis: ProjectAnalysis, path: string): FileDetail | null {
  const file = analysis.files.find((f) => f.path === path);
  if (!file) return null;
  const node = analysis.graph.nodes.find((n) => n.id === path);

  return {
    path: file.path,
    language: file.language,
    metrics: file.metrics,
    domain: analysis.graph.domains.find((d) => d.id === node?.domain)?.label,
    imports: file.imports.map((i) => ({
      specifier: i.specifier,
      kind: i.kind,
      ...(i.resolved ? { resolved: i.resolved } : {}),
    })),
    exports: file.exports,
    symbols: file.symbols.map((s) => ({
      name: s.name,
      kind: s.kind,
      line: s.line,
      exported: s.exported,
      documented: s.documented,
    })),
    issues: file.issues.map((i) => ({
      rule: i.rule,
      severity: i.severity,
      message: i.message,
      line: i.line,
    })),
    dependents: dependentsOf(analysis, path),
    inCycle: analysis.graph.cycles.some((c) => c.includes(path)),
  };
}

export interface DomainDetail {
  label: string;
  files: string[];
  totalLoc: number;
  /** Nombres de OTROS dominios que este dominio importa. */
  importsFromOtherDomains: string[];
}

/** Vista de un dominio: sus archivos y con qué otros dominios se relaciona. */
export function domainDetail(analysis: ProjectAnalysis, labelOrId: string): DomainDetail | null {
  const domain = analysis.graph.domains.find(
    (d) => d.label === labelOrId || d.id === labelOrId,
  );
  if (!domain) return null;

  const inDomain = new Set(domain.files);
  const fileToDomain = new Map<string, string>();
  for (const d of analysis.graph.domains) for (const f of d.files) fileToDomain.set(f, d.label);

  const outbound = new Set<string>();
  for (const e of importEdges(analysis)) {
    if (inDomain.has(e.source) && !inDomain.has(e.target)) {
      outbound.add(fileToDomain.get(e.target) ?? e.target);
    }
  }

  const files = analysis.files.filter((f) => inDomain.has(f.path));
  return {
    label: domain.label,
    files: [...domain.files].sort(),
    totalLoc: files.reduce((s, f) => s + f.metrics.loc, 0),
    importsFromOtherDomains: [...outbound].sort(),
  };
}
