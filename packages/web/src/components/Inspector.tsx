/**
 * Inspector.tsx — Panel derecho: detalle del nodo seleccionado (archivo o símbolo).
 */

import type { ReactNode } from 'react';
import type { ProjectAnalysis } from '@codegraph/core';
import { dependentsOf } from '@codegraph/core/queries';
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
  onNavigate,
}: {
  node: VizNode;
  analysis: ProjectAnalysis;
  onClose: () => void;
  onNavigate: (id: string) => void;
}) {
  return node.kind === 'symbol' ? (
    <SymbolView node={node} analysis={analysis} onClose={onClose} onNavigate={onNavigate} />
  ) : (
    <FileView node={node} analysis={analysis} onClose={onClose} onNavigate={onNavigate} />
  );
}

function Shell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-ink-700 bg-ink-900">
      <header className="sticky top-0 flex items-center justify-between border-b border-ink-700 bg-ink-900 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate font-semibold text-slate-100" title={title}>
            {title}
          </div>
          <div className="truncate text-xs text-slate-500" title={subtitle}>
            {subtitle}
          </div>
        </div>
        <button onClick={onClose} className="ml-2 text-slate-500 hover:text-slate-200">
          ✕
        </button>
      </header>
      <div className="flex flex-col gap-4 p-4 text-sm">{children}</div>
    </aside>
  );
}

function FileView({
  node,
  analysis,
  onClose,
  onNavigate,
}: {
  node: VizNode;
  analysis: ProjectAnalysis;
  onClose: () => void;
  onNavigate: (id: string) => void;
}) {
  const path = node.path ?? node.id;
  const file = analysis.files.find((f) => f.path === path);
  const domain = analysis.graph.domains.find((d) => d.id === node.domain);
  const dependents = dependentsOf(analysis, path);

  return (
    <Shell title={node.label} subtitle={path} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Info label="Lenguaje" value={node.language ?? '—'} />
        <Info label="Líneas" value={String(node.loc ?? 0)} />
        <Info label="Complejidad" value={String(node.complexity ?? 0)} />
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
          <Section title={`Importa (${file.imports.length})`}>
            {file.imports.length === 0 && <Empty>Sin imports</Empty>}
            {file.imports.map((imp, i) => (
              <Row
                key={i}
                onClick={imp.resolved ? () => onNavigate(imp.resolved!) : undefined}
                badge={imp.kind === 'internal' ? 'local' : 'ext'}
                badgeClass={
                  imp.kind === 'internal'
                    ? 'bg-indigo-500/15 text-indigo-300'
                    : 'bg-ink-700 text-slate-400'
                }
              >
                {imp.resolved ?? imp.specifier}
              </Row>
            ))}
          </Section>

          <Section title={`Lo importan (${dependents.length})`}>
            {dependents.length === 0 && <Empty>Nadie lo importa</Empty>}
            {dependents.map((d) => (
              <Row key={d} onClick={() => onNavigate(d)}>
                {d}
              </Row>
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
                <div className="truncate font-mono text-[11px] text-slate-600">{issue.snippet}</div>
              </div>
            ))}
          </Section>
        </>
      )}
    </Shell>
  );
}

function SymbolView({
  node,
  analysis,
  onClose,
  onNavigate,
}: {
  node: VizNode;
  analysis: ProjectAnalysis;
  onClose: () => void;
  onNavigate: (id: string) => void;
}) {
  const file = analysis.files.find((f) => f.path === node.file);
  const sym = file?.symbols.find((s) => s.id === node.id);
  const callEdges = analysis.graph.edges.filter((e) => e.type === 'calls');
  const calls = callEdges.filter((e) => e.source === node.id).map((e) => e.target);
  const calledBy = callEdges.filter((e) => e.target === node.id).map((e) => e.source);
  const nameOf = (id: string) => id.split('#').pop() ?? id;

  return (
    <Shell title={node.label} subtitle={node.file ?? ''} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Info label="Tipo" value={node.symKind ?? 'function'} />
        <Info label="Líneas" value={sym ? `${sym.line}–${sym.endLine}` : '—'} />
        <Info label="Exportado" value={node.exported ? 'sí' : 'no'} />
        <Info label="Doc" value={sym?.documented ? 'sí' : 'no'} />
      </div>

      <Section title="Archivo">
        <Row onClick={() => onNavigate(node.file!)}>{node.file}</Row>
      </Section>

      <Section title={`Llama a (${calls.length})`}>
        {calls.length === 0 && <Empty>No llama a otros símbolos del proyecto</Empty>}
        {calls.map((c) => (
          <Row key={c} onClick={() => onNavigate(c)}>
            {nameOf(c)}
          </Row>
        ))}
      </Section>

      <Section title={`Lo llaman (${calledBy.length})`}>
        {calledBy.length === 0 && <Empty>Nadie lo llama (¿entry point o dead code?)</Empty>}
        {calledBy.map((c) => (
          <Row key={c} onClick={() => onNavigate(c)}>
            {nameOf(c)}
          </Row>
        ))}
      </Section>
    </Shell>
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

function Row({
  children,
  onClick,
  badge,
  badgeClass,
}: {
  children: ReactNode;
  onClick?: () => void;
  badge?: string;
  badgeClass?: string;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`flex w-full items-center gap-2 py-0.5 text-left text-xs ${
        onClick ? 'text-slate-300 hover:text-indigo-300' : 'text-slate-400'
      }`}
    >
      {badge && <span className={`shrink-0 rounded px-1 text-[10px] ${badgeClass}`}>{badge}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {onClick && <span className="shrink-0 text-slate-600">→</span>}
    </Tag>
  );
}
