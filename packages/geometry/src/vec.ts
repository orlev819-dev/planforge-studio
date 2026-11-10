import type { Vec2 } from '../../shared-types/src/index';

export const EPS = 1e-9;
/** vertices closer than this (meters) are considered the same point */
export const MERGE_TOL = 1e-3;

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2) => a.x * b.y - a.y * b.x;
export const len = (a: Vec2) => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = (a: Vec2): Vec2 => { const l = len(a); return l < EPS ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l }; };
/** left normal of a direction in plan coords */
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const rotate = (p: Vec2, deg: number, c: Vec2 = { x: 0, y: 0 }): Vec2 => {
  const r = (deg * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r);
  const dx = p.x - c.x, dy = p.y - c.y;
  return { x: c.x + dx * cs - dy * sn, y: c.y + dx * sn + dy * cs };
};
export const almostEq = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;
export const samePoint = (a: Vec2, b: Vec2, tol = MERGE_TOL) => dist(a, b) <= tol;
export const angleDeg = (a: Vec2, b: Vec2) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
/** round to 1e-9 m to keep floating noise out of persisted data */
export const clean = (n: number) => Math.round(n * 1e9) / 1e9;
export const cleanPt = (p: Vec2): Vec2 => ({ x: clean(p.x), y: clean(p.y) });

/** closest point on segment ab to p; returns param t in [0,1] and distance */
export function projectOnSegment(p: Vec2, a: Vec2, b: Vec2) {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  let t = l2 < EPS ? 0 : dot(sub(p, a), ab) / l2;
  t = Math.max(0, Math.min(1, t));
  const q = lerp(a, b, t);
  return { t, point: q, distance: dist(p, q) };
}

/** proper (interior) intersection of segments p1p2 and p3p4, excluding shared endpoints */
export function segmentsProperlyIntersect(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2, tol = 1e-9): boolean {
  const d1 = cross(sub(p4, p3), sub(p1, p3));
  const d2 = cross(sub(p4, p3), sub(p2, p3));
  const d3 = cross(sub(p2, p1), sub(p3, p1));
  const d4 = cross(sub(p2, p1), sub(p4, p1));
  if (((d1 > tol && d2 < -tol) || (d1 < -tol && d2 > tol)) && ((d3 > tol && d4 < -tol) || (d3 < -tol && d4 > tol))) return true;
  return false;
}

export function segmentsIntersectAny(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2, tol = 1e-9): boolean {
  if (segmentsProperlyIntersect(p1, p2, p3, p4, tol)) return true;
  const onSeg = (p: Vec2, a: Vec2, b: Vec2) => projectOnSegment(p, a, b).distance <= 1e-7;
  return onSeg(p1, p3, p4) || onSeg(p2, p3, p4) || onSeg(p3, p1, p2) || onSeg(p4, p1, p2);
}

/** intersection of infinite lines (p, p+d) and (q, q+e) */
export function lineIntersect(p: Vec2, d: Vec2, q: Vec2, e: Vec2): Vec2 | null {
  const den = cross(d, e);
  if (Math.abs(den) < 1e-12) return null;
  const t = cross(sub(q, p), e) / den;
  return add(p, scale(d, t));
}
