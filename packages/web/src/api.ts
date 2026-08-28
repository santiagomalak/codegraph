/**
 * api.ts — Habla con `codegraph serve`.
 *
 * - En producción local la UI se sirve desde el mismo server del CLI → `/api/*`.
 * - En dev, Vite proxya `/api` al CLI (ver vite.config.ts).
 * - Si no hay server (ej: deploy estático en Vercel), cae a `/demo-analysis.json`
 *   y marca el resultado como demo.
 */

import type { ProjectAnalysis, SnapshotSeries } from '@codegraph/core';
import { isEmbedded, onEmbeddedAnalysis, requestEmbeddedAnalysis } from './vscode.js';

export interface LoadResult {
  analysis: ProjectAnalysis;
  isDemo: boolean;
  /** `true` si corre dentro de la extensión de VS Code (no hay server). */
  embedded?: boolean;
}

export async function fetchAnalysis(fresh = false): Promise<LoadResult> {
  if (isEmbedded()) {
    return { analysis: await requestEmbeddedAnalysis(), isDemo: false, embedded: true };
  }
  try {
    const res = await fetch(`/api/analysis${fresh ? '?fresh=1' : ''}`);
    if (res.ok) return { analysis: (await res.json()) as ProjectAnalysis, isDemo: false };
  } catch {
    /* sin server: probamos el demo */
  }
  const demo = await fetch('/demo-analysis.json');
  if (!demo.ok) throw new Error('No hay servidor (`codegraph serve`) ni demo disponible.');
  return { analysis: (await demo.json()) as ProjectAnalysis, isDemo: true };
}

export type SnapshotsState =
  | { status: 'ready'; series: SnapshotSeries }
  | { status: 'computing'; progress: { done: number; total: number } }
  | { status: 'idle' }
  | { status: 'unavailable' }; // no hay server (deploy estático)

/** Estado de los snapshots históricos. `compute: true` arranca el cálculo. */
export async function fetchSnapshots(compute = false): Promise<SnapshotsState> {
  if (isEmbedded()) return { status: 'unavailable' }; // en VS Code no hay /api
  try {
    const res = await fetch('/api/snapshots', { method: compute ? 'POST' : 'GET' });
    if (res.ok) return (await res.json()) as SnapshotsState;
  } catch {
    /* sin server */
  }
  return { status: 'unavailable' };
}

/**
 * Se suscribe a los avisos de "proyecto actualizado" que manda `serve --watch`
 * por Server-Sent Events. Devuelve una función para desuscribirse.
 */
export function watchForUpdates(handlers: {
  onUpdate: () => void;
  onConnected?: () => void;
}): () => void {
  if (isEmbedded()) {
    // En la extensión los updates llegan por postMessage al re-analizar.
    handlers.onConnected?.();
    return onEmbeddedAnalysis(() => handlers.onUpdate());
  }
  let es: EventSource | null = null;
  try {
    es = new EventSource('/api/events');
    es.addEventListener('open', () => handlers.onConnected?.());
    es.addEventListener('updated', () => handlers.onUpdate());
    es.onerror = () => {
      /* server sin --watch o deploy estático: lo ignoramos */
    };
  } catch {
    /* EventSource no disponible */
  }
  return () => es?.close();
}
