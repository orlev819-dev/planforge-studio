import type { Floor, ID, Opening, Project, Room, Vec2, Wall } from '../../shared-types/src/index';
import { GeometryError } from '../../shared-types/src/index';
import { add, dist, norm, perp, scale, sub } from './vec';

export const uid = (): ID => globalThis.crypto.randomUUID();

export const edgeKey = (a: ID, b: ID) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function createFloor(name: string, elevation = 0, defaultHeight = 2.6): Floor {
  return {
    id: uid(), name, elevation, defaultHeight, defaultWallThickness: 0.15,
    vertices: {}, walls: {}, rooms: {}, openings: {}, furniture: {}, dimensions: {}, annotations: {}, ceilingDrops: {}, reference: null,
  };
}

export function createProject(name: string, opts: Partial<Pick<Project, 'address' | 'description' | 'isDemo'>> = {}): Project {
  const now = Date.now();
  return {
    schemaVersion: 1, id: uid(), name, address: opts.address ?? '', description: opts.description ?? '',
    status: 'active', isDemo: opts.isDemo ?? false, createdAt: now, updatedAt: now, rev: 0,
    settings: { unit: 'm', precision: 2, showGrid: true, snap: true },
    floors: [], assets: {},
  };
}

export const pt = (f: Floor, id: ID): Vec2 => {
  const v = f.vertices[id];
  if (!v) throw new GeometryError('missing-vertex', `Vertex ${id} not found`);
  return { x: v.x, y: v.y };
};

export const roomPoints = (f: Floor, r: Room): Vec2[] => r.vertexIds.map((id) => pt(f, id));

export function wallEnds(f: Floor, w: Wall) { return { a: pt(f, w.a), b: pt(f, w.b) }; }
export function wallLength(f: Floor, w: Wall) { const { a, b } = wallEnds(f, w); return dist(a, b); }
export function wallDir(f: Floor, w: Wall) { const { a, b } = wallEnds(f, w); return norm(sub(b, a)); }

/** rooms that own the edge (a,b) */
export function roomsOfWall(f: Floor, w: Wall): Room[] {
  const k = edgeKey(w.a, w.b);
  return Object.values(f.rooms).filter((r) => r.vertexIds.some((id, i) => edgeKey(id, r.vertexIds[(i + 1) % r.vertexIds.length]) === k));
}

export function wallHeight(f: Floor, w: Wall): number {
  if (w.height != null) return w.height;
  const rs = roomsOfWall(f, w);
  return rs.length ? Math.max(...rs.map((r) => r.height)) : f.defaultHeight;
}

export function wallByKey(f: Floor): Map<string, Wall> {
  const m = new Map<string, Wall>();
  for (const w of Object.values(f.walls)) m.set(edgeKey(w.a, w.b), w);
  return m;
}

export function findWallForEdge(f: Floor, a: ID, b: ID): Wall | undefined {
  const k = edgeKey(a, b);
  return Object.values(f.walls).find((w) => edgeKey(w.a, w.b) === k);
}

/** world-space geometry of an opening */
export function openingGeometry(f: Floor, o: Opening) {
  const w = f.walls[o.wallId];
  if (!w) throw new GeometryError('missing-wall', 'Opening refers to a missing wall');
  const { a, b } = wallEnds(f, w);
  const d = norm(sub(b, a));
  const n = perp(d);
  const center = add(a, scale(d, o.t));
  const start = add(a, scale(d, o.t - o.width / 2));
  const end = add(a, scale(d, o.t + o.width / 2));
  return { wall: w, a, b, dir: d, normal: n, center, start, end, length: dist(a, b) };
}

export function furnitureCorners(o: { x: number; y: number; width: number; depth: number; rotation: number }): Vec2[] {
  const r = (o.rotation * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const hw = o.width / 2, hd = o.depth / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, y]) => ({ x: o.x + x * c - y * s, y: o.y + x * s + y * c }));
}
