/**
 * Timeline.tsx — Barra temporal: un histograma de actividad de git con un
 * playhead. Al moverlo, el grafo muestra el proyecto como estaba en esa fecha.
 *
 * Con "precisión histórica" (snapshots reales) muestra además un panel con las
 * métricas REALES de la época del playhead (health, archivos, complejidad…),
 * no las de hoy.
 */

import { useCallback, useEffect, useRef, useState, type PointerEvent as RPE } from 'react';
import type { GitTimeline, SnapshotPoint } from '@codegraph/core';
import type { SnapshotsState } from '../api.js';

interface Props {
  timeline: GitTimeline;
  bucket: number;
  playing: boolean;
  onBucket: (b: number) => void;
  onPlay: (v: boolean) => void;
  onClose: () => void;
  snapshots: SnapshotsState;
  onComputeSnapshots: () => void;
}

function bucketDate(t: GitTimeline, bucket: number): Date {
  const from = Date.parse(t.from);
  const to = Date.parse(t.to);
  // En los extremos, la fecha exacta (así el snapshot de "hoy" = HEAD, no el anterior).
  if (bucket <= 0) return new Date(from);
  if (bucket >= t.buckets - 1) return new Date(to);
  return new Date(from + ((to - from) * (bucket + 0.5)) / t.buckets);
}

const fmt = new Intl.DateTimeFormat('es', { year: 'numeric', month: 'short', day: 'numeric' });

/** El snapshot cuya fecha está más cerca de `date`. */
function nearestSnapshot(points: SnapshotPoint[], date: Date): SnapshotPoint | null {
  if (points.length === 0) return null;
  const t = date.getTime();
  let best = points[0]!;
  let bestGap = Infinity;
  for (const p of points) {
    const gap = Math.abs(Date.parse(p.date) - t);
    if (gap < bestGap) {
      bestGap = gap;
      best = p;
    }
  }
  return best;
}

const GRADE_COLOR: Record<string, string> = {
  A: '#34d399',
  B: '#a3e635',
  C: '#fbbf24',
  D: '#fb923c',
  F: '#f87171',
};

export function Timeline({
  timeline,
  bucket,
  playing,
  onBucket,
  onPlay,
  onClose,
  snapshots,
  onComputeSnapshots,
}: Props) {
  const barsRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const maxCount = Math.max(...timeline.commitsPerBucket, 1);
  const last = timeline.buckets - 1;
  const [precision, setPrecision] = useState(false);

  const setFromX = useCallback(
    (clientX: number) => {
      const el = barsRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      onBucket(Math.round(pct * last));
    },
    [last, onBucket],
  );

  const onDown = (e: RPE) => {
    dragging.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    onPlay(false);
    setFromX(e.clientX);
  };
  const onMove = (e: RPE) => {
    if (dragging.current) setFromX(e.clientX);
  };
  const onUp = () => {
    dragging.current = false;
  };

  // Reproducción automática
  useEffect(() => {
    if (!playing) return;
    if (bucket >= last) {
      onPlay(false);
      return;
    }
    const id = setTimeout(() => onBucket(bucket + 1), 260);
    return () => clearTimeout(id);
  }, [playing, bucket, last, onBucket, onPlay]);

  const atPresent = bucket >= last;
  const series = snapshots.status === 'ready' ? snapshots.series : null;
  const point = series ? nearestSnapshot(series.points, bucketDate(timeline, bucket)) : null;

  const jumpTo = (isoDate: string) => {
    const from = Date.parse(timeline.from);
    const to = Date.parse(timeline.to);
    const pct = (Date.parse(isoDate) - from) / Math.max(1, to - from);
    onBucket(Math.max(0, Math.min(last, Math.round(pct * last))));
  };

  return (
    <div className="border-t border-ink-700 bg-ink-900">
      {/* Panel de precisión histórica */}
      {precision && (
        <div className="border-b border-ink-800 px-4 py-2 text-xs">
          {snapshots.status === 'unavailable' && (
            <span className="text-slate-500">
              Necesitás <code className="text-slate-300">codegraph serve</code> para calcular
              snapshots históricos.
            </span>
          )}
          {snapshots.status === 'idle' && (
            <button
              onClick={onComputeSnapshots}
              className="rounded-md border border-indigo-500/40 bg-indigo-500/10 px-3 py-1 text-indigo-300 hover:bg-indigo-500/20"
            >
              Calcular ~20 puntos de la historia (re-analiza con git worktree, tarda un rato)
            </button>
          )}
          {snapshots.status === 'computing' && (
            <span className="flex items-center gap-2 text-slate-400">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-ink-600 border-t-indigo-400" />
              Analizando la historia… {snapshots.progress.done}/{snapshots.progress.total}
            </span>
          )}
          {series && point && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              <span className="font-mono text-slate-500">{point.date.slice(0, 10)}</span>
              <Metric
                label="Health"
                value={`${point.health} (${point.grade})`}
                color={GRADE_COLOR[point.grade]}
              />
              <Metric label="Archivos" value={String(point.files)} />
              <Metric label="Líneas" value={point.loc.toLocaleString('es')} />
              <Metric label="Complejidad" value={String(point.avgComplexity)} />
              <Metric label="Ciclos" value={String(point.circularDeps)} />
              {/* sparkline de health, clickable */}
              <span className="flex items-end gap-px" title="Health en el tiempo — clic para saltar">
                {series.points.map((p) => {
                  const h = Math.max(6, p.health);
                  return (
                    <button
                      key={p.sha}
                      onClick={() => jumpTo(p.date)}
                      className="w-1.5 rounded-sm transition-colors hover:opacity-100"
                      style={{
                        height: `${(h / 100) * 22}px`,
                        background: p.sha === point.sha ? '#818cf8' : '#3f4657',
                        opacity: p.sha === point.sha ? 1 : 0.7,
                      }}
                    />
                  );
                })}
              </span>
            </div>
          )}
        </div>
      )}

      {/* La barra */}
      <div className="flex items-center gap-3 px-4 py-2">
        <button
          onClick={() => onPlay(!playing)}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-ink-600 bg-ink-800 text-slate-300 hover:bg-ink-700"
          title={playing ? 'Pausar' : 'Reproducir'}
        >
          {playing ? '❚❚' : '▶'}
        </button>

        <div
          ref={barsRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          className="relative flex h-10 flex-1 cursor-pointer items-end gap-px"
        >
          {timeline.commitsPerBucket.map((c, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm transition-colors"
              style={{
                height: `${Math.max(8, (c / maxCount) * 100)}%`,
                background: i <= bucket ? '#6366f1' : '#2f3547',
              }}
            />
          ))}
          {/* playhead */}
          <div
            className="pointer-events-none absolute -top-1 bottom-0"
            style={{ left: `${(bucket / last) * 100}%` }}
          >
            <div className="absolute -left-1.5 -top-1 h-3 w-3 rounded-full border-2 border-white bg-indigo-500" />
            <div className="h-full w-0.5 bg-white" />
          </div>
        </div>

        <div className="w-28 shrink-0 text-right text-xs text-slate-400">
          {fmt.format(bucketDate(timeline, bucket))}
        </div>

        <button
          onClick={() => setPrecision((v) => !v)}
          className={`shrink-0 rounded-md border px-2.5 py-1.5 text-xs transition ${
            precision
              ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300'
              : 'border-ink-600 bg-ink-800 text-slate-400 hover:bg-ink-700'
          }`}
          title="Métricas reales de cada época (re-analiza la historia)"
        >
          📊 precisión histórica
        </button>

        <button
          onClick={onClose}
          disabled={atPresent}
          className="shrink-0 rounded-md border border-ink-600 bg-ink-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-ink-700 disabled:opacity-40"
        >
          Hoy
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium" style={color ? { color } : { color: '#cbd5e1' }}>
        {value}
      </span>
    </span>
  );
}
