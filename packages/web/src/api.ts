/**
 * api.ts — Habla con `codegraph serve`.
 *
 * - En producción local la UI se sirve desde el mismo server del CLI → `/api/*`.
 * - En dev, Vite proxya `/api` al CLI (ver vite.config.ts).
 * - Si no hay server (ej: deploy estático en Vercel), cae a `/demo-analysis.json`
 *   y marca el resultado como demo.
 */

import type { ProjectAnalysis } from '@codegraph/core';

export interface LoadResult {
  analysis: ProjectAnalysis;
  isDemo: boolean;
}

export async function fetchAnalysis(fresh = false): Promise<LoadResult> {
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

/**
 * Se suscribe a los avisos de "proyecto actualizado" que manda `serve --watch`
 * por Server-Sent Events. Devuelve una función para desuscribirse.
 */
export function watchForUpdates(handlers: {
  onUpdate: () => void;
  onConnected?: () => void;
}): () => void {
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
