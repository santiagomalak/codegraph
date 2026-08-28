/**
 * hull.ts — Envolvente convexa (convex hull) para dibujar el "blob" de un dominio.
 *
 * Algoritmo de la cadena monótona de Andrew. Después expandimos el polígono
 * hacia afuera `pad` píxeles y lo devolvemos como path SVG redondeado.
 */

interface Pt {
  x?: number;
  y?: number;
}

function convexHull(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (points.length < 3) return points;
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Array<{ x: number; y: number }> = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Array<{ x: number; y: number }> = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Devuelve un path SVG del blob que envuelve a los nodos, o '' si son muy pocos. */
export function hullPath(nodes: Pt[], pad = 30): string {
  const pts = nodes
    .filter((n): n is { x: number; y: number } => n.x != null && n.y != null)
    .map((n) => ({ x: n.x, y: n.y }));
  if (pts.length < 2) return '';

  // Centro para empujar los vértices hacia afuera.
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;

  const hull = (pts.length < 3 ? pts : convexHull(pts)).map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * pad, y: p.y + (dy / len) * pad };
  });

  if (hull.length < 2) return '';
  // Curva suave cerrada (Catmull-Rom → Bézier).
  const p = (i: number) => hull[(i + hull.length) % hull.length]!;
  let d = `M${p(0).x.toFixed(1)},${p(0).y.toFixed(1)}`;
  for (let i = 0; i < hull.length; i++) {
    const p0 = p(i - 1);
    const p1 = p(i);
    const p2 = p(i + 1);
    const p3 = p(i + 2);
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d + 'Z';
}
