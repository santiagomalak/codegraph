/**
 * vscode.ts — Puente con la extensión de VS Code.
 *
 * Cuando la web corre dentro de un webview de la extensión (`packages/vscode`),
 * `acquireVsCodeApi` existe. En ese caso no hay servidor `codegraph serve`: el
 * análisis llega por `postMessage` y los clics en nodos abren archivos en el
 * editor (también por `postMessage`).
 *
 * Fuera del webview (web normal), todo esto es no-op y la app usa `api.ts`.
 */

import type { ProjectAnalysis } from '@codegraph/core';

interface VsCodeApi {
  postMessage: (msg: unknown) => void;
  getState: () => unknown;
  setState: (s: unknown) => void;
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
  }
}

let api: VsCodeApi | null = null;
try {
  api = window.acquireVsCodeApi ? window.acquireVsCodeApi() : null;
} catch {
  api = null;
}

/** `true` si estamos dentro del webview de la extensión. */
export const isEmbedded = (): boolean => api !== null;

let latest: ProjectAnalysis | null = null;
const listeners = new Set<(a: ProjectAnalysis) => void>();

if (api) {
  window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data as { type?: string; analysis?: ProjectAnalysis };
    if (msg?.type === 'analysis' && msg.analysis) {
      latest = msg.analysis;
      for (const cb of listeners) cb(msg.analysis);
    }
  });
}

/**
 * Pide el análisis a la extensión y espera el primero. Los siguientes (al
 * guardar un archivo) llegan por `onEmbeddedAnalysis`.
 */
export function requestEmbeddedAnalysis(): Promise<ProjectAnalysis> {
  return new Promise((resolve, reject) => {
    if (!api) return reject(new Error('no embebido'));
    if (latest) return resolve(latest);
    const cb = (a: ProjectAnalysis) => {
      listeners.delete(cb);
      resolve(a);
    };
    listeners.add(cb);
    api.postMessage({ type: 'ready' });
    setTimeout(() => {
      if (!latest) {
        listeners.delete(cb);
        reject(new Error('la extensión no respondió'));
      }
    }, 15000);
  });
}

/** Se suscribe a los análisis que manda la extensión al re-analizar. */
export function onEmbeddedAnalysis(cb: (a: ProjectAnalysis) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Le pide a la extensión que abra un archivo del proyecto en el editor. */
export function openInEditor(path: string, line?: number): void {
  api?.postMessage({ type: 'openFile', path, line });
}
