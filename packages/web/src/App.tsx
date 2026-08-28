/**
 * App.tsx — Arma la pantalla y maneja el estado.
 *
 *   ┌──────────────────── Toolbar ────────────────────┐
 *   │ Sidebar │          ForceGraph          │ Inspector │
 *   └─────────┴─────────────────────────────┴───────────┘
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ProjectAnalysis } from '@codegraph/core';
import { fetchAnalysis, fetchSnapshots, watchForUpdates, type SnapshotsState } from './api.js';
import { buildVizGraph, type VizMode, type VizNode } from './graph-model.js';
import { Toolbar } from './components/Toolbar.js';
import { Sidebar } from './components/Sidebar.js';
import { Inspector } from './components/Inspector.js';
import { ForceGraph } from './components/ForceGraph.js';
import { CommandPalette, type PaletteItem } from './components/CommandPalette.js';
import { Timeline } from './components/Timeline.js';

export function App() {
  const [analysis, setAnalysis] = useState<ProjectAnalysis | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [watching, setWatching] = useState(false);

  const [selected, setSelected] = useState<VizNode | null>(null);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<VizMode>('files');
  const [groupByDomain, setGroupByDomain] = useState(false);
  const [showExternal, setShowExternal] = useState(false);
  const [showCoupling, setShowCoupling] = useState(false);
  const [domainFilter, setDomainFilter] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>();

  const timeline = analysis?.timeline;
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelineBucket, setTimelineBucket] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotsState>({ status: 'idle' });

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const load = useCallback(
    (fresh: boolean, quiet = false) => {
      if (!quiet) setRefreshing(true);
      setError(null);
      fetchAnalysis(fresh)
        .then(({ analysis: a, isDemo: demo }) => {
          setAnalysis(a);
          setIsDemo(demo);
          if (quiet) flash('Proyecto actualizado');
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setRefreshing(false));
    },
    [flash],
  );

  useEffect(() => load(false), [load]);

  // Live reload (serve --watch)
  useEffect(
    () =>
      watchForUpdates({
        onUpdate: () => load(true, true),
        onConnected: () => setWatching(true),
      }),
    [load],
  );

  // Snapshots históricos: al abrir el timeline pregunto el estado; si está
  // calculando, hago polling hasta que termine.
  useEffect(() => {
    if (!timelineOpen) return;
    let alive = true;
    const tick = async () => {
      const s = await fetchSnapshots(false);
      if (!alive) return;
      setSnapshots(s);
      if (s.status === 'computing') setTimeout(tick, 2000);
    };
    tick();
    return () => {
      alive = false;
    };
  }, [timelineOpen]);

  const computeSnapshots = useCallback(async () => {
    setSnapshots({ status: 'computing', progress: { done: 0, total: 20 } });
    const s = await fetchSnapshots(true);
    setSnapshots(s);
    if (s.status === 'computing') {
      const poll = async () => {
        const next = await fetchSnapshots(false);
        setSnapshots(next);
        if (next.status === 'computing') setTimeout(poll, 2000);
      };
      setTimeout(poll, 2000);
    }
  }, []);

  // Ctrl/Cmd + K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const hasCoupling = (analysis?.summary.temporalCoupling.length ?? 0) > 0;

  const viz = useMemo(
    () =>
      analysis
        ? buildVizGraph(analysis, { mode, showExternal, domainFilter, showCoupling })
        : null,
    [analysis, mode, showExternal, domainFilter, showCoupling],
  );

  const domainLabel =
    (domainFilter && analysis?.graph.domains.find((d) => d.id === domainFilter)?.label) || null;

  const selectFile = (path: string) => {
    if (!analysis) return;
    setMode('files');
    setDomainFilter(null);
    const node = buildVizGraph(analysis, {
      mode: 'files',
      showExternal: true,
      domainFilter: null,
    }).nodes.find((n) => n.id === path);
    if (node) setSelected(node);
  };

  const onPalettePick = (item: PaletteItem) => {
    if (item.kind === 'domain') {
      setDomainFilter(item.id);
      setSelected(null);
      return;
    }
    selectFile(item.id);
  };

  if (error) {
    return (
      <Center>
        <div className="max-w-md text-center">
          <div className="mb-2 text-lg font-semibold text-red-400">No se pudo cargar el análisis</div>
          <div className="mb-4 text-sm text-slate-400">{error}</div>
          <div className="text-xs text-slate-500">
            Corré <code className="text-slate-300">codegraph serve &lt;carpeta&gt;</code> y recargá.
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
        mode={mode}
        setMode={(m) => {
          setMode(m);
          setSelected(null);
        }}
        search={search}
        setSearch={setSearch}
        groupByDomain={groupByDomain}
        setGroupByDomain={setGroupByDomain}
        showExternal={showExternal}
        setShowExternal={setShowExternal}
        hasCoupling={hasCoupling}
        showCoupling={showCoupling}
        setShowCoupling={setShowCoupling}
        domainFilter={domainFilter}
        clearDomainFilter={() => setDomainFilter(null)}
        domainLabel={domainLabel}
        onRefresh={() => load(true)}
        refreshing={refreshing}
        watching={watching}
        onOpenPalette={() => setPaletteOpen(true)}
        hasTimeline={Boolean(timeline)}
        timelineOpen={timelineOpen}
        toggleTimeline={() => {
          setTimelineOpen((v) => {
            const next = !v;
            if (next) {
              setMode('files');
              setTimelineBucket((timeline?.buckets ?? 1) - 1);
            } else {
              setPlaying(false);
            }
            return next;
          });
        }}
      />

      {isDemo && (
        <div className="bg-amber-500/10 px-4 py-1.5 text-center text-xs text-amber-300">
          Modo demo (análisis de ejemplo). Corré{' '}
          <code className="text-amber-200">codegraph serve tu-proyecto</code> para ver el tuyo.
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <Sidebar
          analysis={analysis}
          domainFilter={domainFilter}
          onPickDomain={(id) => {
            setDomainFilter((cur) => (cur === id ? null : id));
            setSelected(null);
          }}
          onPickFile={selectFile}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="relative min-w-0 flex-1 bg-ink-950">
            <ForceGraph
              graph={viz}
              groupByDomain={groupByDomain}
              domainFilter={domainFilter}
              selectedId={selected?.id ?? null}
              search={search}
              onSelect={setSelected}
              timelineBucket={timelineOpen ? timelineBucket : null}
            />
            <div className="pointer-events-none absolute left-3 top-3 text-xs text-slate-600">
              {viz.nodes.length} nodos · {viz.links.length}{' '}
              {mode === 'files' ? 'imports' : 'llamadas'}
            </div>
            {toast && (
              <div className="toast-in absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg border border-ink-600 bg-ink-800/90 px-4 py-2 text-sm text-slate-200 backdrop-blur">
                {toast}
              </div>
            )}
          </main>
          {timelineOpen && timeline && (
            <Timeline
              timeline={timeline}
              bucket={timelineBucket}
              playing={playing}
              onBucket={setTimelineBucket}
              onPlay={setPlaying}
              onClose={() => {
                setTimelineOpen(false);
                setPlaying(false);
              }}
              snapshots={snapshots}
              onComputeSnapshots={computeSnapshots}
            />
          )}
        </div>
        {selected && (
          <Inspector
            node={selected}
            analysis={analysis}
            onClose={() => setSelected(null)}
            onNavigate={(id) => {
              const n = viz.nodes.find((x) => x.id === id);
              if (n) setSelected(n);
            }}
          />
        )}
      </div>

      {paletteOpen && (
        <CommandPalette
          analysis={analysis}
          onPick={onPalettePick}
          onClose={() => setPaletteOpen(false)}
        />
      )}
    </div>
  );
}

function Center({ children }: { children: ReactNode }) {
  return <div className="flex h-full items-center justify-center bg-ink-950">{children}</div>;
}
