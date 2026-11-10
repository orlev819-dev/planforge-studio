import type { Vec2 } from '../../shared-types/src/index';
import { add, cross, dist, lineIntersect, norm, perp, scale, segmentsIntersectAny, sub, samePoint, projectOnSegment } from './vec';

/** Shoelace signed area. Positive = counter-clockwise in a y-up frame (clockwise on a y-down screen). */
export function signedArea(pts: Vec2[]): number {
  let s = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}
export const polygonArea = (pts: Vec2[]) => Math.abs(signedArea(pts));

export function perimeter(pts: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) s += dist(pts[i], pts[(i + 1) % pts.length]);
  return s;
}

export function centroid(pts: Vec2[]): Vec2 {
  const A = signedArea(pts);
  if (Math.abs(A) < 1e-12) {
    const s = pts.reduce((acc, p) => add(acc, p), { x: 0, y: 0 });
    return scale(s, 1 / pts.length);
  }
  let cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const f = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * f;
    cy += (a.y + b.y) * f;
  }
  return { x: cx / (6 * A), y: cy / (6 * A) };
}

export function pointInPolygon(p: Vec2, pts: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function pointOnBoundary(p: Vec2, pts: Vec2[], tol = 1e-6): boolean {
  for (let i = 0; i < pts.length; i++) if (projectOnSegment(p, pts[i], pts[(i + 1) % pts.length]).distance <= tol) return true;
  return false;
}

export interface PolygonIssue { code: string; message: string }

/** Validates a closed polygon: >=3 vertices, no duplicates, non-zero area, no self-intersection. */
export function validatePolygon(pts: Vec2[], minArea = 0.01): PolygonIssue | null {
  if (pts.length < 3) return { code: 'too-few', message: 'A room needs at least 3 corners.' };
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++)
      if (samePoint(pts[i], pts[j])) return { code: 'duplicate', message: 'Two corners are at the same position.' };
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a1 = pts[i], a2 = pts[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      const b1 = pts[j], b2 = pts[(j + 1) % n];
      if (segmentsIntersectAny(a1, a2, b1, b2)) return { code: 'self-intersect', message: 'Walls would cross each other.' };
    }
  }
  if (polygonArea(pts) < minArea) return { code: 'degenerate', message: 'The room has (almost) zero area.' };
  // collinear back-tracking (spike) check
  for (let i = 0; i < n; i++) {
    const p = pts[(i + n - 1) % n], c = pts[i], q = pts[(i + 1) % n];
    const d1 = norm(sub(c, p)), d2 = norm(sub(q, c));
    if (Math.abs(cross(d1, d2)) < 1e-9 && d1.x * d2.x + d1.y * d2.y < 0) return { code: 'spike', message: 'A wall folds back on itself.' };
  }
  return null;
}

/**
 * Inset polygon: each edge i is moved inward by offsets[i]. Used for net interior area
 * (walls are modelled on their centerline). Returns null if the inset collapses.
 */
export function insetPolygon(pts: Vec2[], offsets: number[]): Vec2[] | null {
  const n = pts.length;
  const ccw = signedArea(pts) > 0;
  const lines = pts.map((a, i) => {
    const b = pts[(i + 1) % n];
    const d = norm(sub(b, a));
    // interior is to the left of a->b when ccw (y-up math), right otherwise
    const inward = ccw ? perp(d) : scale(perp(d), -1);
    return { p: add(a, scale(inward, offsets[i])), d };
  });
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = lines[(i + n - 1) % n], cur = lines[i];
    const x = lineIntersect(prev.p, prev.d, cur.p, cur.d);
    out.push(x ?? cur.p);
  }
  if (Math.sign(signedArea(out)) !== Math.sign(signedArea(pts))) return null;
  if (validatePolygon(out, 0) && validatePolygon(out, 0)!.code === 'self-intersect') return null;
  return out;
}

/** Ear-clipping triangulation. Returns index triples into pts. */
export function triangulate(pts: Vec2[]): [number, number, number][] {
  const n = pts.length;
  if (n < 3) return [];
  const idx = pts.map((_, i) => i);
  if (signedArea(pts) < 0) idx.reverse();
  const tris: [number, number, number][] = [];
  const isEar = (i0: number, i1: number, i2: number, remaining: number[]) => {
    const a = pts[i0], b = pts[i1], c = pts[i2];
    if (cross(sub(b, a), sub(c, b)) <= 1e-12) return false;
    for (const j of remaining) {
      if (j === i0 || j === i1 || j === i2) continue;
      const p = pts[j];
      const c1 = cross(sub(b, a), sub(p, a)), c2 = cross(sub(c, b), sub(p, b)), c3 = cross(sub(a, c), sub(p, c));
      if (c1 >= -1e-12 && c2 >= -1e-12 && c3 >= -1e-12) return false;
    }
    return true;
  };
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let clipped = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k + idx.length - 1) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length];
      if (isEar(i0, i1, i2, idx)) {
        tris.push([i0, i1, i2]);
        idx.splice(k, 1);
        clipped = true;
        break;
      }
    }
    if (!clipped) break; // degenerate input; return what we have
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  return tris;
}

/** A point guaranteed inside the polygon (for labels). */
export function interiorPoint(pts: Vec2[]): Vec2 {
  const c = centroid(pts);
  if (pointInPolygon(c, pts)) return c;
  const tris = triangulate(pts);
  let best = c, bestA = -1;
  for (const [i, j, k] of tris) {
    const a = polygonArea([pts[i], pts[j], pts[k]]);
    if (a > bestA) { bestA = a; best = { x: (pts[i].x + pts[j].x + pts[k].x) / 3, y: (pts[i].y + pts[j].y + pts[k].y) / 3 }; }
  }
  return best;
}

export function bbox(pts: Vec2[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  return { minX, minY, maxX, maxY };
}

/** true when the interiors of two simple polygons overlap (touching edges allowed). */
export function polygonsOverlap(a: Vec2[], b: Vec2[]): boolean {
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++) {
      const a1 = a[i], a2 = a[(i + 1) % a.length], b1 = b[j], b2 = b[(j + 1) % b.length];
      // proper crossing
      const d1 = cross(sub(b2, b1), sub(a1, b1)), d2 = cross(sub(b2, b1), sub(a2, b1));
      const d3 = cross(sub(a2, a1), sub(b1, a1)), d4 = cross(sub(a2, a1), sub(b2, a1));
      if (d1 * d2 < -1e-12 && d3 * d4 < -1e-12) return true;
    }
  const strictlyInside = (p: Vec2, poly: Vec2[]) => pointInPolygon(p, poly) && !pointOnBoundary(p, poly, 1e-6);
  if (strictlyInside(interiorPoint(a), b) || strictlyInside(interiorPoint(b), a)) return true;
  // any vertex strictly inside the other
  if (a.some((p) => strictlyInside(p, b)) || b.some((p) => strictlyInside(p, a))) return true;
  // edge midpoints strictly inside (catches identical / nested polygons sharing vertices)
  const mids = (poly: Vec2[]) => poly.map((p, i) => ({ x: (p.x + poly[(i + 1) % poly.length].x) / 2, y: (p.y + poly[(i + 1) % poly.length].y) / 2 }));
  if (mids(a).some((p) => strictlyInside(p, b)) || mids(b).some((p) => strictlyInside(p, a))) return true;
  return false;
}
