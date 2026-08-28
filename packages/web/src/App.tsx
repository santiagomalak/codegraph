/**
 * App.tsx — Arma la pantalla y maneja el estado.
 *
 * Layout:
 *   ┌──────────────── Toolbar ────────────────┐
 *   │ Sidebar │        ForceGraph      │ Inspector │
 *   └─────────┴───────────────────────┴───────────┘
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ProjectAnalysis } from '@codegraph/core';
import { fetchAnalysis } from './api.js';
import { buildVizGraph, type VizNode } from './graph-model.js';
import { Toolbar } from './components/Toolbar.js';
import { Sidebar } from './components/Sidebar.js';
import { Inspector } from './components/Inspector.js';
import { ForceGraph } from './components/ForceGraph.js';

export function App() {
  const [analysis, setAnalysis] = useState<ProjectAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [selected, setSelected] = useState<VizNode | null>(null);
  const [search, setSearch] = useState('');
  const [groupByDomain, setGroupByDomain] = useState(false);
  const [showExternal, setShowExternal] = useState(false);

  const load = (fresh: boolean) => {
    setRefreshing(true);
    setError(null);
    fetchAnalysis(fresh)
      .then((a) => {
        setAnalysis(a);
        setSelected(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setRefreshing(false));
  };

  useEffect(() => load(false), []);

  const viz = useMemo(
    () => (analysis ? buildVizGraph(analysis, { showExternal }) : null),
    [analysis, showExternal],
  );

  if (error) {
    return (
      <Center>
        <div className="max-w-md text-center">
          <div className="mb-2 text-lg font-semibold text-red-400">No se pudo cargar el análisis</div>
          <div className="mb-4 text-sm text-slate-400">{error}</div>
          <div className="text-xs text-slate-500">
            Asegurate de tener corriendo <code className="text-slate-300">codegraph serve &lt;carpeta&gt;</code>.
          </div>
          <button
            onClick={() => load(true)}
            className="mt-4 rounded-md border border-ink-600 bg-ink-800 px-4 py-2 text-sm text-slate-200 hover:bg-ink-700"
          >
            Reintentar
          </button>
        </div>
      </Center>
    );
  }

  if (!analysis || !viz) {
    return (
      <Center>
        <div className="flex items-center gap-3 text-slate-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-600 border-t-indigo-400" />
          Analizando proyecto…
        </div>
      </Center>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        search={search}
        setSearch={setSearch}
        groupByDomain={groupByDomain}
        setGroupByDomain={setGroupByDomain}
        showExternal={showExternal}
        setShowExternal={setShowExternal}
        onRefresh={() => load(true)}
        refreshing={refreshing}
      />
      <div className="flex min-h-0 flex-1">
        <Sidebar analysis={analysis} />
        <main className="relative min-w-0 flex-1 bg-ink-950">
          <ForceGraph
            graph={viz}
            groupByDomain={groupByDomain}
            selectedId={selected?.id ?? null}
            search={search}
            onSelect={setSelected}
          />
          <div className="pointer-events-none absolute left-3 top-3 text-xs text-slate-600">
            {viz.nodes.length} nodos · {viz.links.length} dependencias
          </div>
        </main>
        {selected && (
          <Inspector node={selected} analysis={analysis} onClose={() => setSelected(null)} />
        )}
      </div>
    </div>
  );
}

function Center({ children }: { children: ReactNode }) {
  return <div className="flex h-full items-center justify-center bg-ink-950">{children}</div>;
}
