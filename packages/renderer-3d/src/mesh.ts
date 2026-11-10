/**
 * Renderer-independent 3D mesh generation from the floor plan model.
 * World frame: Y-up, plan (x, y) at height h -> (x, floorElevation + h, y). Units: meters.
 * Each part carries a `key` derived from its inputs so renderers can skip re-uploading unchanged parts.
 */
import type { Floor, Furniture, ModelAsset, Project, Vec2 } from '../../shared-types/src/index';
import { decodeFloats } from '../../cad-io/src/model-import';
import { ceilingAbove, furnitureCorners, add, dist, norm, openingGeometry, perp, roomPoints, scale, sub, triangulate, wallEnds, wallHeight, centroid } from '../../geometry/src/index';

export type PartKind = 'wall' | 'floor' | 'ceiling' | 'soffit' | 'furniture' | 'glass' | 'door';
export interface MeshPart {
  key: string;
  id: string;
  kind: PartKind;
  floorId: string;
  color: [number, number, number, number];
  positions: number[];
  normals: number[];
  indices: number[];
  /** light both faces (imported meshes may have inconsistent winding) */
  twoSided?: boolean;
}

export interface MeshOptions { ceilings?: boolean; furniture?: boolean; floors?: string[]; assets?: Record<string, ModelAsset> }

const MATERIAL_COLORS: Record<string, string> = {
  wood: '#c8a27a', tile: '#d9d9d6', concrete: '#a8a8a8', carpet: '#9a8c98', marble: '#ece8e1', 'paint-white': '#f1efe9', plaster: '#ebe7df', brick: '#b5654a', stone: '#9c9a92',
};
export const materialColor = (m: string) => MATERIAL_COLORS[m] ?? (m.startsWith('#') ? m : '#e6e2da');

export function hexToRgba(h: string, a = 1): [number, number, number, number] {
  const m = h.replace('#', '');
  const v = m.length === 3 ? m.split('').map((c) => c + c).join('') : m.slice(0, 6);
  return [parseInt(v.slice(0, 2), 16) / 255, parseInt(v.slice(2, 4), 16) / 255, parseInt(v.slice(4, 6), 16) / 255, a];
}

class Builder {
  positions: number[] = []; normals: number[] = []; indices: number[] = [];
  private vtx(x: number, y: number, z: number, n: [number, number, number]) { this.positions.push(x, y, z); this.normals.push(...n); return this.positions.length / 3 - 1; }
  /** extrude a convex/simple plan polygon from y0 to y1 */
  prism(poly: Vec2[], y0: number, y1: number, caps = true) {
    if (y1 - y0 < 1e-6 || poly.length < 3) return;
    const c = centroid(poly);
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const d = norm(sub(q, p));
      let o = { x: d.y, y: -d.x };
      const mid = scale(add(p, q), 0.5);
      if ((mid.x - c.x) * o.x + (mid.y - c.y) * o.y < 0) o = { x: -o.x, y: -o.y };
      const n: [number, number, number] = [o.x, 0, o.y];
      const a = this.vtx(p.x, y0, p.y, n), b = this.vtx(q.x, y0, q.y, n), cc = this.vtx(q.x, y1, q.y, n), dd = this.vtx(p.x, y1, p.y, n);
      this.indices.push(a, b, cc, a, cc, dd);
    }
    if (caps) { this.cap(poly, y1, [0, 1, 0]); this.cap(poly, y0, [0, -1, 0]); }
  }
  cap(poly: Vec2[], y: number, n: [number, number, number]) {
    const base = this.positions.length / 3;
    for (const p of poly) this.vtx(p.x, y, p.y, n);
    for (const [i, j, k] of triangulate(poly)) this.indices.push(base + i, base + j, base + k);
  }
}

const quad = (a: Vec2, d: Vec2, n: Vec2, u0: number, u1: number, h: number): Vec2[] => {
  const p0 = add(a, scale(d, u0)), p1 = add(a, scale(d, u1));
  return [add(p0, scale(n, h)), add(p1, scale(n, h)), add(p1, scale(n, -h)), add(p0, scale(n, -h))];
};

function wallParts(f: Floor, deg: Map<string, number>): MeshPart[] {
  const out: MeshPart[] = [];
  for (const w of Object.values(f.walls)) {
    const { a, b } = wallEnds(f, w);
    const L = dist(a, b), d = norm(sub(b, a)), n = perp(d), h = w.thickness / 2, H = wallHeight(f, w), e = f.elevation;
    const ops = Object.values(f.openings).filter((o) => o.wallId === w.id).sort((x, y) => x.t - y.t);
    const s0 = (deg.get(w.a) ?? 0) > 1 ? -h : 0, s1 = (deg.get(w.b) ?? 0) > 1 ? L + h : L;
    const key = JSON.stringify(['w', a, b, w.thickness, H, e, s0, s1, w.material, ops.map((o) => [o.t, o.width, o.height, o.sill, o.kind, o.subtype, o.hinge, o.side])]);
    const B = new Builder();
    let cur = s0;
    for (const o of ops) {
      const u0 = o.t - o.width / 2, u1 = o.t + o.width / 2;
      if (u0 > cur + 1e-6) B.prism(quad(a, d, n, cur, u0, h), e, e + H);
      if (o.sill > 1e-6) B.prism(quad(a, d, n, u0, u1, h), e, e + Math.min(o.sill, H));
      if (o.sill + o.height < H - 1e-6) B.prism(quad(a, d, n, u0, u1, h), e + o.sill + o.height, e + H);
      cur = Math.max(cur, u1);
    }
    if (s1 > cur + 1e-6) B.prism(quad(a, d, n, cur, s1, h), e, e + H);
    out.push({ key, id: w.id, kind: 'wall', floorId: f.id, color: hexToRgba(materialColor(w.material)), positions: B.positions, normals: B.normals, indices: B.indices });

    for (const o of ops) {
      const g = openingGeometry(f, o);
      const okey = JSON.stringify(['o', key, o.id]);
      if (o.kind === 'window') {
        const G = new Builder();
        G.prism(quad(a, d, n, o.t - o.width / 2, o.t + o.width / 2, 0.01), e + o.sill, e + Math.min(H, o.sill + o.height));
        out.push({ key: okey, id: o.id, kind: 'glass', floorId: f.id, color: [0.62, 0.8, 0.92, 0.35], positions: G.positions, normals: G.normals, indices: G.indices });
      } else if (o.kind === 'door' && (o.subtype === 'single' || o.subtype === 'double' || o.subtype === 'custom')) {
        const D = new Builder();
        const sn = scale(g.normal, o.side);
        const leaf = (hinge: Vec2, w: number) => {
          const tip = add(hinge, scale(sn, w));
          const dd = norm(sub(tip, hinge)), nn = perp(dd);
          D.prism(quad(hinge, dd, nn, 0, w, 0.02), e, e + Math.min(H, o.height));
        };
        if (o.subtype === 'double') { leaf(g.start, o.width / 2); leaf(g.end, o.width / 2); }
        else leaf(o.hinge === 'start' ? g.start : g.end, o.width);
        out.push({ key: okey, id: o.id, kind: 'door', floorId: f.id, color: hexToRgba('#8b6b4a'), positions: D.positions, normals: D.normals, indices: D.indices });
      }
    }
  }
  return out;
}

/** local-space boxes [x0,y0,x1,y1, z0,z1, color?] describing a furniture shape */
function furnitureBoxes(fu: Furniture): { r: [number, number, number, number]; z: [number, number]; color?: string; alpha?: number; round?: boolean }[] {
  const hw = fu.width / 2, hd = fu.depth / 2, H = fu.height;
  const leg = 0.05;
  switch (fu.meta.shape) {
    case 'table': return [
      { r: [-hw, -hd, hw, hd], z: [H - 0.04, H] },
      ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => ({ r: [sx * (hw - 0.04) - leg / 2, sy * (hd - 0.04) - leg / 2, sx * (hw - 0.04) + leg / 2, sy * (hd - 0.04) + leg / 2] as [number, number, number, number], z: [0, H - 0.04] as [number, number] })),
    ];
    case 'sofa': return [
      { r: [-hw, -hd, hw, hd], z: [0, Math.min(0.42, H)] },
      { r: [-hw, -hd, hw, -hd + 0.2], z: [0, H] },
      { r: [-hw, -hd, -hw + 0.15, hd], z: [0, Math.min(0.62, H)] },
      { r: [hw - 0.15, -hd, hw, hd], z: [0, Math.min(0.62, H)] },
    ];
    case 'bed': return [
      { r: [-hw, -hd, hw, hd], z: [0, H] },
      { r: [-hw, -hd, hw, -hd + 0.06], z: [0, Math.max(H, 0.95)], color: '#8d6e52' },
      { r: [-hw + 0.1, -hd + 0.1, hw - 0.1, -hd + 0.45], z: [H, H + 0.12], color: '#ffffff' },
    ];
    case 'chair': return [
      { r: [-hw, -hd, hw, hd], z: [0.42, 0.47] },
      { r: [-hw, hd - 0.05, hw, hd], z: [0.47, H] },
      ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => ({ r: [sx * hw - (sx > 0 ? 0.04 : 0), sy * hd - (sy > 0 ? 0.04 : 0), sx * hw + (sx < 0 ? 0.04 : 0), sy * hd + (sy < 0 ? 0.04 : 0)] as [number, number, number, number], z: [0, 0.42] as [number, number] })),
    ];
    case 'toilet': return [{ r: [-hw * 0.8, -hd + 0.18, hw * 0.8, hd], z: [0, 0.42], round: true }, { r: [-hw, -hd, hw, -hd + 0.18], z: [0, H] }];
    case 'shower': return [{ r: [-hw, -hd, hw, hd], z: [0, 0.05] }, { r: [-hw, -hd, hw, hd], z: [0.05, H], color: '#cfe8ff', alpha: 0.25 }];
    case 'cylinder': return [{ r: [-hw, -hd, hw, hd], z: [0, H], round: true }];
    case 'stairs': {
      const steps = Math.max(2, Math.round(H / 0.175));
      return Array.from({ length: steps }, (_, i) => ({ r: [-hw, -hd + (fu.depth / steps) * i, hw, hd] as [number, number, number, number], z: [(H / steps) * i, (H / steps) * (i + 1)] as [number, number] }));
    }
    default: return [{ r: [-hw, -hd, hw, hd], z: [0, H] }];
  }
}

const decoded = new Map<string, Float32Array>();
function modelPart(f: Floor, fu: Furniture, a: ModelAsset): MeshPart {
  let tris = decoded.get(a.id);
  if (!tris) { tris = decodeFloats(a.data); decoded.set(a.id, tris); }
  const r = (fu.rotation * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r), m = fu.mirrored ? -1 : 1;
  const sx = fu.width / a.size.x, sy = fu.height / a.size.y, sz = fu.depth / a.size.z, e = f.elevation + fu.elevation;
  const positions = new Array<number>(tris.length), normals = new Array<number>(tris.length), indices = new Array<number>(tris.length / 3);
  for (let i = 0; i < tris.length; i += 3) {
    const x = tris[i] * sx * m, y = tris[i + 1] * sy, z = tris[i + 2] * sz;
    positions[i] = fu.x + c * x - s * z; positions[i + 1] = e + y; positions[i + 2] = fu.y + s * x + c * z;
    indices[i / 3] = i / 3;
  }
  for (let i = 0; i < positions.length; i += 9) {
    const ux = positions[i + 3] - positions[i], uy = positions[i + 4] - positions[i + 1], uz = positions[i + 5] - positions[i + 2];
    const vx = positions[i + 6] - positions[i], vy = positions[i + 7] - positions[i + 1], vz = positions[i + 8] - positions[i + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (let k = 0; k < 3; k++) { normals[i + k * 3] = nx; normals[i + k * 3 + 1] = ny; normals[i + k * 3 + 2] = nz; }
  }
  return { key: JSON.stringify(['m', fu, f.elevation, a.id]), id: fu.id, kind: 'furniture', floorId: f.id, color: hexToRgba(fu.color), positions, normals, indices, twoSided: true };
}

function furnitureParts(f: Floor, assets: Record<string, ModelAsset> = {}): MeshPart[] {
  const out: MeshPart[] = [];
  for (const fu of Object.values(f.furniture)) {
    const asset = fu.meta.modelId ? assets[fu.meta.modelId] : undefined;
    if (asset) { out.push(modelPart(f, fu, asset)); continue; }
    const key = JSON.stringify(['f', fu, f.elevation]);
    const rad = (fu.rotation * Math.PI) / 180, c = Math.cos(rad), s = Math.sin(rad), m = fu.mirrored ? -1 : 1;
    const T = (x: number, y: number): Vec2 => ({ x: fu.x + c * x * m - s * y, y: fu.y + s * x * m + c * y });
    const groups = new Map<string, { b: Builder; alpha: number }>();
    for (const bx of furnitureBoxes(fu)) {
      const col = bx.color ?? fu.color, alpha = bx.alpha ?? 1;
      const gk = `${col}|${alpha}`;
      if (!groups.has(gk)) groups.set(gk, { b: new Builder(), alpha });
      const [x0, y0, x1, y1] = bx.r;
      let poly: Vec2[];
      if (bx.round) {
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
        poly = Array.from({ length: 20 }, (_, i) => T(cx + Math.cos((i / 20) * Math.PI * 2) * rx, cy + Math.sin((i / 20) * Math.PI * 2) * ry));
      } else poly = [T(x0, y0), T(x1, y0), T(x1, y1), T(x0, y1)];
      if (fu.mirrored) poly.reverse();
      groups.get(gk)!.b.prism(poly, f.elevation + fu.elevation + bx.z[0], f.elevation + fu.elevation + bx.z[1]);
    }
    let i = 0;
    for (const [gk, { b, alpha }] of groups) out.push({ key: `${key}#${i}`, id: fu.id, kind: alpha < 1 ? 'glass' : 'furniture', floorId: f.id, color: hexToRgba(gk.split('|')[0], alpha), positions: b.positions, normals: b.normals, indices: b.indices }), i++;
  }
  return out;
}

export function buildFloorMesh(f: Floor, opts: MeshOptions = {}): MeshPart[] {
  const deg = new Map<string, number>();
  for (const w of Object.values(f.walls)) { deg.set(w.a, (deg.get(w.a) ?? 0) + 1); deg.set(w.b, (deg.get(w.b) ?? 0) + 1); }
  const parts: MeshPart[] = [];
  for (const r of Object.values(f.rooms)) {
    const pts = roomPoints(f, r);
    const key = JSON.stringify(['r', pts, r.floorMaterial, f.elevation]);
    const B = new Builder();
    B.cap(pts, f.elevation + 0.002, [0, 1, 0]);
    parts.push({ key, id: r.id, kind: 'floor', floorId: f.id, color: hexToRgba(materialColor(r.floorMaterial)), positions: B.positions, normals: B.normals, indices: B.indices });
    if (opts.ceilings) {
      const C = new Builder();
      C.cap(pts, f.elevation + r.height, [0, -1, 0]);
      parts.push({ key: JSON.stringify(['c', key, r.height, r.ceilingMaterial]), id: r.id, kind: 'ceiling', floorId: f.id, color: hexToRgba(materialColor(r.ceilingMaterial)), positions: C.positions, normals: C.normals, indices: C.indices });
    }
  }
  parts.push(...wallParts(f, deg));
  for (const c of Object.values(f.ceilingDrops ?? {})) {
    const top = ceilingAbove(f, c);
    const B = new Builder();
    B.prism(furnitureCorners(c), f.elevation + c.height, f.elevation + top);
    parts.push({ key: JSON.stringify(['s', c, top, f.elevation]), id: c.id, kind: 'soffit', floorId: f.id, color: [0.93, 0.92, 0.9, 0.85], positions: B.positions, normals: B.normals, indices: B.indices });
  }
  if (opts.furniture !== false) parts.push(...furnitureParts(f, opts.assets));
  return parts;
}

export function buildProjectMesh(p: Project, opts: MeshOptions = {}): MeshPart[] {
  return p.floors.filter((f) => !opts.floors || opts.floors.includes(f.id)).flatMap((f) => buildFloorMesh(f, { assets: p.assets, ...opts }));
}

export function meshBounds(parts: MeshPart[]) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) for (let i = 0; i < p.positions.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p.positions[i + k]); max[k] = Math.max(max[k], p.positions[i + k]); }
  if (!isFinite(min[0])) return { min: [-5, 0, -5], max: [5, 3, 5] };
  return { min, max };
}
