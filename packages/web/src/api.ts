/**
 * api.ts — De dónde saca la web el análisis.
 *
 * Tres orígenes posibles:
 *   - 'server' → `codegraph serve` corriendo (local, o Vite proxya `/api`).
 *   - 'folder' → el usuario eligió una carpeta y se analizó en el navegador
 *     (ver `analyze-folder.ts`).
 *   - 'demo'   → el análisis de ejemplo (`/demo-analysis.json`), para el deploy
 *     estático de Vercel cuando nadie eligió nada.
 * Dentro del webview de VS Code el análisis llega por `postMessage` (`embedded`).
 */

import type { ProjectAnalysis, SnapshotSeries } from '@codegraph/core';
import { isEmbedded, onEmbeddedAnalysis, requestEmbeddedAnalysis } from './vscode.js';

export type AnalysisSource = 'server' | 'folder' | 'demo' | 'embedded';

export interface LoadResult {
  analysis: ProjectAnalysis;
  source: AnalysisSource;
}

/** Si corre dentro de VS Code, pide el análisis a la extensión. Si no, `null`. */
export async function fetchEmbeddedAnalysis(): Promise<LoadResult | null> {
  if (!isEmbedded()) return null;
  return { analysis: await requestEmbeddedAnalysis(), source: 'embedded' };
}

/**
 * Pregunta a `codegraph serve`. Devuelve `null` si no hay servidor.
 *
 * En un deploy estático `/api/analysis` devuelve el `index.html` (por el rewrite
 * de SPA), así que además del `ok` chequeamos que la respuesta sea JSON.
 */
export async function fetchServerAnalysis(fresh = false): Promise<LoadResult | null> {
  try {
    const res = await fetch(`/api/analysis${fresh ? '?fresh=1' : ''}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(fresh ? 120_000 : 4000),
    });
    const isJson = res.headers.get('content-type')?.includes('application/json');
    if (res.ok && isJson) {
      return { analysis: (await res.json()) as ProjectAnalysis, source: 'server' };
    }
  } catch {
    /* sin server */
  }
  return null;
}

/** Carga el análisis de ejemplo. Lanza si no está (deploy sin `npm run demo`). */
export async function fetchDemoAnalysis(): Promise<LoadResult> {
  const demo = await fetch('demo-analysis.json');
  if (!demo.ok) throw new Error('No hay análisis de ejemplo disponible.');
  return { analysis: (await demo.json()) as ProjectAnalysis, source: 'demo' };
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
