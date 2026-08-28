/**
 * domains.ts — Agrupa los archivos en "dominios" (áreas del proyecto).
 *
 * Idea: si un grupo de archivos se importan mucho entre ellos y poco con el
 * resto, probablemente son una misma parte del sistema (auth, ui, parsing...).
 *
 * Usamos el algoritmo de Louvain (detección de comunidades) sobre el grafo de
 * imports. Después le ponemos nombre a cada comunidad mirando en qué carpeta
 * viven sus archivos.
 *
 * Si el proyecto no tiene imports internos, caemos a agrupar por carpeta.
 */

import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';
import type { DomainInfo } from '../model.js';
import type { SimpleEdge } from './cycles.js';

const PALETTE = [
  '#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6',
  '#ef4444', '#3b82f6', '#10b981', '#f97316', '#a855f7',
  '#06b6d4', '#eab308',
];

function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

/** Directorio común más largo de una lista de paths ("src/core" p. ej.). */
function commonDir(paths: string[]): string {
  if (paths.length === 0) return '';
  const split = paths.map((p) => dirname(p).split('/').filter(Boolean));
  const first = split[0]!;
  let prefix: string[] = [...first];
  for (const parts of split.slice(1)) {
    let k = 0;
    while (k < prefix.length && k < parts.length && prefix[k] === parts[k]) k++;
    prefix = prefix.slice(0, k);
  }
  return prefix.join('/');
}

function mostFrequentFirstSegment(paths: string[]): string {
  const counts = new Map<string, number>();
  for (const p of paths) {
    const seg = p.split('/')[0] ?? '';
    counts.set(seg, (counts.get(seg) ?? 0) + 1);
  }
  let best = '';
  let bestN = -1;
  for (const [seg, n] of counts) {
    if (n > bestN) {
      best = seg;
      bestN = n;
    }
  }
  return best;
}

function labelFor(files: string[]): string {
  const dir = commonDir(files);
  if (dir) return dir.split('/').pop()!;
  const seg = mostFrequentFirstSegment(files);
  return seg && seg.includes('.') ? 'raíz' : seg || 'raíz';
}

function domainsByDirectory(files: string[]): DomainInfo[] {
  const groups = new Map<string, string[]>();
  for (const f of files) {
    const key = f.split('/')[0] ?? 'raíz';
    const bucket = key.includes('.') ? 'raíz' : key;
    if (!groups.has(bucket)) groups.set(bucket, []);
    groups.get(bucket)!.push(f);
  }
  return [...groups.entries()].map(([label, groupFiles], i) => ({
    id: `domain:${label}`,
    label,
    files: groupFiles,
    color: PALETTE[i % PALETTE.length]!,
  }));
}

/** Mete cada grupo de 1 archivo en el grupo grande que comparte su carpeta. */
function mergeSingletons(groups: string[][]): string[][] {
  const big = groups.filter((g) => g.length > 1);
  const singles = groups.filter((g) => g.length === 1);
  if (big.length === 0) return groups;

  for (const [file] of singles as Array<[string]>) {
    const fileDir = file.slice(0, file.lastIndexOf('/'));
    let target = big[0]!;
    let bestScore = -1;
    for (const group of big) {
      const shared = commonDir([...group, file]);
      const score = shared && fileDir.startsWith(shared) ? shared.length : -1;
      if (score > bestScore) {
        bestScore = score;
        target = group;
      }
    }
    target.push(file);
  }
  return big;
}

export function detectDomains(files: string[], importEdges: SimpleEdge[]): DomainInfo[] {
  const internalEdges = importEdges.filter(
    (e) => files.includes(e.source) && files.includes(e.target) && e.source !== e.target,
  );

  if (internalEdges.length === 0) return domainsByDirectory(files);

  const g = new Graph({ type: 'undirected', multi: false, allowSelfLoops: false });
  for (const f of files) g.addNode(f);
  for (const e of internalEdges) {
    if (g.hasEdge(e.source, e.target)) {
      g.updateEdgeAttribute(e.source, e.target, 'weight', (w: number) => (w ?? 0) + 1);
    } else {
      g.addEdge(e.source, e.target, { weight: 1 });
    }
  }

  const communities = louvain(g, { resolution: 1 });

  const groups = new Map<number, string[]>();
  for (const f of files) {
    const c = communities[f] ?? -1;
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c)!.push(f);
  }

  // Ordenar por tamaño (dominio más grande primero).
  let ordered = [...groups.values()].sort((a, b) => b.length - a.length);

  // Fusionar dominios de 1 archivo dentro del dominio grande que comparte carpeta.
  ordered = mergeSingletons(ordered);

  // Evitar dos dominios con la misma etiqueta.
  const usedLabels = new Map<string, number>();
  return ordered.map((groupFiles, i) => {
    let label = labelFor(groupFiles);
    const n = usedLabels.get(label) ?? 0;
    usedLabels.set(label, n + 1);
    if (n > 0) label = `${label} (${n + 1})`;
    return {
      id: `domain:${label}`,
      label,
      files: groupFiles,
      color: PALETTE[i % PALETTE.length]!,
    };
  });
}
