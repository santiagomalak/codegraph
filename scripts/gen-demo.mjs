/**
 * gen-demo.mjs — Genera packages/web/public/demo-analysis.json
 *
 * Es el análisis del propio Code Graph Unified. Lo usa la web cuando no hay un
 * servidor `codegraph serve` (por ejemplo, en el deploy estático de Vercel):
 * muestra este análisis de ejemplo en "modo demo".
 *
 * Correr con:  npm run demo   (necesita `npm run build` antes)
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyzeProject } from '@codegraph/core';
import { discoverFiles } from '@codegraph/core/node';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'packages', 'web', 'public', 'demo-analysis.json');

const { files } = await discoverFiles(join(root, 'packages'));
const analysis = await analyzeProject(files, { projectName: 'code-graph-unified (demo)' });

await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(analysis));
console.log(
  `demo-analysis.json → ${analysis.summary.totalFiles} archivos, ` +
    `${(JSON.stringify(analysis).length / 1024).toFixed(0)} KB`,
);
