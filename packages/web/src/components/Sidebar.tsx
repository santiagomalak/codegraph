/**
 * Sidebar.tsx — Panel izquierdo: resumen del proyecto.
 */

import type { ProjectAnalysis } from '@codegraph/core';

const GRADE_BG: Record<string, string> = {
  A: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  B: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  C: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  D: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  F: 'bg-red-500/15 text-red-300 border-red-500/30',
};

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-2">
      <div className={`text-lg font-semibold ${accent ?? 'text-slate-100'}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

export function Sidebar({ analysis }: { analysis: ProjectAnalysis }) {
  const s = analysis.summary;
  const langs = Object.entries(s.filesByLanguage).sort((a, b) => b[1] - a[1]);
  const maxLang = Math.max(...langs.map(([, n]) => n), 1);

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-r border-ink-700 bg-ink-900 p-4">
      <div>
        <div className="text-xs uppercase tracking-widest text-slate-500">Proyecto</div>
        <div className="truncate text-lg font-semibold text-slate-100" title={s.projectName}>
          {s.projectName}
        </div>
      </div>

      <div
        className={`flex items-center justify-between rounded-lg border px-3 py-2 ${GRADE_BG[s.health.grade] ?? ''}`}
      >
        <div>
          <div className="text-2xl font-bold">{s.health.score}</div>
          <div className="text-[11px] uppercase tracking-wide opacity-70">Health score</div>
        </div>
        <div className="text-3xl font-bold">{s.health.grade}</div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Archivos" value={s.totalFiles} />
        <Stat label="Líneas" value={s.totalLoc.toLocaleString('es')} />
        <Stat label="Símbolos" value={s.totalSymbols} />
        <Stat label="Complejidad" value={s.avgComplexity} />
        <Stat
          label="Issues"
          value={s.totalIssues}
          accent={s.issuesBySeverity.error > 0 ? 'text-red-300' : undefined}
        />
        <Stat
          label="Circulares"
          value={s.circularDeps}
          accent={s.circularDeps > 0 ? 'text-fuchsia-300' : 'text-emerald-300'}
        />
      </div>

      {s.stack.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs uppercase tracking-widest text-slate-500">Stack</div>
          <div className="flex flex-wrap gap-1.5">
            {s.stack.map((tech) => (
              <span
                key={tech}
                className="rounded-md border border-ink-600 bg-ink-800 px-2 py-0.5 text-xs text-cyan-300"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-1.5 text-xs uppercase tracking-widest text-slate-500">Lenguajes</div>
        <div className="flex flex-col gap-1">
          {langs.map(([lang, n]) => (
            <div key={lang} className="flex items-center gap-2 text-xs">
              <span className="w-20 shrink-0 text-slate-400">{lang}</span>
              <span className="h-1.5 flex-1 rounded bg-ink-700">
                <span
                  className="block h-full rounded bg-indigo-400"
                  style={{ width: `${(n / maxLang) * 100}%` }}
                />
              </span>
              <span className="w-6 text-right text-slate-500">{n}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-xs uppercase tracking-widest text-slate-500">
          Dominios ({analysis.graph.domains.length})
        </div>
        <div className="flex flex-col gap-1">
          {[...analysis.graph.domains]
            .sort((a, b) => b.files.length - a.files.length)
            .map((d) => (
              <div key={d.id} className="flex items-center gap-2 text-xs">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: d.color }}
                />
                <span className="flex-1 truncate text-slate-300">{d.label}</span>
                <span className="text-slate-500">{d.files.length}</span>
              </div>
            ))}
        </div>
      </div>

      {s.health.factors.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs uppercase tracking-widest text-slate-500">
            Qué baja la nota
          </div>
          <ul className="flex flex-col gap-1 text-xs text-slate-400">
            {s.health.factors.map((f, i) => (
              <li key={i}>
                <span className="font-mono text-red-400">{f.impact}</span> {f.label}
                <span className="block text-[11px] text-slate-500">{f.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
