import { describe, it, expect, beforeAll } from 'vitest';
import { analyzeProject } from '../src/analyze.js';
import { toCodemapMarkdown } from '../src/exporters/codemap.js';
import { toGraphJson } from '../src/exporters/graph-json.js';
import { dependenciesOf, dependentsOf, impactOf, findSymbol, fileDetail } from '../src/queries.js';
import type { ProjectAnalysis, SourceFile } from '../src/model.js';

const files: SourceFile[] = [
  { path: 'src/a.js', content: `import { b } from './b.js'; export function a() { return b(); }` },
  { path: 'src/b.js', content: `import { c } from './c.js'; export function b() { return c(); }` },
  { path: 'src/c.js', content: `export function c() { return 42; }` },
  { path: 'src/unrelated.js', content: `export const x = 1;` },
];

let analysis: ProjectAnalysis;
beforeAll(async () => {
  analysis = await analyzeProject(files, { projectName: 'q' });
});

describe('queries', () => {
  it('dependenciesOf', () => {
    expect(dependenciesOf(analysis, 'src/a.js')).toEqual(['src/b.js']);
    expect(dependenciesOf(analysis, 'src/c.js')).toEqual([]);
  });

  it('dependentsOf', () => {
    expect(dependentsOf(analysis, 'src/c.js')).toEqual(['src/b.js']);
  });

  it('impactOf incluye dependientes transitivos', () => {
    expect(impactOf(analysis, 'src/c.js').sort()).toEqual(['src/a.js', 'src/b.js']);
    expect(impactOf(analysis, 'src/unrelated.js')).toEqual([]);
  });

  it('findSymbol ubica la definición y quién la llama', () => {
    const hits = findSymbol(analysis, 'c');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.file).toBe('src/c.js');
    expect(hits[0]!.calledBy).toContain('src/b.js');
  });

  it('fileDetail devuelve una vista compacta', () => {
    const d = fileDetail(analysis, 'src/a.js')!;
    expect(d.symbols.map((s) => s.name)).toContain('a');
    expect(d.imports[0]!.resolved).toBe('src/b.js');
    expect(d.dependents).toEqual([]);
  });
});

describe('exporters', () => {
  it('CODEMAP compact es más chico que full', () => {
    const compact = toCodemapMarkdown(analysis, { detail: 'compact' });
    const full = toCodemapMarkdown(analysis, { detail: 'full' });
    expect(compact.length).toBeLessThan(full.length);
    expect(compact).toContain('# CODEMAP');
  });

  it('CODEMAP respeta maxTokens', () => {
    const tiny = toCodemapMarkdown(analysis, { detail: 'full', maxTokens: 120 });
    expect(tiny.length / 3.7).toBeLessThan(400); // margen por el footer
    expect(tiny).toContain('# CODEMAP');
  });

  it('graph slim pesa menos que el full', () => {
    const slim = toGraphJson(analysis.graph);
    const full = toGraphJson(analysis.graph, { full: true });
    expect(slim.length).toBeLessThan(full.length);
    const parsed = JSON.parse(slim);
    expect(parsed.nodes.every((n: { type: string }) => n.type === 'file' || n.type === 'domain')).toBe(true);
  });
});
