/**
 * CommandPalette.tsx — Buscador rápido (Ctrl/Cmd + K).
 *
 * Lista archivos y dominios; al elegir uno, salta a ese nodo en el grafo.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectAnalysis } from '@codegraph/core';

export interface PaletteItem {
  id: string;
  label: string;
  sub: string;
  kind: 'file' | 'domain';
}

export function CommandPalette({
  analysis,
  onPick,
  onClose,
}: {
  analysis: ProjectAnalysis;
  onPick: (item: PaletteItem) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const items = useMemo<PaletteItem[]>(() => {
    const domainOf = new Map<string, string>();
    for (const d of analysis.graph.domains) for (const f of d.files) domainOf.set(f, d.label);
    const files: PaletteItem[] = analysis.files.map((f) => ({
      id: f.path,
      label: f.path.split('/').pop() ?? f.path,
      sub: f.path,
      kind: 'file',
    }));
    const domains: PaletteItem[] = analysis.graph.domains.map((d) => ({
      id: d.id,
      label: d.label,
      sub: `dominio · ${d.files.length} archivos`,
      kind: 'domain',
    }));
    return [...domains, ...files];
  }, [analysis]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 40);
    return items
      .filter((it) => it.label.toLowerCase().includes(q) || it.sub.toLowerCase().includes(q))
      .slice(0, 40);
  }, [items, query]);

  useEffect(() => setActive(0), [query]);

  const choose = (it: PaletteItem | undefined) => {
    if (!it) return;
    onPick(it);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[36rem] max-w-[90vw] overflow-hidden rounded-xl border border-ink-600 bg-ink-850 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter') {
              choose(results[active]);
            } else if (e.key === 'Escape') {
              onClose();
            }
          }}
          placeholder="Buscar archivo o dominio…"
          className="w-full border-b border-ink-700 bg-transparent px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none"
        />
        <div className="max-h-[50vh] overflow-y-auto py-1">
          {results.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-slate-600">Nada que coincida.</div>
          )}
          {results.map((it, i) => (
            <button
              key={it.kind + it.id}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(it)}
              className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${
                i === active ? 'bg-indigo-500/15' : ''
              }`}
            >
              <span className="text-xs text-slate-600">{it.kind === 'domain' ? '◈' : '📄'}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-slate-200">{it.label}</span>
                <span className="block truncate text-[11px] text-slate-500">{it.sub}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
