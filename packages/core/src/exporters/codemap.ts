/**
 * codemap.ts — Convierte un ProjectAnalysis en un CODEMAP.md legible.
 *
 * El CODEMAP es un resumen en Markdown pensado para pegarle a una IA como
 * contexto: qué es el proyecto, su stack, su estructura, sus dependencias
 * circulares, sus archivos más pesados y sus problemas.
 */

import type { ProjectAnalysis } from '../model.js';

function bar(value: number, max: number, width = 20): string {
  const filled = max > 0 ? Math.round((value / max) * width) : 0;
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled));
}

export function toCodemapMarkdown(analysis: ProjectAnalysis): string {
  const { summary, graph, files } = analysis;
  const lines: string[] = [];

  lines.push(`# CODEMAP — ${summary.projectName}`);
  lines.push('');
  lines.push(`> Generado por Code Graph Unified · ${analysis.analyzedAt.slice(0, 10)}`);
  lines.push('');

  // ── Resumen ────────────────────────────────────────────────────────────
  lines.push('## Resumen');
  lines.push('');
  lines.push(`- **Archivos:** ${summary.totalFiles}`);
  lines.push(`- **Líneas de código:** ${summary.totalLoc.toLocaleString('es')}`);
  lines.push(`- **Símbolos (funciones/clases):** ${summary.totalSymbols}`);
  lines.push(`- **Complejidad promedio:** ${summary.avgComplexity}`);
  lines.push(
    `- **Issues:** ${summary.totalIssues} ` +
      `(${summary.issuesBySeverity.error} error / ${summary.issuesBySeverity.warning} warning / ${summary.issuesBySeverity.info} info)`,
  );
  lines.push(`- **Dependencias circulares:** ${summary.circularDeps}`);
  lines.push(`- **Salud:** ${summary.health.score}/100 (${summary.health.grade})`);
  lines.push('');

  if (summary.stack.length) {
    lines.push(`**Stack detectado:** ${summary.stack.join(', ')}`);
    lines.push('');
  }

  // ── Lenguajes ──────────────────────────────────────────────────────────
  const langEntries = Object.entries(summary.filesByLanguage).sort((a, b) => b[1] - a[1]);
  const maxLang = Math.max(...langEntries.map(([, n]) => n), 1);
  lines.push('## Lenguajes');
  lines.push('');
  lines.push('```');
  for (const [lang, n] of langEntries) {
    lines.push(`${lang.padEnd(12)} ${bar(n, maxLang)} ${n}`);
  }
  lines.push('```');
  lines.push('');

  // ── Dominios ───────────────────────────────────────────────────────────
  if (graph.domains.length > 1) {
    lines.push('## Dominios (áreas del proyecto)');
    lines.push('');
    for (const d of [...graph.domains].sort((a, b) => b.files.length - a.files.length)) {
      lines.push(`### ${d.label} — ${d.files.length} archivo(s)`);
      for (const f of d.files.slice(0, 12)) lines.push(`- \`${f}\``);
      if (d.files.length > 12) lines.push(`- … +${d.files.length - 12} más`);
      lines.push('');
    }
  }

  // ── Puntos de entrada ──────────────────────────────────────────────────
  if (summary.entryPoints.length) {
    lines.push('## Puntos de entrada probables');
    lines.push('');
    for (const e of summary.entryPoints) lines.push(`- \`${e}\``);
    lines.push('');
  }

  // ── Dependencias circulares ────────────────────────────────────────────
  if (graph.cycles.length) {
    lines.push('## ⚠️ Dependencias circulares');
    lines.push('');
    for (const cycle of graph.cycles) {
      lines.push(`- ${cycle.map((f) => `\`${f}\``).join(' → ')} → (vuelve al inicio)`);
    }
    lines.push('');
  }

  // ── Archivos más pesados ───────────────────────────────────────────────
  const heaviest = [...files].sort((a, b) => b.metrics.loc - a.metrics.loc).slice(0, 10);
  lines.push('## Archivos más grandes');
  lines.push('');
  lines.push('| Archivo | Líneas | Complejidad | Issues |');
  lines.push('|---|--:|--:|--:|');
  for (const f of heaviest) {
    lines.push(`| \`${f.path}\` | ${f.metrics.loc} | ${f.metrics.complexity} | ${f.issues.length} |`);
  }
  lines.push('');

  // ── Issues destacados ──────────────────────────────────────────────────
  const filesWithErrors = files
    .filter((f) => f.issues.some((i) => i.severity === 'error'))
    .slice(0, 10);
  if (filesWithErrors.length) {
    lines.push('## Issues graves');
    lines.push('');
    for (const f of filesWithErrors) {
      lines.push(`- \`${f.path}\``);
      for (const issue of f.issues.filter((i) => i.severity === 'error').slice(0, 5)) {
        lines.push(`  - línea ${issue.line}: ${issue.message} — \`${issue.snippet}\``);
      }
    }
    lines.push('');
  }

  // ── Mapa de dependencias internas ──────────────────────────────────────
  const importEdges = graph.edges.filter((e) => e.type === 'imports' && !e.target.startsWith('ext:'));
  if (importEdges.length) {
    lines.push('## Dependencias internas (quién importa a quién)');
    lines.push('');
    lines.push('```');
    const bySource = new Map<string, string[]>();
    for (const e of importEdges) {
      if (!bySource.has(e.source)) bySource.set(e.source, []);
      bySource.get(e.source)!.push(e.target + (e.circular ? '  (circular)' : ''));
    }
    for (const [src, targets] of [...bySource].sort()) {
      lines.push(src);
      for (const t of targets) lines.push(`  → ${t}`);
    }
    lines.push('```');
    lines.push('');
  }

  lines.push('---');
  lines.push('_Este archivo es contexto para una IA. Pegalo al inicio de la conversación._');
  lines.push('');

  return lines.join('\n');
}
