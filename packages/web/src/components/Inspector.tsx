/**
 * Inspector.tsx — Panel derecho: detalle del archivo seleccionado.
 */

import type { ReactNode } from 'react';
import type { ProjectAnalysis } from '@codegraph/core';
import type { VizNode } from '../graph-model.js';

const SEVERITY_COLOR: Record<string, string> = {
  error: 'text-red-400',
  warning: 'text-amber-400',
  info: 'text-slate-400',
};

export function Inspector({
  node,
  analysis,
  onClose,
}: {
  node: VizNode;
  analysis: ProjectAnalysis;
  onClose: () => void;
}) {
  const file = analysis.files.find((f) => f.path === node.path);
  const domain = analysis.graph.domains.find((d) => d.id === node.domain);

  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-ink-700 bg-ink-900">
      <header className="sticky top-0 flex items-center justify-between border-b border-ink-700 bg-ink-900 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate font-semibold text-slate-100" title={node.path}>
            {node.label}
          </div>
          <div className="truncate text-xs text-slate-500" title={node.path}>
            {node.path}
          </div>
        </div>
        <button onClick={onClose} className="ml-2 text-slate-500 hover:text-slate-200">
          ✕
        </button>
      </header>

      <div className="flex flex-col gap-4 p-4 text-sm">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Info label="Lenguaje" value={node.language} />
          <Info label="Líneas" value={String(node.loc)} />
          <Info label="Complejidad" value={String(node.complexity)} />
          <Info label="Doc" value={file ? `${file.metrics.docCoverage}%` : '—'} />
          {domain && (
            <div className="col-span-2 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: domain.color }} />
              <span className="text-slate-400">Dominio: {domain.label}</span>
            </div>
          )}
          {node.inCycle && (
            <div className="col-span-2 rounded bg-fuchsia-500/10 px-2 py-1 text-fuchsia-300">
              ⟳ Parte de una dependencia circular
            </div>
          )}
        </div>

        {file && (
          <>
            <Section title={`Imports (${file.imports.length})`}>
              {file.imports.length === 0 && <Empty>Sin imports</Empty>}
              {file.imports.map((imp, i) => (
                <div key={i} className="flex items-center gap-2 py-0.5 text-xs">
                  <span
                    className={`rounded px-1 text-[10px] ${
                      imp.kind === 'internal'
                        ? 'bg-indigo-500/15 text-indigo-300'
                        : 'bg-ink-700 text-slate-400'
                    }`}
                  >
                    {imp.kind === 'internal' ? 'local' : 'ext'}
                  </span>
                  <span className="truncate text-slate-300" title={imp.resolved ?? imp.specifier}>
                    {imp.resolved ?? imp.specifier}
                  </span>
                </div>
              ))}
            </Section>

            <Section title={`Símbolos (${file.symbols.length})`}>
              {file.symbols.length === 0 && <Empty>Sin funciones ni clases</Empty>}
              {file.symbols.map((sym) => (
                <div key={sym.id} className="flex items-center gap-2 py-0.5 text-xs">
                  <span className="shrink-0 text-slate-600">{sym.kind === 'class' ? '◆' : 'ƒ'}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-300" title={sym.name}>
                    {sym.name}
                  </span>
                  {sym.async && <span className="shrink-0 text-[10px] text-cyan-500">async</span>}
                  {!sym.documented && (
                    <span className="shrink-0 text-[10px] text-slate-600">sin doc</span>
                  )}
                </div>
              ))}
            </Section>

            <Section title={`Issues (${file.issues.length})`}>
              {file.issues.length === 0 && <Empty>✓ Sin issues</Empty>}
              {file.issues.map((issue, i) => (
                <div key={i} className="py-1 text-xs">
                  <div className={SEVERITY_COLOR[issue.severity]}>
                    L{issue.line} · {issue.message}
                  </div>
                  <div className="truncate font-mono text-[11px] text-slate-600">
                    {issue.snippet}
                  </div>
                </div>
              ))}
            </Section>
          </>
        )}
      </div>
    </aside>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-ink-700 bg-ink-850 px-2 py-1">
      <div className="text-slate-200">{value}</div>
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-widest text-slate-500">{title}</div>
      <div className="rounded-lg border border-ink-700 bg-ink-850 p-2">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="py-1 text-xs text-slate-600">{children}</div>;
}
