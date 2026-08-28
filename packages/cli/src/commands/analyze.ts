/**
 * analyze.ts — Implementa `codegraph analyze [carpeta]`.
 *
 * 1. descubre los archivos de código de la carpeta
 * 2. corre el motor (@codegraph/core)
 * 3. escribe los resultados en <carpeta>/.codegraph/
 * 4. imprime un resumen en la terminal
 * 5. si se pidió, corta con exit code != 0 cuando hay problemas (útil en CI)
 */

import { mkdir, stat, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, join, resolve } from 'node:path';
import pc from 'picocolors';
import {
  analyzeProject,
  toCodemapMarkdown,
  toGraphJson,
  type CodemapDetail,
  type ProjectAnalysis,
  type SnapshotSeries,
} from '@codegraph/core';
import {
  buildSnapshots,
  discoverFiles,
  readGitHistory,
  readProjectConfig,
} from '@codegraph/core/node';

export interface AnalyzeFlags {
  out?: string;
  json?: boolean;
  codemap?: boolean;
  stdout?: boolean;
  detail?: string;
  maxTokens?: string;
  graphFull?: boolean;
  failOnCycles?: boolean;
  failOnError?: boolean;
  maxComplexity?: string;
  snapshots?: string | boolean;
}

const GRADE_COLOR: Record<string, (s: string) => string> = {
  A: pc.green,
  B: pc.green,
  C: pc.yellow,
  D: pc.yellow,
  F: pc.red,
};

function printSummary(analysis: ProjectAnalysis): void {
  const s = analysis.summary;
  const grade = GRADE_COLOR[s.health.grade] ?? pc.white;

  console.log('');
  console.log(pc.bold(`  ${s.projectName}`));
  console.log(pc.dim('  ' + '─'.repeat(40)));
  console.log(`  Salud         ${grade(`${s.health.score}/100 (${s.health.grade})`)}`);
  console.log(`  Archivos      ${s.totalFiles}`);
  console.log(`  Líneas        ${s.totalLoc.toLocaleString('es')}`);
  console.log(`  Símbolos      ${s.totalSymbols}`);
  console.log(`  Complejidad   ${s.avgComplexity} promedio`);
  console.log(
    `  Issues        ${s.totalIssues}  ` +
      pc.dim(`(${pc.red(String(s.issuesBySeverity.error))} err / ${pc.yellow(String(s.issuesBySeverity.warning))} warn / ${s.issuesBySeverity.info} info)`),
  );
  console.log(
    `  Circulares    ${s.circularDeps > 0 ? pc.red(String(s.circularDeps)) : pc.green('0')}`,
  );
  console.log(`  Dominios      ${analysis.graph.domains.length}`);
  if (s.stack.length) console.log(`  Stack         ${pc.cyan(s.stack.join(', '))}`);

  if (s.hotspots.length > 0) {
    console.log(pc.dim('\n  Hotspots (complejo + cambia mucho):'));
    for (const h of s.hotspots.slice(0, 5)) {
      console.log(
        pc.dim(`    ${String(Math.round(h.score * 100)).padStart(3)}  ${h.path}  `) +
          pc.dim(`(cx ${h.complexity}, ${h.commits} commits)`),
      );
    }
  }

  if (s.temporalCoupling.length > 0) {
    console.log(pc.dim('\n  Acoplamiento oculto (cambian juntos, no se importan):'));
    for (const c of s.temporalCoupling.slice(0, 5)) {
      console.log(
        pc.dim(`    ${String(Math.round(c.coupling * 100)).padStart(3)}%  ${c.a}  ↔  ${c.b}`),
      );
    }
  }

  if (s.health.factors.length) {
    console.log(pc.dim('\n  Qué le baja la nota:'));
    for (const f of s.health.factors) {
      console.log(pc.dim(`    ${f.impact}  ${f.label} — ${f.detail}`));
    }
  }
  console.log('');
}

/** Tabla corta de la evolución del proyecto (primer vs último snapshot + tendencia). */
function printEvolution(series: SnapshotSeries): void {
  const pts = series.points;
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;

  console.log(pc.dim(`\n  Evolución (${pts.length} puntos, ${first.date.slice(0, 10)} → ${last.date.slice(0, 10)}):`));
  const row = (label: string, a: number, b: number, better: 'up' | 'down') => {
    const good = better === 'up' ? b >= a : b <= a;
    const mark = b === a ? pc.dim('·') : good ? pc.green('✓') : pc.yellow('!');
    console.log(pc.dim(`    ${label.padEnd(13)} ${String(a).padStart(7)} → ${String(b).padStart(7)}  ${mark}`));
  };
  row('Archivos', first.files, last.files, 'up');
  row('Líneas', first.loc, last.loc, 'up');
  row('Complejidad', first.avgComplexity, last.avgComplexity, 'down');
  row('Health', first.health, last.health, 'up');
  row('Ciclos', first.circularDeps, last.circularDeps, 'down');
  // mini-sparkline del health
  const spark = '▁▂▃▄▅▆▇█';
  const hs = pts.map((p) => p.health);
  const lo = Math.min(...hs);
  const hi = Math.max(...hs);
  const bars = hs
    .map((h) => spark[Math.round(((h - lo) / Math.max(1, hi - lo)) * (spark.length - 1))])
    .join('');
  console.log(pc.dim(`    Health   ${bars}  (${lo}–${hi})`));
}

export async function runAnalyze(target: string, flags: AnalyzeFlags): Promise<void> {
  const rootDir = resolve(process.cwd(), target || '.');
  const projectName = basename(rootDir);

  // Con --stdout, stdout es SOLO el JSON: todo lo informativo va a stderr.
  const info = flags.stdout ? console.error : console.log;
  const progressOut = flags.stdout ? process.stderr : process.stdout;

  info(pc.dim(`Analizando ${rootDir} …`));

  const { files, skippedLarge } = await discoverFiles(rootDir);
  if (files.length === 0) {
    console.error(pc.red('No se encontraron archivos de código soportados (JS/TS/Python).'));
    process.exit(1);
  }

  const { stats: git, timeline, coupling } = await readGitHistory(rootDir, files.map((f) => f.path));
  const hasGit = Object.keys(git).length > 0;
  const resolveConfig = await readProjectConfig(rootDir);

  let lastPct = -1;
  const analysis = await analyzeProject(files, {
    projectName,
    git: hasGit ? git : undefined,
    timeline: timeline ?? undefined,
    coupling,
    resolve: resolveConfig,
    onProgress: (done, total) => {
      const pct = Math.floor((done / total) * 100);
      if (pct !== lastPct && pct % 10 === 0) {
        lastPct = pct;
        progressOut.write(pc.dim(`\r  parseando… ${pct}%`));
      }
    },
  });
  progressOut.write('\r' + ' '.repeat(30) + '\r');

  if (skippedLarge.length) {
    info(pc.dim(`  (${skippedLarge.length} archivo(s) grandes salteados)`));
  }

  // ── Salida ────────────────────────────────────────────────────────────
  if (flags.stdout) {
    console.log(JSON.stringify(analysis, null, 2));
  } else {
    const outDir = flags.out
      ? isAbsolute(flags.out)
        ? flags.out
        : resolve(process.cwd(), flags.out)
      : join(rootDir, '.codegraph');
    await mkdir(outDir, { recursive: true });

    const written: string[] = [];
    const wantJson = flags.json ?? true;
    const wantCodemap = flags.codemap ?? true;
    const detail = (flags.detail as CodemapDetail) ?? 'normal';
    const maxTokens = flags.maxTokens ? Number(flags.maxTokens) : undefined;

    if (wantJson) {
      await writeFile(join(outDir, 'analysis.json'), JSON.stringify(analysis, null, 2));
      await writeFile(
        join(outDir, 'graph.json'),
        toGraphJson(analysis.graph, { full: flags.graphFull }),
      );
      written.push('analysis.json', 'graph.json');
    }
    if (wantCodemap) {
      await writeFile(
        join(outDir, 'CODEMAP.md'),
        toCodemapMarkdown(analysis, { detail, maxTokens }),
      );
      written.push('CODEMAP.md');
    }

    if (flags.snapshots !== undefined && flags.snapshots !== false) {
      const n = flags.snapshots === true ? 20 : Number(flags.snapshots) || 20;
      console.log(pc.dim(`\n  Calculando ${n} snapshots históricos (git worktree)…`));
      const series = await buildSnapshots(rootDir, {
        count: n,
        onProgress: (done, total, sha) =>
          progressOut.write(pc.dim(`\r    ${done}/${total}  ${sha}      `)),
      });
      progressOut.write('\r' + ' '.repeat(40) + '\r');
      if (series) {
        await writeFile(join(outDir, 'snapshots.json'), JSON.stringify(series));
        written.push('snapshots.json');
        printEvolution(series);
      } else {
        console.log(pc.dim('    (no se pudo: ¿la carpeta es un repo con 2+ commits?)'));
      }
    }

    printSummary(analysis);
    console.log(pc.green(`  ✓ escrito en ${outDir}`));
    for (const name of written) {
      const bytes = (await stat(join(outDir, name))).size;
      const kb = (bytes / 1024).toFixed(1);
      const tokens = Math.round(bytes / 3.7); // estimación gruesa
      const hint = name === 'CODEMAP.md' ? pc.green('  → para pegarle a una IA') : '';
      console.log(pc.dim(`    ${name.padEnd(14)} ${kb.padStart(6)} KB  ~${tokens.toLocaleString('es')} tokens${hint}`));
    }
    console.log('');
  }

  // ── Exit codes para CI ────────────────────────────────────────────────
  const reasons: string[] = [];
  if (flags.failOnCycles && analysis.summary.circularDeps > 0) {
    reasons.push(`${analysis.summary.circularDeps} dependencia(s) circular(es)`);
  }
  if (flags.failOnError && analysis.summary.issuesBySeverity.error > 0) {
    reasons.push(`${analysis.summary.issuesBySeverity.error} issue(s) de severidad error`);
  }
  if (flags.maxComplexity) {
    const limit = Number(flags.maxComplexity);
    if (Number.isFinite(limit) && analysis.summary.avgComplexity > limit) {
      reasons.push(`complejidad promedio ${analysis.summary.avgComplexity} > ${limit}`);
    }
  }
  if (reasons.length) {
    console.error(pc.red(`Falló el chequeo: ${reasons.join('; ')}`));
    process.exit(1);
  }
}
