/**
 * Timeline.tsx — Barra temporal: un histograma de actividad de git con un
 * playhead. Al moverlo, el grafo muestra el proyecto como estaba en esa fecha.
 */

import { useCallback, useEffect, useRef, type PointerEvent as RPE } from 'react';
import type { GitTimeline } from '@codegraph/core';

interface Props {
  timeline: GitTimeline;
  bucket: number;
  playing: boolean;
  onBucket: (b: number) => void;
  onPlay: (v: boolean) => void;
  onClose: () => void;
}

function bucketDate(t: GitTimeline, bucket: number): Date {
  const from = Date.parse(t.from);
  const to = Date.parse(t.to);
  return new Date(from + ((to - from) * (bucket + 0.5)) / t.buckets);
}

const fmt = new Intl.DateTimeFormat('es', { year: 'numeric', month: 'short', day: 'numeric' });

export function Timeline({ timeline, bucket, playing, onBucket, onPlay, onClose }: Props) {
  const barsRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const maxCount = Math.max(...timeline.commitsPerBucket, 1);
  const last = timeline.buckets - 1;

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

  return (
    <div className="flex items-center gap-3 border-t border-ink-700 bg-ink-900 px-4 py-2">
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
        onClick={onClose}
        disabled={atPresent}
        className="shrink-0 rounded-md border border-ink-600 bg-ink-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-ink-700 disabled:opacity-40"
      >
        Hoy
      </button>
    </div>
  );
}
