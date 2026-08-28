/**
 * Tests de las piezas puras del grafo (sin tree-sitter):
 * detección de ciclos, resolución de imports y clustering en dominios.
 */

import { describe, it, expect } from 'vitest';
import { detectCycles } from '../src/graph/cycles.js';
import { ImportResolver } from '../src/graph/resolve-imports.js';
import { detectDomains } from '../src/graph/domains.js';

describe('detectCycles', () => {
  it('no encuentra ciclos en un grafo acíclico', () => {
    const r = detectCycles(
      ['a', 'b', 'c'],
      [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' },
      ],
    );
    expect(r.cycles).toEqual([]);
    expect(r.circularEdgeKeys.size).toBe(0);
  });

  it('encuentra un ciclo simple a→b→a', () => {
    const r = detectCycles(
      ['a', 'b'],
      [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'a' },
      ],
    );
    expect(r.cycles).toHaveLength(1);
    expect(r.cycles[0]!.sort()).toEqual(['a', 'b']);
    expect(r.circularEdgeKeys.has('a→b')).toBe(true);
    expect(r.circularEdgeKeys.has('b→a')).toBe(true);
  });

  it('encuentra un ciclo de 3 y deja fuera una arista sana', () => {
    const r = detectCycles(
      ['a', 'b', 'c', 'd'],
      [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' },
        { source: 'c', target: 'a' },
        { source: 'a', target: 'd' },
      ],
    );
    expect(r.cycles[0]!.sort()).toEqual(['a', 'b', 'c']);
    expect(r.circularEdgeKeys.has('a→d')).toBe(false);
  });
});

describe('ImportResolver', () => {
  const files = new Set([
    'src/app.ts',
    'src/utils/index.ts',
    'src/utils/format.ts',
    'pkg/main.py',
    'pkg/sub/helpers.py',
  ]);
  const resolver = new ImportResolver(files);

  it('resuelve import relativo JS con extensión omitida', () => {
    expect(resolver.resolve('src/app.ts', { specifier: './utils/format', kind: 'internal', line: 1 })).toBe(
      'src/utils/format.ts',
    );
  });

  it('resuelve a index.ts de una carpeta', () => {
    expect(resolver.resolve('src/app.ts', { specifier: './utils', kind: 'internal', line: 1 })).toBe(
      'src/utils/index.ts',
    );
  });

  it('devuelve undefined para un paquete npm', () => {
    expect(resolver.resolve('src/app.ts', { specifier: 'react', kind: 'external', line: 1 })).toBeUndefined();
  });

  it('resuelve import relativo Python con puntos', () => {
    expect(resolver.resolve('pkg/sub/helpers.py', { specifier: '..main', kind: 'internal', line: 1 })).toBe(
      'pkg/main.py',
    );
  });

  it('resuelve import absoluto Python por módulo', () => {
    expect(resolver.resolve('pkg/main.py', { specifier: 'pkg.sub.helpers', kind: 'external', line: 1 })).toBe(
      'pkg/sub/helpers.py',
    );
  });
});

describe('detectDomains', () => {
  it('agrupa por carpeta cuando no hay imports internos', () => {
    const domains = detectDomains(['a/x.ts', 'a/y.ts', 'b/z.ts'], []);
    const labels = domains.map((d) => d.label).sort();
    expect(labels).toEqual(['a', 'b']);
  });

  it('cada archivo cae en exactamente un dominio', () => {
    const files = ['core/a.ts', 'core/b.ts', 'ui/c.ts', 'ui/d.ts'];
    const edges = [
      { source: 'core/a.ts', target: 'core/b.ts' },
      { source: 'ui/c.ts', target: 'ui/d.ts' },
    ];
    const domains = detectDomains(files, edges);
    const assigned = domains.flatMap((d) => d.files).sort();
    expect(assigned).toEqual([...files].sort());
  });
});
