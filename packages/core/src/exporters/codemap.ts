/**
 * codemap.ts — Convierte un ProjectAnalysis en un CODEMAP.md legible.
 *
 * El CODEMAP es el resumen que le pasás a una IA como contexto. Tiene 3 niveles
 * de detalle y un presupuesto opcional de tokens:
 *
 *   toCodemapMarkdown(analysis)                        → 'normal'
 *   toCodemapMarkdown(analysis, { detail: 'compact' }) → lo esencial, ~400 tokens
 *   toCodemapMarkdown(analysis, { detail: 'full' })    → + símbolos e issues
 *   toCodemapMarkdown(analysis, { maxTokens: 1500 })   → recorta para entrar
 *
 * Internamente arma "secciones" ordenadas por importancia y las va sumando
 * mientras entren en el presupuesto.
 */

import type { ProjectAnalysis } from '../model.js';

export type CodemapDetail = 'compact' | 'normal' | 'full';

export interface CodemapOptions {
  detail?: CodemapDetail;
  /** Tope aproximado de tokens. Si se pasa, recorta secciones para entrar. */
  maxTokens?: number;
}

/** Estimación gruesa: ~3.7 caracteres por token. */
const estTokens = (text: string): number => Math.ceil(text.length / 3.7);

interface Section {
  /** Menor = más importante, se incluye primero. */
  rank: number;
  /** Nivel mínimo en el que aparece. */
  minDetail: CodemapDetail;
  text: string;
}

const DETAIL_ORDER: Record<CodemapDetail, number> = { compact: 0, normal: 1, full: 2 };

function bar(value: number, max: number, width = 18): string {
  const filled = max > 0 ? Math.round((value / max) * width) : 0;
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled));
}

export function toCodemapMarkdown(analysis: ProjectAnalysis, opts: CodemapOptions = {}): string {
  const detail: CodemapDetail = opts.detail ?? 'normal';
  const { summary, graph, files } = analysis;
  const sections: Section[] = [];
  const add = (rank: number, minDetail: CodemapDetail, text: string) =>
    sections.push({ rank, minDetail, text: text.trimEnd() });

  // ── 0. Cabecera + resumen (siempre) ────────────────────────────────────
  const head = [
    `# CODEMAP — ${summary.projectName}`,
    '',
    `> ${analysis.analyzedAt.slice(0, 10)} · ${summary.totalFiles} archivos · ` +
      `${summary.totalLoc.toLocaleString('es')} líneas · salud ${summary.health.score}/100 (${summary.health.grade})`,
    '',
    '## Resumen',
    '',
    `- Símbolos: ${summary.totalSymbols} · complejidad promedio: ${summary.avgComplexity}`,
    `- Issues: ${summary.totalIssues} (${summary.issuesBySeverity.error} error, ${summary.issuesBySeverity.warning} warning)`,
    `- Dependencias circulares: ${summary.circularDeps}`,
    summary.stack.length ? `- Stack: ${summary.stack.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  add(0, 'compact', head);

  // ── 1. Dominios ────────────────────────────────────────────────────────
  if (graph.domains.length > 0) {
    const sorted = [...graph.domains].sort((a, b) => b.files.length - a.files.length);
    const lines = ['## Dominios (áreas del proyecto)', ''];
    const perDomain = detail === 'compact' ? 0 : detail === 'normal' ? 8 : 999;
    for (const d of sorted) {
      lines.push(`### ${d.label} — ${d.files.length} archivo(s)`);
      for (const f of d.files.slice(0, perDomain)) lines.push(`- \`${f}\``);
      if (d.files.length > perDomain && perDomain > 0) {
        lines.push(`- … +${d.files.length - perDomain} más`);
      }
      lines.push('');
    }
    add(1, 'compact', lines.join('\n'));
  }

  // ── 2. Dependencias circulares ─────────────────────────────────────────
  if (graph.cycles.length > 0) {
    const lines = ['## ⚠️ Dependencias circulares', ''];
    for (const cycle of graph.cycles) {
      lines.push(`- ${cycle.map((f) => `\`${f}\``).join(' → ')} → (vuelve)`);
    }
    add(2, 'compact', lines.join('\n'));
  }

  // ── 3. Puntos de entrada ───────────────────────────────────────────────
  if (summary.entryPoints.length > 0) {
    add(
      3,
      'compact',
      ['## Puntos de entrada probables', '', ...summary.entryPoints.map((e) => `- \`${e}\``)].join('\n'),
    );
  }

  // ── 4. Lenguajes ───────────────────────────────────────────────────────
  const langEntries = Object.entries(summary.filesByLanguage).sort((a, b) => b[1] - a[1]);
  if (langEntries.length > 0) {
    const maxLang = Math.max(...langEntries.map(([, n]) => n), 1);
    add(
      4,
      'normal',
      [
        '## Lenguajes',
        '',
        '```',
        ...langEntries.map(([lang, n]) => `${lang.padEnd(12)} ${bar(n, maxLang)} ${n}`),
        '```',
      ].join('\n'),
    );
  }

  // ── 5. Dependencias internas ───────────────────────────────────────────
  const internal = graph.edges.filter(
    (e) => e.type === 'imports' && !e.target.startsWith('ext:'),
  );
  if (internal.length > 0) {
    const bySource = new Map<string, string[]>();
    for (const e of internal) {
      if (!bySource.has(e.source)) bySource.set(e.source, []);
      bySource.get(e.source)!.push(e.target + (e.circular ? '  (circular)' : ''));
    }
    const lines = ['## Dependencias internas (quién importa a quién)', '', '```'];
    for (const [src, targets] of [...bySource].sort()) {
      lines.push(src);
      for (const t of targets) lines.push(`  → ${t}`);
    }
    lines.push('```');
    add(5, 'normal', lines.join('\n'));
  }

  // ── 6. Archivos más grandes ────────────────────────────────────────────
  const heaviest = [...files].sort((a, b) => b.metrics.loc - a.metrics.loc).slice(0, 10);
  add(
    6,
    'normal',
    [
      '## Archivos más grandes',
      '',
      '| Archivo | Líneas | Complejidad | Issues |',
      '|---|--:|--:|--:|',
      ...heaviest.map(
        (f) => `| \`${f.path}\` | ${f.metrics.loc} | ${f.metrics.complexity} | ${f.issues.length} |`,
      ),
    ].join('\n'),
  );

  // ── 7. Issues graves ───────────────────────────────────────────────────
  const errorFiles = files.filter((f) => f.issues.some((i) => i.severity === 'error'));
  if (errorFiles.length > 0) {
    const lines = ['## Issues graves', ''];
    for (const f of errorFiles.slice(0, 10)) {
      lines.push(`- \`${f.path}\``);
      for (const issue of f.issues.filter((i) => i.severity === 'error').slice(0, 5)) {
        lines.push(`  - línea ${issue.line}: ${issue.message}`);
      }
    }
    add(7, 'normal', lines.join('\n'));
  }

  // ── 8. Símbolos por archivo (solo 'full') ──────────────────────────────
  const withSymbols = files.filter((f) => f.symbols.length > 0);
  if (withSymbols.length > 0) {
    const lines = ['## Símbolos por archivo', ''];
    for (const f of withSymbols) {
      lines.push(`### \`${f.path}\``);
      for (const s of f.symbols) {
        lines.push(`- ${s.kind} \`${s.name}\`${s.exported ? ' (export)' : ''}${s.async ? ' async' : ''}`);
      }
      lines.push('');
    }
    add(8, 'full', lines.join('\n'));
  }

  // ── 9. Todos los issues (solo 'full') ──────────────────────────────────
  const anyIssues = files.filter((f) => f.issues.length > 0);
  if (anyIssues.length > 0) {
    const lines = ['## Todos los issues', ''];
    for (const f of anyIssues) {
      lines.push(`### \`${f.path}\``);
      for (const i of f.issues) {
        lines.push(`- [${i.severity}] línea ${i.line}: ${i.message}`);
      }
      lines.push('');
    }
    add(9, 'full', lines.join('\n'));
  }

  // ── Ensamblado ─────────────────────────────────────────────────────────
  const wanted = sections
    .filter((s) => DETAIL_ORDER[s.minDetail] <= DETAIL_ORDER[detail])
    .sort((a, b) => a.rank - b.rank);

  const footer = '\n---\n_Contexto para una IA. Pegalo al inicio de la conversación._\n';

  const chosen: string[] = [];
  let used = estTokens(footer);
  for (const s of wanted) {
    const cost = estTokens(s.text) + 2;
    if (opts.maxTokens && used + cost > opts.maxTokens && chosen.length > 0) break;
    chosen.push(s.text);
    used += cost;
  }

  return chosen.join('\n\n') + footer;
}
