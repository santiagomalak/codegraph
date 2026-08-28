import { describe, it, expect } from 'vitest';
import { analyzeProject } from '../src/analyze.js';
import type { GitStats, SourceFile } from '../src/model.js';

const files: SourceFile[] = [
  {
    path: 'src/hot.ts',
    content: `export function f(x: number) {
      if (x > 0) { if (x > 1) { for (let i = 0; i < x; i++) {} } }
      return x && x || 0;
    }`,
  },
  { path: 'src/calm.ts', content: `export const g = () => 1;` },
];

const git: Record<string, GitStats> = {
  'src/hot.ts': {
    commits: 40,
    authors: 5,
    linesChanged: 900,
    firstCommit: '2024-01-01T00:00:00Z',
    lastCommit: '2026-08-01T00:00:00Z',
  },
  'src/calm.ts': {
    commits: 1,
    authors: 1,
    linesChanged: 3,
    firstCommit: '2024-01-01T00:00:00Z',
    lastCommit: '2024-01-01T00:00:00Z',
  },
};

describe('capa git', () => {
  it('sin git no hay hotspots ni churn', async () => {
    const r = await analyzeProject(files, { projectName: 'x' });
    expect(r.summary.hotspots).toEqual([]);
    const node = r.graph.nodes.find((n) => n.id === 'src/hot.ts')!;
    expect(node.churn).toBeUndefined();
    expect(node.hotspot).toBeUndefined();
  });

  it('con git agrega churn, hotspot y summary.hotspots', async () => {
    const r = await analyzeProject(files, { projectName: 'x', git });

    const hot = r.files.find((f) => f.path === 'src/hot.ts')!;
    expect(hot.git?.commits).toBe(40);

    const hotNode = r.graph.nodes.find((n) => n.id === 'src/hot.ts')!;
    const calmNode = r.graph.nodes.find((n) => n.id === 'src/calm.ts')!;
    expect(hotNode.churn).toBe(40);
    expect(hotNode.hotspot).toBeGreaterThan(calmNode.hotspot ?? 0);

    expect(r.summary.hotspots[0]!.path).toBe('src/hot.ts');
    expect(r.summary.hotspots[0]!.commits).toBe(40);
  });

  it('pasa el timeline al resultado', async () => {
    const timeline = {
      from: '2024-01-01T00:00:00Z',
      to: '2024-12-31T00:00:00Z',
      buckets: 48,
      commitsPerBucket: new Array(48).fill(0),
      fileFirstBucket: { 'src/hot.ts': 0, 'src/calm.ts': 20 },
      fileActivity: { 'src/hot.ts': new Array(48).fill(1), 'src/calm.ts': new Array(48).fill(0) },
    };
    const r = await analyzeProject(files, { projectName: 'x', timeline });
    expect(r.timeline?.buckets).toBe(48);
    expect(r.timeline?.fileFirstBucket['src/calm.ts']).toBe(20);
  });
});
