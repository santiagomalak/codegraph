/**
 * api.ts — Habla con `codegraph serve`.
 *
 * En producción la UI se sirve desde el mismo server del CLI, así que `/api/...`
 * es same-origin. En dev, Vite proxya `/api` al CLI (ver vite.config.ts).
 */

import type { ProjectAnalysis } from '@codegraph/core';

export async function fetchAnalysis(fresh = false): Promise<ProjectAnalysis> {
  const res = await fetch(`/api/analysis${fresh ? '?fresh=1' : ''}`);
  if (!res.ok) throw new Error(`El servidor respondió ${res.status}`);
  return (await res.json()) as ProjectAnalysis;
}
