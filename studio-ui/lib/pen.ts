import type { CanvasPathPoint } from "@sitehie/core/domain";

/** A path being authored/edited by the pen tool. Always a full snapshot —
 *  every mutation produces a new draft; one commit per gesture. */
export type PenDraft = { points: CanvasPathPoint[]; closed: boolean };

export type XY = { x: number; y: number };

/** Distance from p to the cubic bezier segment a→b, via coarse sampling
 *  (24 steps — plenty for click-target tolerance). */
export function distToSegment(p: XY, a: CanvasPathPoint, b: CanvasPathPoint): number {
  const c1 = { x: a.x + (a.handleOut?.x ?? 0), y: a.y + (a.handleOut?.y ?? 0) };
  const c2 = { x: b.x + (b.handleIn?.x ?? 0), y: b.y + (b.handleIn?.y ?? 0) };
  let best = Infinity;
  let prev = { x: a.x, y: a.y };
  for (let i = 1; i <= 24; i++) {
    const t = i / 24;
    const mt = 1 - t;
    const x = mt * mt * mt * a.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * b.x;
    const y = mt * mt * mt * a.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * b.y;
    const dx = x - prev.x;
    const dy = y - prev.y;
    const len2 = dx * dx + dy * dy;
    let ts = len2 === 0 ? 0 : ((p.x - prev.x) * dx + (p.y - prev.y) * dy) / len2;
    ts = Math.max(0, Math.min(1, ts));
    best = Math.min(best, Math.hypot(p.x - (prev.x + ts * dx), p.y - (prev.y + ts * dy)));
    prev = { x, y };
  }
  return best;
}

/** Splits cubic segment a→b at parameter t (de Casteljau). Returns the two
 *  new endpoint vertices and the shared midpoint vertex, all with correct
 *  relative handles so the curve shape is preserved exactly. */
export function splitSegment(
  a: CanvasPathPoint,
  b: CanvasPathPoint,
  t: number
): { left: CanvasPathPoint; mid: CanvasPathPoint; right: CanvasPathPoint } {
  const p0 = { x: a.x, y: a.y };
  const p1 = { x: a.x + (a.handleOut?.x ?? 0), y: a.y + (a.handleOut?.y ?? 0) };
  const p2 = { x: b.x + (b.handleIn?.x ?? 0), y: b.y + (b.handleIn?.y ?? 0) };
  const p3 = { x: b.x, y: b.y };
  const lerp = (u: XY, v: XY, s: number): XY => ({ x: u.x + (v.x - u.x) * s, y: u.y + (v.y - u.y) * s });
  const q0 = lerp(p0, p1, t);
  const q1 = lerp(p1, p2, t);
  const q2 = lerp(p2, p3, t);
  const r0 = lerp(q0, q1, t);
  const r1 = lerp(q1, q2, t);
  const s0 = lerp(r0, r1, t);
  return {
    left: { x: a.x, y: a.y, handleIn: a.handleIn, handleOut: { x: q0.x - a.x, y: q0.y - a.y }, corner: a.corner },
    mid: { x: s0.x, y: s0.y, handleIn: { x: r0.x - s0.x, y: r0.y - s0.y }, handleOut: { x: r1.x - s0.x, y: r1.y - s0.y }, corner: false },
    right: { x: b.x, y: b.y, handleIn: { x: q2.x - b.x, y: q2.y - b.y }, handleOut: b.handleOut, corner: b.corner },
  };
}

/** Inserts a new point on the segment nearest to p (within tol). Returns the
 *  new points array and the index of the inserted point, or null if no
 *  segment is within tolerance. */
export function insertPointNear(
  points: CanvasPathPoint[],
  closed: boolean,
  p: XY,
  tol: number
): { points: CanvasPathPoint[]; index: number } | null {
  if (points.length < 2) return null;
  const pairs: [number, number][] = [];
  for (let i = 0; i < points.length - 1; i++) pairs.push([i, i + 1]);
  if (closed) pairs.push([points.length - 1, 0]);

  let bestSeg = -1;
  let bestD = Infinity;
  for (const [ia, ib] of pairs) {
    const d = distToSegment(p, points[ia], points[ib]);
    if (d < bestD) {
      bestD = d;
      bestSeg = ia;
    }
  }
  if (bestSeg < 0 || bestD > tol) return null;

  const ib = (bestSeg + 1) % points.length;
  // Refine t around the nearest sampled parameter.
  let bestT = 0.5;
  let bestTd = Infinity;
  for (let s = 1; s < 40; s++) {
    const t = s / 40;
    const { mid } = splitSegment(points[bestSeg], points[ib], t);
    const dd = Math.hypot(p.x - mid.x, p.y - mid.y);
    if (dd < bestTd) {
      bestTd = dd;
      bestT = t;
    }
  }
  const { left, mid, right } = splitSegment(points[bestSeg], points[ib], bestT);
  const next = points.slice();
  next[bestSeg] = left;
  next[ib] = right;
  next.splice(bestSeg + 1, 0, mid);
  return { points: next, index: bestSeg + 1 };
}

/** Removes a point, preserving neighbor handles. */
export function removePoint(points: CanvasPathPoint[], index: number): CanvasPathPoint[] {
  return points.filter((_, i) => i !== index);
}
