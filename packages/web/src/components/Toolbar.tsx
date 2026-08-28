/**
 * Toolbar.tsx — Barra superior: vista, búsqueda, capas y refresco.
 */

import type { ReactNode } from 'react';
import type { VizMode } from '../graph-model.js';

interface Props {
  mode: VizMode;
  setMode: (m: VizMode) => void;
  search: string;
  setSearch: (v: string) => void;
  groupByDomain: boolean;
  setGroupByDomain: (v: boolean) => void;
  showExternal: boolean;
  setShowExternal: (v: boolean) => void;
  domainFilter: string | null;
  clearDomainFilter: () => void;
  domainLabel: string | null;
  onRefresh: () => void;
  refreshing: boolean;
  watching: boolean;
  onOpenPalette: () => void;
}

function Toggle({
  checked,
  onChange,
  disabled,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      className={`flex select-none items-center gap-2 text-xs ${
        disabled ? 'cursor-not-allowed text-slate-600' : 'cursor-pointer text-slate-300'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-indigo-500"
      />
      {children}
    </label>
  );
}

function Segmented({ value, onChange }: { value: VizMode; onChange: (m: VizMode) => void }) {
  return (
    <div className="flex rounded-lg border border-ink-600 bg-ink-850 p-0.5 text-xs">
      {(['files', 'symbols'] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`rounded-md px-2.5 py-1 transition ${
            value === m ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {m === 'files' ? 'Archivos' : 'Símbolos'}
        </button>
      ))}
    </div>
  );
}

export function Toolbar(props: Props) {
  const filesMode = props.mode === 'files';
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink-700 bg-ink-900 px-4 py-2.5">
      <div className="flex items-center gap-2 font-semibold text-slate-200">
        <span className="text-indigo-400">⬡</span> Code Graph
      </div>

      <Segmented value={props.mode} onChange={props.setMode} />

      <button
        onClick={props.onOpenPalette}
        className="flex items-center gap-2 rounded-md border border-ink-600 bg-ink-850 px-3 py-1.5 text-sm text-slate-500 transition hover:text-slate-300"
      >
        Buscar…
        <kbd className="rounded border border-ink-600 bg-ink-800 px-1 text-[10px]">Ctrl K</kbd>
      </button>

      {props.domainFilter && (
        <button
          onClick={props.clearDomainFilter}
          className="flex items-center gap-1.5 rounded-md bg-indigo-500/15 px-2.5 py-1 text-xs text-indigo-300 transition hover:bg-indigo-500/25"
        >
          dominio: {props.domainLabel} <span className="text-indigo-400">✕</span>
        </button>
      )}

      <div className="flex items-center gap-4">
        <Toggle
          checked={props.groupByDomain}
          onChange={props.setGroupByDomain}
          disabled={!filesMode}
        >
          Agrupar por dominio
        </Toggle>
        <Toggle checked={props.showExternal} onChange={props.setShowExternal} disabled={!filesMode}>
          Paquetes externos
        </Toggle>
      </div>

      <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
        {props.watching && (
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            en vivo
          </span>
        )}
        <button
          onClick={props.onRefresh}
          disabled={props.refreshing}
          className="rounded-md border border-ink-600 bg-ink-800 px-3 py-1.5 text-slate-300 transition hover:bg-ink-700 disabled:opacity-50"
        >
          {props.refreshing ? 'Analizando…' : '↻ Re-analizar'}
        </button>
      </div>
    </header>
  );
}
