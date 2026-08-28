/**
 * summary.ts — Resumen ejecutivo del proyecto.
 *
 * Junta los números grandes (archivos, líneas, issues), detecta el stack
 * tecnológico y calcula un "health score" 0..100 con el desglose de por qué.
 */

import type {
  HealthScore,
  KnowledgeGraph,
  LanguageId,
  ParsedFile,
  ProjectSummary,
} from '../model.js';
import { computeHotspots } from '../git.js';

const LANGUAGE_LABEL: Record<LanguageId, string> = {
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  jsx: 'JSX',
  tsx: 'TSX',
  css: 'CSS',
  json: 'JSON',
  markdown: 'Markdown',
  unknown: 'Otros',
};

const ENTRY_NAMES = new Set([
  'index.js', 'index.ts', 'index.jsx', 'index.tsx', 'index.mjs',
  'main.js', 'main.ts', 'main.jsx', 'main.tsx', 'main.py',
  'app.js', 'app.ts', 'app.py', 'app.tsx',
  'server.js', 'server.ts', 'server.py',
  'cli.js', 'cli.ts', 'manage.py', '__main__.py', 'wsgi.py', 'asgi.py',
]);

/** [nombre de archivo o import, etiqueta] para detección de stack. */
const STACK_BY_FILENAME: Array<[RegExp, string]> = [
  [/^next\.config\.[mc]?[jt]s$/, 'Next.js'],
  [/^nuxt\.config\.[mc]?[jt]s$/, 'Nuxt'],
  [/^vite\.config\.[mc]?[jt]s$/, 'Vite'],
  [/^astro\.config\.[mc]?[jt]s$/, 'Astro'],
  [/^svelte\.config\.[mc]?[jt]s$/, 'Svelte'],
  [/^remix\.config\.[mc]?[jt]s$/, 'Remix'],
  [/^tailwind\.config\.[mc]?[jt]s$/, 'Tailwind CSS'],
  [/^webpack\.config\.[mc]?[jt]s$/, 'Webpack'],
  [/^rollup\.config\.[mc]?[jt]s$/, 'Rollup'],
  [/^(jest|vitest)\.config\.[mc]?[jt]s$/, 'Tests (Jest/Vitest)'],
  [/^tsconfig(\..+)?\.json$/, 'TypeScript'],
  [/^dockerfile$/i, 'Docker'],
  [/^docker-compose\.ya?ml$/, 'Docker Compose'],
  [/^pyproject\.toml$/, 'Python (pyproject)'],
  [/^requirements.*\.txt$/, 'Python (pip)'],
  [/^manage\.py$/, 'Django'],
  [/^\.github$/, 'GitHub Actions'],
];

const STACK_BY_IMPORT: Array<[RegExp, string]> = [
  [/^react(-dom)?$/, 'React'],
  [/^vue$/, 'Vue'],
  [/^svelte/, 'Svelte'],
  [/^@angular\//, 'Angular'],
  [/^next(\/|$)/, 'Next.js'],
  [/^express$/, 'Express'],
  [/^fastify$/, 'Fastify'],
  [/^koa$/, 'Koa'],
  [/^@nestjs\//, 'NestJS'],
  [/^d3$/, 'D3.js'],
  [/^three$/, 'Three.js'],
  [/^graphology/, 'Graphology'],
  [/^(prisma|@prisma\/client)$/, 'Prisma'],
  [/^mongoose$/, 'MongoDB (Mongoose)'],
  [/^django/, 'Django'],
  [/^flask$/, 'Flask'],
  [/^fastapi$/, 'FastAPI'],
  [/^(sqlalchemy|sqlmodel)$/, 'SQLAlchemy'],
  [/^pandas$/, 'pandas'],
  [/^numpy$/, 'NumPy'],
  [/^torch$/, 'PyTorch'],
  [/^tensorflow/, 'TensorFlow'],
  [/^pytest$/, 'pytest'],
];

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function detectStack(files: ParsedFile[]): string[] {
  const found = new Set<string>();

  for (const file of files) {
    const name = basename(file.path).toLowerCase();
    for (const [re, label] of STACK_BY_FILENAME) {
      if (re.test(name) || re.test(file.path)) found.add(label);
    }
    for (const imp of file.imports) {
      const spec = imp.specifier.replace(/^@types\//, '');
      for (const [re, label] of STACK_BY_IMPORT) {
        if (re.test(spec)) found.add(label);
      }
    }
  }

  // Lenguaje base
  if (files.some((f) => f.language === 'typescript' || f.language === 'tsx')) found.add('TypeScript');
  if (files.some((f) => f.language === 'python')) found.add('Python');

  return [...found].sort();
}

function computeHealth(
  files: ParsedFile[],
  graph: KnowledgeGraph,
  avgComplexity: number,
  errorCount: number,
): HealthScore {
  const factors: HealthScore['factors'] = [];
  let score = 100;

  const penalize = (impact: number, label: string, detail: string): void => {
    if (impact >= 0) return;
    const rounded = Math.round(impact * 10) / 10;
    score += rounded;
    factors.push({ label, impact: rounded, detail });
  };

  const cyclePenalty = Math.max(-30, -8 * graph.cycles.length);
  if (graph.cycles.length) {
    penalize(cyclePenalty, 'Dependencias circulares', `${graph.cycles.length} ciclo(s) detectado(s)`);
  }

  if (avgComplexity > 10) {
    penalize(Math.max(-20, -(avgComplexity - 10) * 1.5), 'Complejidad alta', `Complejidad promedio ${avgComplexity}`);
  }

  if (errorCount > 0) {
    penalize(Math.max(-25, -errorCount * 2), 'Issues graves', `${errorCount} issue(s) de severidad "error"`);
  }

  const bigFiles = files.filter((f) => f.metrics.loc > 600);
  if (bigFiles.length) {
    penalize(Math.max(-15, -bigFiles.length * 2), 'Archivos gigantes', `${bigFiles.length} archivo(s) > 600 líneas`);
  }

  const withSymbols = files.filter((f) => f.symbols.length > 0);
  if (withSymbols.length >= 5) {
    const docRatio =
      withSymbols.reduce((s, f) => s + f.metrics.docCoverage, 0) / withSymbols.length;
    if (docRatio < 25) {
      penalize(-10, 'Poca documentación', `Solo ${Math.round(docRatio)}% de símbolos documentados`);
    }
  }

  score = Math.max(0, Math.round(score));
  const grade: HealthScore['grade'] =
    score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 55 ? 'D' : 'F';

  return { score, grade, factors };
}

export function buildSummary(
  files: ParsedFile[],
  graph: KnowledgeGraph,
  projectName: string,
): ProjectSummary {
  const totalLoc = files.reduce((s, f) => s + f.metrics.loc, 0);
  const totalSymbols = files.reduce((s, f) => s + f.symbols.length, 0);

  const issuesBySeverity = { info: 0, warning: 0, error: 0 };
  let totalIssues = 0;
  for (const f of files) {
    for (const issue of f.issues) {
      issuesBySeverity[issue.severity]++;
      totalIssues++;
    }
  }

  const filesByLanguage: Record<string, number> = {};
  for (const f of files) {
    const label = LANGUAGE_LABEL[f.language];
    filesByLanguage[label] = (filesByLanguage[label] ?? 0) + 1;
  }

  const complexities = files.map((f) => f.metrics.complexity);
  const avgComplexity = complexities.length
    ? Math.round((complexities.reduce((a, b) => a + b, 0) / complexities.length) * 10) / 10
    : 0;

  const entryPoints = files
    .filter((f) => ENTRY_NAMES.has(basename(f.path)))
    .map((f) => f.path)
    .sort();

  return {
    projectName,
    totalFiles: files.length,
    totalLoc,
    totalSymbols,
    totalIssues,
    issuesBySeverity,
    filesByLanguage,
    avgComplexity,
    circularDeps: graph.cycles.length,
    entryPoints,
    stack: detectStack(files),
    health: computeHealth(files, graph, avgComplexity, issuesBySeverity.error),
    hotspots: computeHotspots(files, graph),
  };
}
