import { describe, it, expect } from 'vitest';
import { analyzeProject } from '../src/analyze.js';
import type { SourceFile } from '../src/model.js';

const jsProject: SourceFile[] = [
  {
    path: 'src/app.js',
    content: `
      import { greet } from './utils.js';
      import express from 'express';

      /** Punto de entrada */
      export function main() {
        const app = express();
        greet('mundo');
        console.log('listo');
      }
    `,
  },
  {
    path: 'src/utils.js',
    content: `
      export function greet(name) {
        if (!name) throw new Error('falta name');
        return 'hola ' + name;
      }
    `,
  },
  {
    path: 'src/circular-a.js',
    content: `import { b } from './circular-b.js'; export const a = () => b();`,
  },
  {
    path: 'src/circular-b.js',
    content: `import { a } from './circular-a.js'; export const b = () => a();`,
  },
];

const pyProject: SourceFile[] = [
  {
    path: 'pkg/main.py',
    content: [
      'from .helpers import load',
      'import os',
      '',
      'def run(path):',
      '    """Corre el proceso."""',
      '    if os.path.exists(path):',
      '        return load(path)',
      '    return None',
    ].join('\n'),
  },
  {
    path: 'pkg/helpers.py',
    content: ['def load(path):', '    print(path)', '    return open(path).read()'].join('\n'),
  },
];

describe('analyzeProject (JS)', () => {
  it('parsea imports, símbolos y detecta el import interno', async () => {
    const r = await analyzeProject(jsProject, { projectName: 'demo-js' });

    const app = r.files.find((f) => f.path === 'src/app.js')!;
    expect(app.language).toBe('javascript');
    expect(app.symbols.map((s) => s.name)).toContain('main');

    const internal = app.imports.find((i) => i.specifier === './utils.js')!;
    expect(internal.kind).toBe('internal');
    expect(internal.resolved).toBe('src/utils.js');

    const external = app.imports.find((i) => i.specifier === 'express')!;
    expect(external.kind).toBe('external');
  });

  it('detecta issues (console.log)', async () => {
    const r = await analyzeProject(jsProject, { projectName: 'demo-js' });
    const app = r.files.find((f) => f.path === 'src/app.js')!;
    expect(app.issues.some((i) => i.rule === 'no-console')).toBe(true);
  });

  it('detecta la dependencia circular', async () => {
    const r = await analyzeProject(jsProject, { projectName: 'demo-js' });
    expect(r.summary.circularDeps).toBe(1);
    expect(r.graph.cycles.length).toBe(1);
    expect(r.graph.cycles[0]!.sort()).toEqual(['src/circular-a.js', 'src/circular-b.js']);
    const circularEdges = r.graph.edges.filter((e) => e.circular);
    expect(circularEdges.length).toBe(2);
  });

  it('arma nodos de dominio y aristas member-of', async () => {
    const r = await analyzeProject(jsProject, { projectName: 'demo-js' });
    expect(r.graph.domains.length).toBeGreaterThanOrEqual(1);
    expect(r.graph.nodes.some((n) => n.type === 'domain')).toBe(true);
    expect(r.graph.edges.some((e) => e.type === 'member-of')).toBe(true);
  });

  it('detecta el stack (Express)', async () => {
    const r = await analyzeProject(jsProject, { projectName: 'demo-js' });
    expect(r.summary.stack).toContain('Express');
  });
});

describe('analyzeProject (Python)', () => {
  it('resuelve el import relativo entre módulos', async () => {
    const r = await analyzeProject(pyProject, { projectName: 'demo-py' });
    const main = r.files.find((f) => f.path === 'pkg/main.py')!;
    const rel = main.imports.find((i) => i.specifier === '.helpers')!;
    expect(rel.resolved).toBe('pkg/helpers.py');
  });

  it('detecta funciones y docstrings', async () => {
    const r = await analyzeProject(pyProject, { projectName: 'demo-py' });
    const main = r.files.find((f) => f.path === 'pkg/main.py')!;
    const run = main.symbols.find((s) => s.name === 'run')!;
    expect(run.kind).toBe('function');
    expect(run.documented).toBe(true);
    expect(run.calls).toContain('load');
  });

  it('marca print() como issue', async () => {
    const r = await analyzeProject(pyProject, { projectName: 'demo-py' });
    const helpers = r.files.find((f) => f.path === 'pkg/helpers.py')!;
    expect(helpers.issues.some((i) => i.rule === 'no-print')).toBe(true);
  });
});
