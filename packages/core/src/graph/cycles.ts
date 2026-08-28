/**
 * cycles.ts — Detección de dependencias circulares entre archivos.
 *
 * Usa el algoritmo de Tarjan para encontrar "componentes fuertemente conexos"
 * (SCC): grupos de archivos donde desde cualquiera se puede llegar a cualquier
 * otro siguiendo imports. Un SCC de 2+ archivos = ciclo de dependencias.
 *
 * Devuelve:
 *   - cycles: lista de grupos de archivos que forman ciclos
 *   - circularEdgeKeys: set de "origen→destino" que participan de un ciclo
 */

export interface SimpleEdge {
  source: string;
  target: string;
}

export interface CycleResult {
  cycles: string[][];
  circularEdgeKeys: Set<string>;
}

export function edgeKey(source: string, target: string): string {
  return `${source}→${target}`;
}

export function detectCycles(nodes: string[], edges: SimpleEdge[]): CycleResult {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n, []);
  for (const e of edges) {
    if (adj.has(e.source)) adj.get(e.source)!.push(e.target);
  }

  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccOf = new Map<string, number>();
  let counter = 0;
  let sccId = 0;

  // Tarjan iterativo (evita reventar la pila con proyectos grandes).
  for (const start of nodes) {
    if (index.has(start)) continue;
    const work: Array<{ node: string; i: number }> = [{ node: start, i: 0 }];

    while (work.length) {
      const frame = work[work.length - 1]!;
      const { node } = frame;

      if (frame.i === 0) {
        index.set(node, counter);
        low.set(node, counter);
        counter++;
        stack.push(node);
        onStack.add(node);
      }

      const neighbors = adj.get(node) ?? [];
      if (frame.i < neighbors.length) {
        const next = neighbors[frame.i]!;
        frame.i++;
        if (!index.has(next)) {
          work.push({ node: next, i: 0 });
        } else if (onStack.has(next)) {
          low.set(node, Math.min(low.get(node)!, index.get(next)!));
        }
        continue;
      }

      // Terminamos con `node`: ¿es raíz de un SCC?
      if (low.get(node) === index.get(node)) {
        const group: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          sccOf.set(w, sccId);
          group.push(w);
        } while (w !== node);
        sccId++;
      }

      work.pop();
      if (work.length) {
        const parent = work[work.length - 1]!.node;
        low.set(parent, Math.min(low.get(parent)!, low.get(node)!));
      }
    }
  }

  // Agrupar por SCC y quedarnos con los de tamaño > 1.
  const groups = new Map<number, string[]>();
  for (const [node, id] of sccOf) {
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id)!.push(node);
  }
  const cycles = [...groups.values()].filter((g) => g.length > 1);

  const circularEdgeKeys = new Set<string>();
  for (const e of edges) {
    const a = sccOf.get(e.source);
    const b = sccOf.get(e.target);
    if (a !== undefined && a === b) circularEdgeKeys.add(edgeKey(e.source, e.target));
  }

  return { cycles, circularEdgeKeys };
}
