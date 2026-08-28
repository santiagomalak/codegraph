/**
 * Toolbar.tsx — Barra superior: búsqueda, capas y refresco.
 */

import type { ReactNode } from 'react';

interface Props {
  search: string;
  setSearch: (v: string) => void;
  groupByDomain: boolean;
  setGroupByDomain: (v: boolean) => void;
  showExternal: boolean;
  setShowExternal: (v: boolean) => void;
  onRefresh: () => void;
  refreshing: boolean;
}

function Toggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-slate-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-indigo-500"
      />
      {children}
    </label>
  );
}

export function Toolbar(props: Props) {
  return (
    <header className="flex items-center gap-4 border-b border-ink-700 bg-ink-900 px-4 py-2.5">
      <div className="flex items-center gap-2 font-semibold text-slate-200">
        <span className="text-indigo-400">⬡</span> Code Graph
      </div>

      <input
        value={props.search}
        onChange={(e) => props.setSearch(e.target.value)}
        placeholder="Buscar archivo…"
        className="w-64 rounded-md border border-ink-600 bg-ink-850 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
      />

      <div className="flex items-center gap-4">
        <Toggle checked={props.groupByDomain} onChange={props.setGroupByDomain}>
          Agrupar por dominio
        </Toggle>
        <Toggle checked={props.showExternal} onChange={props.setShowExternal}>
          Mostrar paquetes externos
        </Toggle>
      </div>

      <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="h-2 w-4 rounded bg-fuchsia-400" /> circular
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full ring-2 ring-red-400" /> con issues
        </span>
        <button
          onClick={props.onRefresh}
          disabled={props.refreshing}
          className="rounded-md border border-ink-600 bg-ink-800 px-3 py-1.5 text-slate-300 hover:bg-ink-700 disabled:opacity-50"
        >
          {props.refreshing ? 'Analizando…' : '↻ Re-analizar'}
        </button>
      </div>
    </header>
  );
}
