import type { Floor, ID, Opening, Project, Room, Vec2 } from '../../shared-types/src/index';
import { edgeKey, furnitureCorners, openingGeometry, pt, roomPoints, wallHeight, wallLength } from './model';
import { insetPolygon, perimeter, polygonArea, interiorPoint } from './polygon';
import { dist, projectOnSegment } from './vec';

export interface RoomMetrics {
  roomId: ID;
  name: string;
  /** area enclosed by wall centerlines (m²) */
  grossArea: number;
  /** interior (finished-face) area: centerline polygon inset by half wall thickness (m²) */
  netArea: number;
  perimeter: number;
  netPerimeter: number;
  height: number;
  volume: number;
  ceilingArea: number;
  /** interior wall face area minus openings (m²) */
  wallArea: number;
  openingArea: number;
  doors: number;
  windows: number;
  edgeLengths: number[];
  labelPoint: Vec2;
}

export function roomEdgeWalls(f: Floor, r: Room) {
  const byKey = new Map(Object.values(f.walls).map((w) => [edgeKey(w.a, w.b), w] as const));
  return r.vertexIds.map((v, i) => byKey.get(edgeKey(v, r.vertexIds[(i + 1) % r.vertexIds.length])));
}

export function roomMetrics(f: Floor, r: Room): RoomMetrics {
  const pts = roomPoints(f, r);
  const walls = roomEdgeWalls(f, r);
  const half = walls.map((w) => (w ? w.thickness / 2 : 0));
  const inset = insetPolygon(pts, half);
  const grossArea = polygonArea(pts);
  const netArea = inset ? polygonArea(inset) : 0;
  const netPerimeter = inset ? perimeter(inset) : 0;
  const openings: Opening[] = [];
  for (const w of walls) if (w) for (const o of Object.values(f.openings)) if (o.wallId === w.id) openings.push(o);
  const openingArea = openings.reduce((s, o) => s + o.width * Math.max(0, Math.min(o.height, r.height - o.sill)), 0);
  return {
    roomId: r.id, name: r.name, grossArea, netArea, perimeter: perimeter(pts), netPerimeter, height: r.height,
    volume: netArea * r.height, ceilingArea: netArea, wallArea: Math.max(0, netPerimeter * r.height - openingArea), openingArea,
    doors: openings.filter((o) => o.kind === 'door').length, windows: openings.filter((o) => o.kind === 'window').length,
    edgeLengths: pts.map((p, i) => dist(p, pts[(i + 1) % pts.length])), labelPoint: interiorPoint(pts),
  };
}

export interface FloorMetrics { grossArea: number; netArea: number; volume: number; rooms: RoomMetrics[]; wallCount: number; openingCount: number; furnitureCount: number }

export function floorMetrics(f: Floor): FloorMetrics {
  const rooms = Object.values(f.rooms).map((r) => roomMetrics(f, r));
  return {
    grossArea: rooms.reduce((s, r) => s + r.grossArea, 0), netArea: rooms.reduce((s, r) => s + r.netArea, 0),
    volume: rooms.reduce((s, r) => s + r.volume, 0), rooms,
    wallCount: Object.keys(f.walls).length, openingCount: Object.keys(f.openings).length, furnitureCount: Object.keys(f.furniture).length,
  };
}

export function projectMetrics(p: Project) {
  const floors = p.floors.map((f) => ({ floor: f, ...floorMetrics(f) }));
  return { floors, grossArea: floors.reduce((s, f) => s + f.grossArea, 0), netArea: floors.reduce((s, f) => s + f.netArea, 0) };
}

export function wallMetrics(f: Floor, wallId: ID) {
  const w = f.walls[wallId];
  const L = wallLength(f, w);
  const a = pt(f, w.a), b = pt(f, w.b);
  const h = wallHeight(f, w);
  const ops = Object.values(f.openings).filter((o) => o.wallId === wallId);
  const opArea = ops.reduce((s, o) => s + o.width * Math.max(0, Math.min(o.height, h - o.sill)), 0);
  return { length: L, angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI, height: h, sideArea: Math.max(0, L * h - opArea), openingArea: opArea, volume: L * h * w.thickness };
}

/** Clear distance from an object's footprint to the nearest wall face (meters). */
export function objectToWallDistance(f: Floor, furnitureId: ID): { distance: number; wallId: ID | null } {
  const fu = f.furniture[furnitureId];
  const corners = furnitureCorners(fu);
  let best = { distance: Infinity, wallId: null as ID | null };
  for (const w of Object.values(f.walls)) {
    const a = pt(f, w.a), b = pt(f, w.b);
    for (const c of corners) {
      const d = projectOnSegment(c, a, b).distance - w.thickness / 2;
      if (d < best.distance) best = { distance: Math.max(0, d), wallId: w.id };
    }
  }
  return best;
}

export const openingArea = (o: Opening) => o.width * o.height;
export { openingGeometry };
