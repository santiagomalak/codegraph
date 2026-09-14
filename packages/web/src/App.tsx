/**
 * App.tsx — Arma la pantalla y maneja el estado.
 *
 *   ┌──────────────────── Toolbar ────────────────────┐
 *   │ Sidebar │          ForceGraph          │ Inspector │
 *   └─────────┴─────────────────────────────┴───────────┘
 *
 * El análisis puede venir de: `codegraph serve` (server), una carpeta que el
 * usuario elige y se analiza en el navegador (folder), el ejemplo (demo), o la
 * extensión de VS Code (embedded). Ver `api.ts` y `analyze-folder.ts`.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ProjectAnalysis } from '@codegraph/core';
import {
  fetchDemoAnalysis,
  fetchEmbeddedAnalysis,
  fetchServerAnalysis,
  fetchSnapshots,
  watchForUpdates,
  type AnalysisSource,
  type SnapshotsState,
} from './api.js';
import {
  analyzeDrop,
  FolderEmptyError,
  pickAndAnalyze,
  supportsDirectoryPicker,
  type FolderProgress,
} from './analyze-folder.js';
import { isEmbedded, openInEditor } from './vscode.js';
import { buildVizGraph, type VizMode, type VizNode } from './graph-model.js';
import { Toolbar } from './components/Toolbar.js';
import { Sidebar } from './components/Sidebar.js';
import { Inspector } from './components/Inspector.js';
import { ForceGraph } from './components/ForceGraph.js';
import { CommandPalette, type PaletteItem } from './components/CommandPalette.js';
import { Timeline } from './components/Timeline.js';

type FolderState =
  | { status: 'idle' }
  | { status: 'working'; progress: FolderProgress | null }
  | { status: 'error'; message: string };

export function App() {
  const [analysis, setAnalysis] = useState<ProjectAnalysis | null>(null);
  const [source, setSource] = useState<AnalysisSource | null>(null);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [watching, setWatching] = useState(false);
  const [folder, setFolder] = useState<FolderState>({ status: 'idle' });
  const [dragging, setDragging] = useState(false);

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

  const applyResult = useCallback(
    (a: ProjectAnalysis, src: AnalysisSource, quiet = false) => {
      setAnalysis(a);
      setSource(src);
      setError(null);
      setFolder({ status: 'idle' });
      if (quiet) flash('Proyecto actualizado');
    },
    [flash],
  );

  // ── Arranque: extensión → server → (nada: mostramos la bienvenida) ─────────
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const embedded = await fetchEmbeddedAnalysis();
        if (!alive) return;
        if (embedded) {
          applyResult(embedded.analysis, embedded.source);
          return;
        }
        const server = await fetchServerAnalysis();
        if (!alive) return;
        if (server) applyResult(server.analysis, server.source);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setBooting(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [applyResult]);

  // Re-análisis del server (botón "↻ Re-analizar", solo con `codegraph serve`).
  const refreshServer = useCallback(() => {
    setRefreshing(true);
    fetchServerAnalysis(true)
      .then((r) => {
        if (r) applyResult(r.analysis, r.source);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setRefreshing(false));
  }, [applyResult]);

  // Live reload (serve --watch): solo tiene sentido con un server.
  useEffect(() => {
    if (source !== 'server') return;
    return watchForUpdates({
      onUpdate: () => {
        fetchServerAnalysis(false).then((r) => r && applyResult(r.analysis, r.source, true));
      },
      onConnected: () => setWatching(true),
    });
  }, [source, applyResult]);

  // ── Analizar una carpeta (en el navegador) ────────────────────────────────
  const runFolder = useCallback(
    async (run: (onProgress: (p: FolderProgress) => void) => Promise<{ analysis: ProjectAnalysis; skipped: number; truncated: boolean }>) => {
      setFolder({ status: 'working', progress: null });
      setError(null);
      try {
        const { analysis: a, skipped, truncated } = await run((p) =>
          setFolder({ status: 'working', progress: p }),
        );
        applyResult(a, 'folder');
        setWatching(false);
        if (truncated) flash(`Muchos archivos: analicé los primeros ${a.summary.totalFiles}`);
        else if (skipped) flash(`${skipped} archivo(s) muy grande(s) quedaron afuera`);
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          setFolder({ status: 'idle' }); // el usuario canceló el selector
          return;
        }
        const message =
          e instanceof FolderEmptyError
            ? e.message
            : e instanceof Error
              ? e.message
              : String(e);
        setFolder({ status: 'error', message });
      }
    },
    [applyResult, flash],
  );

  const pickFolder = useCallback(
    () => runFolder((onProgress) => pickAndAnalyze(onProgress)),
    [runFolder],
  );

  // Arrastrar y soltar una carpeta sobre la ventana.
  useEffect(() => {
    if (isEmbedded()) return;
    const onOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        setDragging(true);
      }
    };
    const onLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const dt = e.dataTransfer;
      if (dt && dt.items.length) void runFolder((onProgress) => analyzeDrop(dt, onProgress));
    };
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [runFolder]);

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

  const loadDemo = () =>
    fetchDemoAnalysis()
      .then((r) => applyResult(r.analysis, r.source))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));

  // ── Pantallas de carga / bienvenida / error ───────────────────────────────

  if (folder.status === 'working') {
    return (
      <Center>
        <FolderProgressView progress={folder.progress} />
      </Center>
    );
  }

  if (error) {
    return (
      <Center>
        <div className="max-w-md text-center">
          <div className="mb-2 text-lg font-semibold text-red-400">No se pudo cargar el análisis</div>
          <div className="mb-4 text-sm text-slate-400">{error}</div>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => {
                setError(null);
                void pickFolder();
              }}
              className="rounded-md border border-indigo-500 bg-indigo-500/15 px-4 py-2 text-sm text-indigo-200 hover:bg-indigo-500/25"
            >
              📂 Analizar una carpeta
            </button>
            <button
              onClick={() => {
                setError(null);
                refreshServer();
              }}
              className="rounded-md border border-ink-600 bg-ink-800 px-4 py-2 text-sm text-slate-200 hover:bg-ink-700"
            >
              Reintentar
            </button>
          </div>
        </div>
      </Center>
    );
  }

  if (booting) {
    return (
      <Center>
        <div className="flex items-center gap-3 text-slate-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-600 border-t-indigo-400" />
          Buscando un análisis…
        </div>
      </Center>
    );
  }

  if (!analysis || !viz) {
    return (
      <Center>
        <Welcome
          onPick={pickFolder}
          onDemo={loadDemo}
          dragging={dragging}
          error={folder.status === 'error' ? folder.message : null}
        />
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
        onRefresh={refreshServer}
        canRefresh={source === 'server'}
        refreshing={refreshing}
        watching={watching}
        onPickFolder={isEmbedded() ? undefined : pickFolder}
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

      <SourceBanner source={source} projectName={analysis.projectName} onPick={pickFolder} />

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
              onSelect={(n) => {
                setSelected(n);
                // En VS Code: seleccionar un archivo lo abre en el editor
                // (preview, sin robar el foco).
                if (n && isEmbedded() && n.kind === 'file' && n.path) openInEditor(n.path);
              }}
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
            {dragging && <DropOverlay />}
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

/** Banner bajo la toolbar según de dónde salió el análisis. */
function SourceBanner({
  source,
  projectName,
  onPick,
}: {
  source: AnalysisSource | null;
  projectName: string;
  onPick: () => void;
}) {
  if (source === 'demo') {
    return (
      <div className="bg-amber-500/10 px-4 py-1.5 text-center text-xs text-amber-300">
        Estás viendo el ejemplo.{' '}
        <button onClick={onPick} className="font-semibold text-amber-200 underline">
          Analizá tu carpeta
        </button>{' '}
        — todo pasa en tu navegador, no se sube nada.
      </div>
    );
  }
  if (source === 'folder') {
    return (
      <div className="bg-emerald-500/10 px-4 py-1.5 text-center text-xs text-emerald-300">
        Análisis local de <span className="font-semibold">{projectName}</span> · sin historial de
        git (hotspots/timeline). Nada salió de tu navegador.
      </div>
    );
  }
  return null;
}

/** Pantalla de bienvenida: elegir carpeta o ver el ejemplo. */
function Welcome({
  onPick,
  onDemo,
  dragging,
  error,
}: {
  onPick: () => void;
  onDemo: () => void;
  dragging: boolean;
  error: string | null;
}) {
  return (
    <div className="w-full max-w-lg px-6 text-center">
      <div className="mb-2 flex items-center justify-center gap-2 text-2xl font-semibold text-slate-100">
        <span className="text-indigo-400">⬡</span> Code Graph
      </div>
      <p className="mb-6 text-sm text-slate-400">
        Convertí un proyecto en un grafo de conocimiento para entenderlo (vos o una IA) de un
        vistazo.
      </p>

      <div
        className={`rounded-xl border-2 border-dashed p-8 transition ${
          dragging ? 'border-indigo-400 bg-indigo-500/10' : 'border-ink-600 bg-ink-900/50'
        }`}
      >
        <div className="mb-3 text-4xl">📂</div>
        <button
          onClick={onPick}
          className="rounded-md border border-indigo-500 bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400"
        >
          Analizar una carpeta
        </button>
        <div className="mt-3 text-xs text-slate-500">
          {supportsDirectoryPicker() ? 'o arrastrala acá' : 'o arrastrala a la ventana'} · todo se
          procesa en tu navegador, nada se sube
        </div>
      </div>

      {error && <div className="mt-4 text-sm text-red-400">{error}</div>}

      <div className="mt-6 text-xs text-slate-500">
        ¿Solo mirando?{' '}
        <button onClick={onDemo} className="text-slate-300 underline hover:text-slate-100">
          ver el ejemplo
        </button>
      </div>
    </div>
  );
}

function FolderProgressView({ progress }: { progress: FolderProgress | null }) {
  const label =
    !progress || progress.phase === 'reading'
      ? 'Leyendo archivos…'
      : `Parseando ${progress.done}/${progress.total}`;
  const pct =
    progress && progress.phase === 'parsing' && progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : null;
  return (
    <div className="w-full max-w-sm px-6 text-center">
      <div className="mb-3 flex items-center justify-center gap-3 text-slate-300">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-600 border-t-indigo-400" />
        {label}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink-800">
        <div
          className="h-full rounded-full bg-indigo-500 transition-all"
          style={{ width: pct === null ? '40%' : `${pct}%` }}
        />
      </div>
      {progress?.path && (
        <div className="mt-2 truncate text-xs text-slate-600">{progress.path}</div>
      )}
    </div>
  );
}

function DropOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-ink-950/70 backdrop-blur-sm">
      <div className="rounded-xl border-2 border-dashed border-indigo-400 px-10 py-8 text-center text-indigo-200">
        <div className="text-4xl">📂</div>
        <div className="mt-2 text-sm font-semibold">Soltá la carpeta para analizarla</div>
      </div>
    </div>
  );
}
