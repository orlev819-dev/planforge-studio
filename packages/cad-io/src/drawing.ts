/**
 * Renderer-independent 2D drawing list. The editor canvas, SVG, DXF and PDF exporters all render
 * these primitives, so every output shows identical geometry.
 */
import { planSymbol } from './symbols';
import type { Shape } from '../../shared-types/src/catalog';
import type { Floor, LengthUnit, MeasureMode, ModelAsset, Vec2, Wall } from '../../shared-types/src/index';
import {
  add, dist, furnitureCorners, formatArea, formatLength, norm, openingGeometry, perp, pointInPolygon, pt, roomMetrics, roomEdgeWalls, roomPoints,
  scale, sub, wallEnds, edgeKey,
} from '../../geometry/src/index';

export type Layer = 'rooms' | 'walls' | 'doors' | 'windows' | 'furniture' | 'ceilings' | 'dimensions' | 'text' | 'annotations';

export type Prim =
  | { t: 'poly'; layer: Layer; pts: Vec2[]; closed: boolean; fill?: string; stroke?: string; width?: number; dash?: boolean; id?: string }
  | { t: 'arc'; layer: Layer; c: Vec2; r: number; a0: number; a1: number; stroke: string; width?: number; id?: string }
  | { t: 'text'; layer: Layer; p: Vec2; text: string; size: number; angle?: number; color: string; bold?: boolean; id?: string }
  | { t: 'dim'; layer: Layer; a: Vec2; b: Vec2; off: Vec2; text: string; size: number; color: string; id?: string };

export interface DrawingOptions {
  unit: LengthUnit; precision: number;
  furniture?: boolean; dimensions?: boolean; annotations?: boolean; labels?: boolean; ceilings?: boolean;
  /** 'interior' dimensions the inside faces of the walls and labels rooms with their net area */
  measure?: MeasureMode;
  /** project model assets, so imported objects are drawn with their real footprint */
  assets?: Record<string, ModelAsset>;
  colors?: Partial<typeof DEFAULT_COLORS>;
}

export const DEFAULT_COLORS = {
  wall: '#2b2d31', roomFill: '#f4efe6', roomStroke: '#b9b0a2', door: '#3a6ea5', window: '#2a9d8f', furniture: '#6c757d',
  furnitureFill: '#ffffff', dim: '#c0392b', text: '#1f2328', annotation: '#7048e8', ceiling: '#9c36b5', railing: '#1864ab',
};

export function arcPoints(c: Vec2, r: number, a0: number, a1: number, segs = 24): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i <= segs; i++) { const a = a0 + ((a1 - a0) * i) / segs; out.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r }); }
  return out;
}

function wallDegree(f: Floor) {
  const deg = new Map<string, number>();
  for (const w of Object.values(f.walls)) { deg.set(w.a, (deg.get(w.a) ?? 0) + 1); deg.set(w.b, (deg.get(w.b) ?? 0) + 1); }
  return deg;
}

/** Wall body as filled quads, with gaps at openings. */
export function wallQuads(f: Floor, w: Wall, deg = wallDegree(f)): Vec2[][] {
  const { a, b } = wallEnds(f, w);
  const L = dist(a, b);
  const d = norm(sub(b, a)), n = perp(d), h = w.thickness / 2;
  const s0 = (deg.get(w.a) ?? 0) > 1 ? -h : 0;
  const s1 = (deg.get(w.b) ?? 0) > 1 ? L + h : L;
  const gaps = Object.values(f.openings).filter((o) => o.wallId === w.id).map((o) => [o.t - o.width / 2, o.t + o.width / 2]).sort((x, y) => x[0] - y[0]);
  const spans: [number, number][] = [];
  let cur = s0;
  for (const [g0, g1] of gaps) { if (g0 > cur + 1e-6) spans.push([cur, g0]); cur = Math.max(cur, g1); }
  if (s1 > cur + 1e-6) spans.push([cur, s1]);
  return spans.map(([u0, u1]) => {
    const p0 = add(a, scale(d, u0)), p1 = add(a, scale(d, u1));
    return [add(p0, scale(n, h)), add(p1, scale(n, h)), add(p1, scale(n, -h)), add(p0, scale(n, -h))];
  });
}

/** Railing in plan: the two rail lines plus balusters / glass hatch / parapet fill. */
export function railingPrims(f: Floor, w: Wall, color: string): Prim[] {
  const { a, b } = wallEnds(f, w);
  const L = dist(a, b);
  if (L < 1e-6) return [];
  const d = norm(sub(b, a)), n = perp(d), h = Math.max(w.thickness, 0.04) / 2;
  const out: Prim[] = [];
  const side = (k: number) => [add(a, scale(n, k * h)), add(b, scale(n, k * h))];
  if (w.railingStyle === 'panel') {
    out.push({ t: 'poly', layer: 'walls', pts: [...side(1), ...side(-1).reverse()], closed: true, fill: '#ffffff', stroke: color, width: 0.02, id: w.id });
  } else {
    out.push({ t: 'poly', layer: 'walls', pts: side(1), closed: false, stroke: color, width: 0.02, id: w.id });
    out.push({ t: 'poly', layer: 'walls', pts: side(-1), closed: false, stroke: color, width: 0.02, id: w.id });
  }
  if (w.railingStyle === 'bars') {
    const step = 0.12, n0 = Math.max(1, Math.round(L / step));
    for (let i = 0; i <= n0; i++) {
      const p = add(a, scale(d, (L * i) / n0));
      out.push({ t: 'poly', layer: 'walls', pts: [add(p, scale(n, h)), add(p, scale(n, -h))], closed: false, stroke: color, width: 0.008, id: w.id });
    }
  } else if (w.railingStyle === 'glass') {
    const step = 0.25, n0 = Math.max(1, Math.round(L / step));
    for (let i = 0; i <= n0; i++) {
      const p = add(a, scale(d, (L * i) / n0));
      out.push({ t: 'poly', layer: 'walls', pts: [add(p, scale(n, h)), add(add(p, scale(d, 0.1)), scale(n, -h))], closed: false, stroke: color, width: 0.005, id: w.id });
    }
  }
  // end posts
  for (const p of [a, b]) out.push({ t: 'poly', layer: 'walls', pts: [add(p, scale(n, h * 1.6)), add(p, scale(n, -h * 1.6))], closed: false, stroke: color, width: 0.03, id: w.id });
  return out;
}

export function buildDrawing(f: Floor, opts: DrawingOptions): Prim[] {
  const C = { ...DEFAULT_COLORS, ...(opts.colors ?? {}) };
  const interior = opts.measure === 'interior';
  const out: Prim[] = [];
  const fmtL = (m: number) => formatLength(m, opts.unit, opts.precision);
  const deg = wallDegree(f);

  for (const r of Object.values(f.rooms))
    out.push({ t: 'poly', layer: 'rooms', pts: roomPoints(f, r), closed: true, fill: C.roomFill, stroke: C.roomStroke, width: 0.01, id: r.id });

  if (f.reference && f.reference.visible) { /* reference image is drawn by raster-capable renderers only */ }

  for (const w of Object.values(f.walls)) {
    if (w.kind === 'railing') { out.push(...railingPrims(f, w, C.railing)); continue; }
    // an open passage: no wall body, just a dashed line showing where the rooms meet
    if (w.kind === 'open') {
      const { a, b } = wallEnds(f, w);
      out.push({ t: 'poly', layer: 'walls', pts: [a, b], closed: false, stroke: C.wall, width: 0.004, dash: true, id: w.id });
      continue;
    }
    for (const q of wallQuads(f, w, deg)) out.push({ t: 'poly', layer: 'walls', pts: q, closed: true, fill: C.wall, stroke: C.wall, width: 0.005, id: w.id });
  }

  for (const o of Object.values(f.openings)) {
    const g = openingGeometry(f, o);
    const th = g.wall.thickness / 2;
    const jamb = (p: Vec2) => [add(p, scale(g.normal, th)), add(p, scale(g.normal, -th))];
    if (o.kind === 'window') {
      const [s1, s2] = jamb(g.start), [e1, e2] = jamb(g.end);
      out.push({ t: 'poly', layer: 'windows', pts: [s1, e1, e2, s2], closed: true, fill: '#ffffff', stroke: C.window, width: 0.02, id: o.id });
      out.push({ t: 'poly', layer: 'windows', pts: [g.start, g.end], closed: false, stroke: C.window, width: 0.02, id: o.id });
      if (o.subtype === 'sliding' || o.subtype === 'double') {
        const off = scale(g.normal, th * 0.4);
        out.push({ t: 'poly', layer: 'windows', pts: [add(g.start, off), add(g.center, add(off, scale(g.dir, 0.05)))], closed: false, stroke: C.window, width: 0.015 });
        out.push({ t: 'poly', layer: 'windows', pts: [sub(g.center, add(off, scale(g.dir, 0.05))), sub(g.end, off)], closed: false, stroke: C.window, width: 0.015 });
      }
      continue;
    }
    // jambs for doors / openings
    out.push({ t: 'poly', layer: 'doors', pts: jamb(g.start), closed: false, stroke: C.door, width: 0.02, id: o.id });
    out.push({ t: 'poly', layer: 'doors', pts: jamb(g.end), closed: false, stroke: C.door, width: 0.02, id: o.id });
    if (o.kind === 'opening') continue;
    const sn = scale(g.normal, o.side);
    const swingLeaf = (hinge: Vec2, other: Vec2, w: number) => {
      const tip = add(hinge, scale(sn, w));
      out.push({ t: 'poly', layer: 'doors', pts: [hinge, tip], closed: false, stroke: C.door, width: 0.03, id: o.id });
      const a0 = Math.atan2(other.y - hinge.y, other.x - hinge.x), a1 = Math.atan2(tip.y - hinge.y, tip.x - hinge.x);
      let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      out.push({ t: 'arc', layer: 'doors', c: hinge, r: w, a0, a1: a0 + da, stroke: C.door, width: 0.01, id: o.id });
    };
    const st = o.subtype;
    if (st === 'double') { swingLeaf(g.start, g.center, o.width / 2); swingLeaf(g.end, g.center, o.width / 2); }
    else if (st === 'sliding' || st === 'pocket' || st === 'double-sliding') {
      const off = scale(g.normal, th + 0.03);
      const k = st === 'pocket' ? 1 : 0.55;
      out.push({ t: 'poly', layer: 'doors', pts: [add(g.start, off), add(add(g.start, scale(g.dir, o.width * k)), off)], closed: false, stroke: C.door, width: 0.03, id: o.id });
      if (st === 'double-sliding') out.push({ t: 'poly', layer: 'doors', pts: [sub(g.end, off), sub(add(g.end, scale(g.dir, -o.width * k)), off)], closed: false, stroke: C.door, width: 0.03, id: o.id });
    } else if (st === 'folding') {
      const m1 = add(g.start, add(scale(g.dir, o.width / 4), scale(sn, o.width / 4)));
      const m2 = add(g.end, add(scale(g.dir, -o.width / 4), scale(sn, o.width / 4)));
      out.push({ t: 'poly', layer: 'doors', pts: [g.start, m1, g.center, m2, g.end], closed: false, stroke: C.door, width: 0.02, id: o.id });
    } else {
      const hinge = o.hinge === 'start' ? g.start : g.end, other = o.hinge === 'start' ? g.end : g.start;
      swingLeaf(hinge, other, o.width);
    }
  }

  if (opts.furniture !== false)
    for (const fu of Object.values(f.furniture)) {
      const c = furnitureCorners(fu);
      const asset = fu.meta.modelId ? opts.assets?.[fu.meta.modelId] : undefined;
      if (asset && asset.hull.length >= 3) {
        const r = (fu.rotation * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r), m = fu.mirrored ? -1 : 1;
        const sx = fu.width / asset.size.x, sz = fu.depth / asset.size.z;
        const hull = asset.hull.map((h) => { const x = h.x * sx * m, y = h.y * sz; return { x: fu.x + x * cs - y * sn, y: fu.y + x * sn + y * cs }; });
        out.push({ t: 'poly', layer: 'furniture', pts: hull, closed: true, fill: C.furnitureFill, stroke: C.furniture, width: 0.012, id: fu.id });
        out.push({ t: 'poly', layer: 'furniture', pts: c, closed: true, stroke: C.furniture, width: 0.004, dash: true, id: fu.id });
        continue;
      }
      out.push({ t: 'poly', layer: 'furniture', pts: c, closed: true, fill: C.furnitureFill, stroke: C.furniture, width: 0.012, id: fu.id });
      // the object's own plan symbol, in its local frame
      const r = (fu.rotation * Math.PI) / 180, ux = { x: Math.cos(r), y: Math.sin(r) }, uy = { x: -Math.sin(r), y: Math.cos(r) };
      const P = (p: Vec2) => ({ x: fu.x + ux.x * p.x * (fu.mirrored ? -1 : 1) + uy.x * p.y, y: fu.y + ux.y * p.x * (fu.mirrored ? -1 : 1) + uy.y * p.y });
      for (const sym of planSymbol((fu.meta.shape ?? 'box') as Shape, fu.width, fu.depth))
        out.push({ t: 'poly', layer: 'furniture', pts: sym.pts.map(P), closed: !!sym.closed, stroke: C.furniture, width: sym.thin ? 0.005 : 0.009, dash: sym.dash, id: fu.id });
    }

  if (opts.ceilings !== false)
    for (const c of Object.values(f.ceilingDrops ?? {})) {
      const k = furnitureCorners(c);
      out.push({ t: 'poly', layer: 'ceilings', pts: k, closed: true, stroke: C.ceiling, width: 0.015, dash: true, id: c.id });
      // light diagonal hatch, clipped to the rectangle in local coordinates
      const r = (c.rotation * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r);
      const L = (x: number, y: number) => ({ x: c.x + x * cs - y * sn, y: c.y + x * sn + y * cs });
      const hw = c.width / 2, hd = c.depth / 2, step = 0.3;
      for (let s = -hw - hd + step; s < hw + hd; s += step) {
        const x0 = Math.max(-hw, s - hd), x1 = Math.min(hw, s + hd);
        if (x1 - x0 > 1e-6) out.push({ t: 'poly', layer: 'ceilings', pts: [L(x0, x0 - s), L(x1, x1 - s)], closed: false, stroke: C.ceiling, width: 0.004 });
      }
      out.push({ t: 'text', layer: 'ceilings', p: { x: c.x, y: c.y }, text: `${c.name} ${formatLength(c.height, opts.unit, opts.precision)}`, size: 0.13, color: C.ceiling, id: c.id });
    }

  if (opts.labels !== false)
    for (const r of Object.values(f.rooms)) {
      const m = roomMetrics(f, r);
      out.push({ t: 'text', layer: 'text', p: { x: m.labelPoint.x, y: m.labelPoint.y - 0.13 }, text: r.name, size: 0.2, color: C.text, bold: true, id: r.id });
      out.push({ t: 'text', layer: 'text', p: { x: m.labelPoint.x, y: m.labelPoint.y + 0.15 }, text: formatArea(interior ? m.netArea : m.grossArea, opts.unit, opts.precision), size: 0.16, color: C.text, id: r.id });
    }

  if (opts.dimensions !== false && interior) {
    // inside-face dimensions, one chain per room, placed outside the room
    for (const r of Object.values(f.rooms)) {
      const m = roomMetrics(f, r);
      const inset = m.insetPoints;
      if (!inset) continue;
      const poly = roomPoints(f, r);
      const walls = roomEdgeWalls(f, r);
      for (let i = 0; i < inset.length; i++) {
        const a = inset[i], b = inset[(i + 1) % inset.length];
        const L = dist(a, b);
        if (L < 0.05) continue;
        const n = perp(norm(sub(b, a)));
        const mid = scale(add(a, b), 0.5);
        const side = pointInPolygon(add(mid, scale(n, 0.02)), poly) ? -1 : 1;
        const off = scale(n, side * ((walls[i]?.thickness ?? 0.1) / 2 + 0.45));
        out.push({ t: 'dim', layer: 'dimensions', a, b, off, text: fmtL(L), size: 0.13, color: C.dim, id: walls[i]?.id ?? r.id });
      }
    }
    for (const w of Object.values(f.walls)) {
      if (!w.standalone) continue;
      const { a, b } = wallEnds(f, w);
      const n = perp(norm(sub(b, a)));
      out.push({ t: 'dim', layer: 'dimensions', a, b, off: scale(n, w.thickness / 2 + 0.25), text: fmtL(dist(a, b)), size: 0.13, color: C.dim, id: w.id });
    }
    for (const d of Object.values(f.dimensions)) {
      const n = perp(norm(sub(d.b, d.a)));
      out.push({ t: 'dim', layer: 'dimensions', a: d.a, b: d.b, off: scale(n, d.offset), text: fmtL(dist(d.a, d.b)), size: 0.13, color: C.dim, id: d.id });
    }
  } else if (opts.dimensions !== false) {
    const roomsByEdge = new Map<string, Vec2[]>();
    for (const r of Object.values(f.rooms)) { const pts = roomPoints(f, r); r.vertexIds.forEach((v, i) => roomsByEdge.set(edgeKey(v, r.vertexIds[(i + 1) % r.vertexIds.length]), pts)); }
    for (const w of Object.values(f.walls)) {
      const { a, b } = wallEnds(f, w);
      const L = dist(a, b);
      const n = perp(norm(sub(b, a)));
      const poly = roomsByEdge.get(edgeKey(w.a, w.b));
      const mid = scale(add(a, b), 0.5);
      let side = 1;
      if (poly && w.exterior) side = pointInPolygon(add(mid, scale(n, 0.02)), poly) ? -1 : 1;
      const off = scale(n, side * (w.thickness / 2 + (w.exterior ? 0.45 : 0.25)));
      out.push({ t: 'dim', layer: 'dimensions', a, b, off, text: fmtL(L), size: 0.13, color: C.dim, id: w.id });
    }
    for (const d of Object.values(f.dimensions)) {
      const n = perp(norm(sub(d.b, d.a)));
      out.push({ t: 'dim', layer: 'dimensions', a: d.a, b: d.b, off: scale(n, d.offset), text: fmtL(dist(d.a, d.b)), size: 0.13, color: C.dim, id: d.id });
    }
  }

  if (opts.annotations !== false)
    for (const a of Object.values(f.annotations)) out.push({ t: 'text', layer: 'annotations', p: { x: a.x, y: a.y }, text: a.text, size: 0.15, color: C.annotation, id: a.id });

  return out;
}

/** Geometry of a dimension primitive: extension lines, dimension line, tick marks, text anchor/angle. */
export function dimGeometry(p: Extract<Prim, { t: 'dim' }>) {
  const a2 = add(p.a, p.off), b2 = add(p.b, p.off);
  const ol = Math.hypot(p.off.x, p.off.y) || 1;
  const on = scale(p.off, 1 / ol);
  const ext = 0.08;
  const d = norm(sub(p.b, p.a));
  const tick = (q: Vec2) => [add(q, scale(add(d, on), -0.06)), add(q, scale(add(d, on), 0.06))];
  let ang = (Math.atan2(d.y, d.x) * 180) / Math.PI;
  if (ang > 90) ang -= 180; if (ang <= -90) ang += 180;
  return {
    ext1: [add(p.a, scale(on, Math.min(0.1, ol * 0.3))), add(a2, scale(on, ext))],
    ext2: [add(p.b, scale(on, Math.min(0.1, ol * 0.3))), add(b2, scale(on, ext))],
    line: [a2, b2], ticks: [tick(a2), tick(b2)],
    textAt: add(scale(add(a2, b2), 0.5), scale(on, p.size * 0.75)), angle: ang,
  };
}

export function drawingBounds(prims: Prim[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const addP = (q: Vec2) => { minX = Math.min(minX, q.x); minY = Math.min(minY, q.y); maxX = Math.max(maxX, q.x); maxY = Math.max(maxY, q.y); };
  for (const p of prims) {
    if (p.t === 'poly') p.pts.forEach(addP);
    else if (p.t === 'arc') { addP({ x: p.c.x - p.r, y: p.c.y - p.r }); addP({ x: p.c.x + p.r, y: p.c.y + p.r }); }
    else if (p.t === 'text') addP(p.p);
    else { const g = dimGeometry(p); g.ext1.forEach(addP); g.ext2.forEach(addP); addP(g.textAt); }
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}

export { pt };
