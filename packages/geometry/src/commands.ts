/**
 * Pure, validated edit operations on a Floor. Every command takes a floor and returns a NEW floor
 * (structural copy) or throws GeometryError — it never returns corrupted geometry.
 * Undo/redo is implemented in the app by keeping before/after snapshots of each command.
 */
import type { CeilingDrop, Floor, Furniture, ID, Opening, Photo, RailingStyle, Room, Vec2, Wall, WallKind } from '../../shared-types/src/index';
import { GeometryError } from '../../shared-types/src/index';
import { add, cleanPt, dist, dot, norm, perp, projectOnSegment, rotate, samePoint, scale, sub, MERGE_TOL, clean, segmentsProperlyIntersect } from './vec';
import { centroid, pointInPolygon, polygonsOverlap, signedArea, validatePolygon, bbox, interiorPoint } from './polygon';
import { DEFAULT_RAILING_HEIGHT, edgeKey, furnitureCorners, openingGeometry, pt, roomPoints, uid, wallEnds, wallHeight, wallLength } from './model';
import { roomEdgeWalls, roomMetrics, openingOffsets } from './measure';

const fail = (code: string, msg: string): never => { throw new GeometryError(code, msg); };
const copy = <T>(x: T): T => structuredClone(x);

// ---------------------------------------------------------------------------------------------
// Synchronisation: walls are derived from room edges (+ standalone partitions)
// ---------------------------------------------------------------------------------------------

interface EdgeInfo { a: ID; b: ID; rooms: ID[] }

function collectEdges(f: Floor): Map<string, EdgeInfo> {
  const m = new Map<string, EdgeInfo>();
  for (const r of Object.values(f.rooms)) {
    const ids = r.vertexIds;
    for (let i = 0; i < ids.length; i++) {
      const a = ids[i], b = ids[(i + 1) % ids.length];
      const k = edgeKey(a, b);
      const e = m.get(k);
      if (e) e.rooms.push(r.id); else m.set(k, { a, b, rooms: [r.id] });
    }
  }
  return m;
}

function defaultWall(f: Floor, a: ID, b: ID, exterior: boolean): Wall {
  return { id: uid(), a, b, thickness: f.defaultWallThickness, height: null, exterior, exteriorManual: false, material: 'plaster', standalone: false, kind: 'solid', railingStyle: 'bars', locked: false };
}

/**
 * Rebuild walls from room edges, reattach openings whose wall disappeared (e.g. after a split),
 * remove orphan vertices, then validate the whole floor.
 */
export function finalize(prev: Floor, next: Floor, beforeValidate?: (f: Floor) => void): Floor {
  const edges = collectEdges(next);
  const oldWalls = Object.values(next.walls);
  const byKey = new Map(oldWalls.map((w) => [edgeKey(w.a, w.b), w] as const));
  const walls: Record<ID, Wall> = {};
  for (const w of oldWalls) if (w.standalone && next.vertices[w.a] && next.vertices[w.b]) walls[w.id] = w;

  for (const [k, e] of edges) {
    const exterior = e.rooms.length === 1;
    const existing = byKey.get(k);
    if (existing && !existing.standalone) {
      walls[existing.id] = { ...existing, exterior: existing.exteriorManual ? existing.exterior : exterior };
      continue;
    }
    if (existing && existing.standalone) {
      // a partition now coincides with a room edge: promote it
      walls[existing.id] = { ...existing, standalone: false, exterior: existing.exteriorManual ? existing.exterior : exterior };
      continue;
    }
    // inherit from a removed collinear parent wall (wall split)
    const A = pt(next, e.a), B = pt(next, e.b);
    const parent = oldWalls.find((w) => {
      if (walls[w.id]) return false;
      const pa = prev.vertices[w.a] ?? next.vertices[w.a], pb = prev.vertices[w.b] ?? next.vertices[w.b];
      if (!pa || !pb) return false;
      return projectOnSegment(A, pa, pb).distance < MERGE_TOL && projectOnSegment(B, pa, pb).distance < MERGE_TOL;
    });
    const nw = defaultWall(next, e.a, e.b, exterior);
    if (parent) {
      nw.thickness = parent.thickness; nw.height = parent.height; nw.material = parent.material;
      nw.kind = parent.kind; nw.railingStyle = parent.railingStyle;
      if (parent.exteriorManual) { nw.exterior = parent.exterior; nw.exteriorManual = true; }
    }
    walls[nw.id] = nw;
  }

  // reattach openings whose wall vanished: use their world position in the PREVIOUS floor
  const openings: Record<ID, Opening> = {};
  for (const o of Object.values(next.openings)) {
    if (walls[o.wallId]) { openings[o.id] = o; continue; }
    let center: Vec2 | null = null;
    try { if (prev.walls[o.wallId]) center = openingGeometry(prev, o).center; } catch { center = null; }
    if (!center) continue;
    const host = Object.values(walls).find((w) => {
      const a = next.vertices[w.a], b = next.vertices[w.b];
      return a && b && projectOnSegment(center!, a, b).distance < 0.01;
    });
    if (!host) continue; // wall genuinely deleted together with its opening
    const a = pt(next, host.a);
    openings[o.id] = { ...o, wallId: host.id, t: clean(dist(a, center)) };
  }

  // drop orphan vertices
  const used = new Set<ID>();
  for (const r of Object.values(next.rooms)) r.vertexIds.forEach((id) => used.add(id));
  for (const w of Object.values(walls)) { used.add(w.a); used.add(w.b); }
  const vertices: Floor['vertices'] = {};
  for (const id of used) if (next.vertices[id]) vertices[id] = next.vertices[id];

  const out: Floor = { ...next, walls, openings, vertices };
  beforeValidate?.(out);
  checkLocked(prev, out);
  validateFloor(out);
  return out;
}

/** How much a locked wall may still change (rounding of the stored coordinates): 1 mm. */
const LOCK_TOL = 0.001;

/**
 * A wall measured on site is held at that length: no edit anywhere else in the plan may stretch it.
 * This is the single guard for every command — dragging a corner, moving a wall, setting a
 * neighbour's length — so a measurement can only be changed by releasing the wall first.
 */
function checkLocked(prev: Floor, next: Floor) {
  for (const w of Object.values(next.walls)) {
    if (!w.locked) continue;
    const before = prev.walls[w.id];
    if (!before || !before.locked) continue;
    if (!prev.vertices[before.a] || !prev.vertices[before.b] || !next.vertices[w.a] || !next.vertices[w.b]) continue;
    const was = wallLength(prev, before), now = wallLength(next, w);
    if (Math.abs(was - now) > LOCK_TOL)
      fail('locked', `A wall is locked at ${was.toFixed(2)} m (measured). This change would make it ${now.toFixed(2)} m — release the lock on it first.`);
  }
}

export function validateFloor(f: Floor): void {
  const rooms = Object.values(f.rooms);
  const polys = rooms.map((r) => ({ r, pts: roomPoints(f, r) }));
  for (const { r, pts } of polys) {
    const issue = validatePolygon(pts);
    if (issue) fail(issue.code, `${r.name}: ${issue.message}`);
    if (!(r.height > 0)) fail('height', `${r.name}: ceiling height must be positive.`);
  }
  const boxes = polys.map((p) => bbox(p.pts));
  for (let i = 0; i < polys.length; i++)
    for (let j = i + 1; j < polys.length; j++) {
      const A = boxes[i], B = boxes[j];
      if (A.maxX <= B.minX + 1e-9 || B.maxX <= A.minX + 1e-9 || A.maxY <= B.minY + 1e-9 || B.maxY <= A.minY + 1e-9) continue;
      if (polygonsOverlap(polys[i].pts, polys[j].pts)) fail('overlap', `${polys[i].r.name} would overlap ${polys[j].r.name}.`);
    }
  for (const w of Object.values(f.walls)) {
    if (!(w.thickness > 0 && w.thickness <= 2)) fail('thickness', 'Wall thickness must be between 0 and 2 m.');
    if (wallLength(f, w) < 0.01) fail('short-wall', 'A wall would become shorter than 1 cm.');
    if (w.kind === 'railing') {
      const h = wallHeight(f, w);
      if (!(h >= 0.2 && h <= 2)) fail('railing-height', 'Railing height must be between 0.20 m and 2.00 m.');
    }
  }
  const perWall = new Map<ID, Opening[]>();
  for (const o of Object.values(f.openings)) {
    const w = f.walls[o.wallId];
    if (!w) fail('orphan-opening', 'An opening lost its wall.');
    if (w.kind === 'railing') fail('railing-opening', 'A railing cannot hold a door or window. Remove it, or change the railing back to a wall.');
    if (w.kind === 'open') fail('open-opening', 'There is no wall there to hold a door or window — the passage is already open.');
    const L = wallLength(f, w);
    if (!(o.width > 0) || !(o.height > 0) || o.sill < 0) fail('opening-size', 'Opening size must be positive.');
    if (o.t - o.width / 2 < -1e-6 || o.t + o.width / 2 > L + 1e-6) fail('opening-fit', `A ${o.kind} (${(o.width * 100).toFixed(0)} cm) no longer fits on its wall (${L.toFixed(2)} m).`);
    const list = perWall.get(o.wallId) ?? [];
    for (const p of list)
      if (Math.abs(p.t - o.t) < (p.width + o.width) / 2 - 1e-6) fail('opening-overlap', 'Two openings overlap on the same wall.');
    list.push(o); perWall.set(o.wallId, list);
  }
}

// ---------------------------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------------------------

export interface RoomOptions { name?: string; height?: number }

function findVertexAt(f: Floor, p: Vec2): ID | undefined {
  for (const v of Object.values(f.vertices)) if (samePoint(v, p)) return v.id;
  return undefined;
}

/** Insert vertex `vid` into every room edge it lies strictly inside (T-junctions). */
function splitEdgesAt(f: Floor, vid: ID, skipRoom?: ID) {
  const p = pt(f, vid);
  for (const r of Object.values(f.rooms)) {
    if (r.id === skipRoom || r.vertexIds.includes(vid)) continue;
    const ids = r.vertexIds;
    for (let i = 0; i < ids.length; i++) {
      const a = pt(f, ids[i]), b = pt(f, ids[(i + 1) % ids.length]);
      const pr = projectOnSegment(p, a, b);
      if (pr.distance < MERGE_TOL && !samePoint(p, a) && !samePoint(p, b)) {
        ids.splice(i + 1, 0, vid);
        break;
      }
    }
  }
}

export function addRoom(prev: Floor, points: Vec2[], opts: RoomOptions = {}): { floor: Floor; roomId: ID } {
  const f = copy(prev);
  let pts = points.map(cleanPt);
  const issue = validatePolygon(pts);
  if (issue) fail(issue.code, issue.message);
  if (signedArea(pts) < 0) pts = pts.reverse();
  for (const r of Object.values(f.rooms))
    if (polygonsOverlap(pts, roomPoints(f, r))) fail('overlap', `The new room would overlap ${r.name}.`);

  const ids: ID[] = pts.map((p) => {
    const ex = findVertexAt(f, p);
    if (ex) return ex;
    const id = uid();
    f.vertices[id] = { id, x: p.x, y: p.y };
    return id;
  });
  // existing vertices that lie on the new room's edges become corners of the new room too
  const withT: ID[] = [];
  for (let i = 0; i < ids.length; i++) {
    withT.push(ids[i]);
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const onEdge = Object.values(f.vertices)
      .filter((v) => !ids.includes(v.id))
      .map((v) => ({ v, pr: projectOnSegment(v, a, b) }))
      .filter(({ v, pr }) => pr.distance < MERGE_TOL && !samePoint(v, a) && !samePoint(v, b))
      .sort((x, y) => x.pr.t - y.pr.t);
    for (const { v } of onEdge) withT.push(v.id);
  }
  const roomId = uid();
  const n = Object.keys(f.rooms).length + 1;
  const room: Room = { id: roomId, name: opts.name ?? `Room ${n}`, vertexIds: withT, height: opts.height ?? f.defaultHeight, floorMaterial: 'wood', wallMaterial: 'paint-white', ceilingMaterial: 'paint-white' };
  f.rooms[roomId] = room;
  for (const id of ids) splitEdgesAt(f, id, roomId);
  return { floor: finalize(prev, f), roomId };
}

export function addRectRoom(prev: Floor, o: { x: number; y: number; width: number; length: number } & RoomOptions) {
  if (!(o.width > 0 && o.length > 0)) fail('size', 'Width and length must be positive.');
  const { x, y, width: w, length: l } = o;
  return addRoom(prev, [{ x, y }, { x: x + w, y }, { x: x + w, y: y + l }, { x, y: y + l }], o);
}

export function updateRoom(prev: Floor, id: ID, patch: Partial<Pick<Room, 'name' | 'height' | 'floorMaterial' | 'wallMaterial' | 'ceilingMaterial'>>): Floor {
  if (!prev.rooms[id]) fail('missing', 'Room not found');
  const f = copy(prev);
  f.rooms[id] = { ...f.rooms[id], ...patch };
  return finalize(prev, f);
}

export function deleteRoom(prev: Floor, id: ID): Floor {
  const f = copy(prev);
  const r = f.rooms[id];
  if (!r) fail('missing', 'Room not found');
  // openings on walls owned only by this room go with it
  const keys = new Set(r.vertexIds.map((v, i) => edgeKey(v, r.vertexIds[(i + 1) % r.vertexIds.length])));
  delete f.rooms[id];
  const stillUsed = new Set<string>();
  for (const o of Object.values(f.rooms)) o.vertexIds.forEach((v, i) => stillUsed.add(edgeKey(v, o.vertexIds[(i + 1) % o.vertexIds.length])));
  for (const w of Object.values(f.walls)) {
    const k = edgeKey(w.a, w.b);
    if (keys.has(k) && !stillUsed.has(k)) for (const o of Object.values(f.openings)) if (o.wallId === w.id) delete f.openings[o.id];
  }
  // furniture inside the room is removed with it
  const pts = roomPoints(prev, r);
  for (const fu of Object.values(f.furniture)) if (pointInPolygon(fu, pts)) delete f.furniture[fu.id];
  return finalize(prev, f);
}

/** Detach shared corners so a room can move independently; returns new vertex ids per index. */
function detachRoom(f: Floor, r: Room) {
  const shared = new Set<ID>();
  for (const o of Object.values(f.rooms)) if (o.id !== r.id) o.vertexIds.forEach((v) => shared.add(v));
  for (const w of Object.values(f.walls)) if (w.standalone) { shared.add(w.a); shared.add(w.b); }
  r.vertexIds = r.vertexIds.map((vid) => {
    if (!shared.has(vid)) return vid;
    const nid = uid();
    f.vertices[nid] = { ...f.vertices[vid], id: nid };
    return nid;
  });
}

function transformRoom(prev: Floor, id: ID, fn: (p: Vec2) => Vec2, rotDeg = 0): Floor {
  const f = copy(prev);
  const r = f.rooms[id];
  if (!r) fail('missing', 'Room not found');
  const oldIds = [...r.vertexIds];
  const poly = roomPoints(prev, r);
  // openings on walls exclusively owned by this room move with it
  const carried: { o: Opening; edge: number; fromStart: number }[] = [];
  const otherEdges = new Set<string>();
  for (const o of Object.values(prev.rooms)) if (o.id !== id) o.vertexIds.forEach((v, i) => otherEdges.add(edgeKey(v, o.vertexIds[(i + 1) % o.vertexIds.length])));
  oldIds.forEach((v, i) => {
    const nb = oldIds[(i + 1) % oldIds.length];
    const k = edgeKey(v, nb);
    if (otherEdges.has(k)) return;
    const w = Object.values(prev.walls).find((x) => edgeKey(x.a, x.b) === k);
    if (!w) return;
    const L = wallLength(prev, w);
    for (const o of Object.values(prev.openings)) if (o.wallId === w.id) carried.push({ o, edge: i, fromStart: w.a === v ? o.t : L - o.t });
  });
  detachRoom(f, r);
  for (const vid of r.vertexIds) { const p = cleanPt(fn(f.vertices[vid])); f.vertices[vid] = { ...f.vertices[vid], ...p }; }
  for (const fu of Object.values(f.furniture)) if (pointInPolygon(fu, poly)) {
    const p = fn(fu);
    f.furniture[fu.id] = { ...fu, x: clean(p.x), y: clean(p.y), rotation: (fu.rotation + rotDeg) % 360 };
  }
  for (const c of carried) delete f.openings[c.o.id];
  return finalize(prev, f, (out) => {
    const ids = out.rooms[id].vertexIds;
    for (const c of carried) {
      const a = ids[c.edge], b = ids[(c.edge + 1) % ids.length];
      const w = Object.values(out.walls).find((x) => edgeKey(x.a, x.b) === edgeKey(a, b));
      if (!w) continue;
      const L = wallLength(out, w);
      out.openings[c.o.id] = { ...c.o, wallId: w.id, t: w.a === a ? c.fromStart : L - c.fromStart };
    }
  });
}

export const moveRoom = (prev: Floor, id: ID, dx: number, dy: number) => transformRoom(prev, id, (p) => ({ x: p.x + dx, y: p.y + dy }));

export function rotateRoom(prev: Floor, id: ID, deg: number): Floor {
  const r = prev.rooms[id];
  if (!r) fail('missing', 'Room not found');
  const c = centroid(roomPoints(prev, r));
  return transformRoom(prev, id, (p) => rotate(p, deg, c), deg);
}

export function splitRoom(prev: Floor, id: ID, va: ID, vb: ID): { floor: Floor; newRoomId: ID } {
  const f = copy(prev);
  const r = f.rooms[id];
  if (!r) fail('missing', 'Room not found');
  const ids = r.vertexIds;
  let i = ids.indexOf(va), j = ids.indexOf(vb);
  if (i < 0 || j < 0) fail('split', 'Both corners must belong to the room.');
  if (i > j) [i, j] = [j, i];
  if (j - i === 1 || (i === 0 && j === ids.length - 1)) fail('split', 'Choose two corners that are not neighbours.');
  const pts = roomPoints(f, r);
  const A = pts[i], B = pts[j];
  const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  if (!pointInPolygon(mid, pts)) fail('split', 'The split line must run inside the room.');
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k], q = pts[(k + 1) % pts.length];
    if (k === i || k === j || (k + 1) % pts.length === i || (k + 1) % pts.length === j) continue;
    if (segmentsProperlyIntersect(A, B, p, q)) fail('split', 'The split line crosses a wall.');
  }
  const first = ids.slice(i, j + 1);
  const second = [...ids.slice(j), ...ids.slice(0, i + 1)];
  r.vertexIds = first;
  const nid = uid();
  f.rooms[nid] = { ...r, id: nid, name: `${r.name} (2)`, vertexIds: second };
  return { floor: finalize(prev, f), newRoomId: nid };
}

export function mergeRooms(prev: Floor, r1: ID, r2: ID): Floor {
  const f = copy(prev);
  const A = f.rooms[r1], B = f.rooms[r2];
  if (!A || !B) fail('missing', 'Room not found');
  const directed = (r: Room) => r.vertexIds.map((v, i) => [v, r.vertexIds[(i + 1) % r.vertexIds.length]] as [ID, ID]);
  const ea = directed(A), eb = directed(B);
  const shared = new Set<string>();
  for (const [a, b] of ea) if (eb.some(([c, d]) => c === b && d === a)) shared.add(edgeKey(a, b));
  if (!shared.size) fail('merge', 'Rooms must share a wall to be merged.');
  for (const w of Object.values(f.walls))
    if (shared.has(edgeKey(w.a, w.b)) && Object.values(f.openings).some((o) => o.wallId === w.id))
      fail('merge', 'Remove the doors/windows on the shared wall before merging.');
  const remaining = [...ea, ...eb].filter(([a, b]) => !shared.has(edgeKey(a, b)));
  const next = new Map<ID, ID>();
  for (const [a, b] of remaining) { if (next.has(a)) fail('merge', 'Merged outline is not a simple polygon.'); next.set(a, b); }
  const start = remaining[0][0];
  const loop: ID[] = [start];
  let cur = next.get(start)!;
  while (cur !== start) { loop.push(cur); cur = next.get(cur)!; if (!cur || loop.length > remaining.length) fail('merge', 'Merged outline is not a single loop.'); }
  if (loop.length !== remaining.length) fail('merge', 'Rooms only touch at a point or enclose a hole.');
  A.vertexIds = loop;
  delete f.rooms[r2];
  return finalize(prev, f);
}

// ---------------------------------------------------------------------------------------------
// Vertices & walls
// ---------------------------------------------------------------------------------------------

export function moveVertex(prev: Floor, id: ID, p: Vec2): Floor {
  if (!prev.vertices[id]) fail('missing', 'Corner not found');
  const f = copy(prev);
  const q = cleanPt(p);
  f.vertices[id] = { ...f.vertices[id], ...q };
  return finalize(prev, f);
}

export function moveVertices(prev: Floor, deltas: Record<ID, Vec2>): Floor {
  const f = copy(prev);
  for (const [id, d] of Object.entries(deltas)) {
    const v = f.vertices[id];
    if (!v) fail('missing', 'Corner not found');
    f.vertices[id] = { ...v, ...cleanPt({ x: v.x + d.x, y: v.y + d.y }) };
  }
  return finalize(prev, f);
}

/** Move a wall parallel to itself by `offset` meters along its left normal. Shared walls move both rooms. */
export function moveWall(prev: Floor, wallId: ID, offset: number): Floor {
  const w = prev.walls[wallId];
  if (!w) fail('missing', 'Wall not found');
  const { a, b } = wallEnds(prev, w);
  const n = perp(norm(sub(b, a)));
  const d = scale(n, offset);
  return moveVertices(prev, { [w.a]: d, [w.b]: d });
}

/**
 * Constraint-aware length change. Vertex `anchor` stays fixed; the other end moves along the wall
 * direction. Neighbouring walls that are perpendicular at the moving end are translated with it, so
 * rectangles stay rectangles and shared walls stay shared.
 */
/**
 * Which end of a wall should stay put. 'auto' keeps the corner that a wall measured earlier already
 * holds, so the room grows into the side that is still free: measure one wall, and the next
 * measurement can only move the corner that nothing is holding.
 */
export function anchorEnd(f: Floor, wallId: ID, fallback: 'a' | 'b' = 'a'): 'a' | 'b' {
  const w = f.walls[wallId];
  if (!w) return fallback;
  const held = (v: ID) => Object.values(f.walls).some((x) => x.locked && x.id !== wallId && (x.a === v || x.b === v));
  const a = held(w.a), b = held(w.b);
  if (a === b) return fallback; // both ends held, or neither: nothing to choose between
  return a ? 'a' : 'b';
}

export function setWallLength(prev: Floor, wallId: ID, length: number, anchor: 'a' | 'b' | 'auto' = 'a', opts: { lock?: boolean } = {}): Floor {
  const w = prev.walls[wallId];
  if (!w) fail('missing', 'Wall not found');
  if (!(length >= 0.05)) fail('length', 'Wall length must be at least 5 cm.');
  if (w.locked) fail('locked', `This wall is locked at ${wallLength(prev, w).toFixed(2)} m (measured). Release it to change it.`);
  const end = anchor === 'auto' ? anchorEnd(prev, wallId) : anchor;
  const fixedId = end === 'a' ? w.a : w.b, movingId = end === 'a' ? w.b : w.a;
  const F = pt(prev, fixedId), M = pt(prev, movingId);
  const dir = norm(sub(M, F));
  const delta = sub(add(F, scale(dir, length)), M);
  const moving = new Set<ID>([movingId]);
  // follow chains of perpendicular walls from the moving corner (e.g. the opposite side of a rectangle)
  const adjacency = new Map<ID, ID[]>();
  for (const x of Object.values(prev.walls)) {
    adjacency.set(x.a, [...(adjacency.get(x.a) ?? []), x.b]);
    adjacency.set(x.b, [...(adjacency.get(x.b) ?? []), x.a]);
  }
  const queue = [movingId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const nb of adjacency.get(cur) ?? []) {
      if (moving.has(nb) || nb === fixedId) continue;
      const d2 = norm(sub(pt(prev, nb), pt(prev, cur)));
      if (Math.abs(dot(d2, dir)) < 1e-3) { moving.add(nb); queue.push(nb); }
    }
  }
  // a locked wall may only be carried along as a whole: either both of its corners move, or neither.
  // Growing the moving set keeps it rigid; where that would have to move the fixed corner, the chain
  // is cut back instead and the room simply stops being a perfect rectangle — which is what a
  // measured room looks like.
  const lockedWalls = Object.values(prev.walls).filter((x) => x.locked && x.id !== wallId);
  const held = new Set<ID>(); // corners the chain must leave alone, because they hold a locked wall
  for (let iter = 0; iter <= 2 * lockedWalls.length + 2; iter++) {
    let changed = false;
    for (const lw of lockedWalls) {
      const inA = moving.has(lw.a), inB = moving.has(lw.b);
      if (inA === inB) continue; // rigid: the locked wall moves as a whole, or not at all
      const inside = inA ? lw.a : lw.b, outside = inA ? lw.b : lw.a;
      // cut the chain short rather than drag the locked wall across the plan …
      if (inside !== movingId) { moving.delete(inside); held.add(inside); changed = true; continue; }
      // … except at the corner that must move: there the locked wall has to come along, and when it
      // cannot, the corner is triangulated instead so both measurements hold
      if (outside === fixedId || held.has(outside)) {
        const fix = triangulateCorner(prev, wallId, fixedId, movingId, length);
        if (fix) return opts.lock ? updateWall(fix, wallId, { locked: true }) : fix;
        fail('locked', 'This change would stretch a locked wall that meets this one. Release that one first.');
      }
      moving.add(outside); changed = true;
    }
    if (!changed) break;
  }
  const deltas: Record<ID, Vec2> = {};
  for (const id of moving) deltas[id] = delta;
  const out = moveVertices(prev, deltas);
  return opts.lock ? updateWall(out, wallId, { locked: true }) : out;
}

/**
 * The corner is held by a wall measured earlier, so it cannot simply slide: put it where both
 * measurements are satisfied — the intersection of the circle of the new length around the fixed
 * corner and the circle of the locked wall's length around its far corner, taking the solution
 * nearer to where the corner is now. This is what lets every wall of a room keep its own measured
 * length instead of the room being forced back into a rectangle. Returns null when the corner is
 * held by more than one wall, or when the two lengths cannot meet at all.
 */
function triangulateCorner(prev: Floor, wallId: ID, fixedId: ID, movingId: ID, length: number): Floor | null {
  const held = Object.values(prev.walls).filter((x) => x.locked && x.id !== wallId && (x.a === movingId || x.b === movingId));
  if (held.length !== 1) return null;
  const lw = held[0];
  const other = lw.a === movingId ? lw.b : lw.a;
  if (other === fixedId) return null; // both lengths are between the same two corners
  const F = pt(prev, fixedId), O = pt(prev, other), M = pt(prev, movingId);
  const r1 = length, r2 = wallLength(prev, lw);
  const d = dist(F, O);
  if (!(d > 1e-9) || d > r1 + r2 - 1e-9 || d < Math.abs(r1 - r2) + 1e-9) return null;
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = r1 * r1 - a * a;
  if (h2 < 0) return null;
  const u = scale(sub(O, F), 1 / d);
  const base = add(F, scale(u, a));
  const n = scale(perp(u), Math.sqrt(h2));
  const p1 = add(base, n), p2 = sub(base, n);
  return moveVertex(prev, movingId, dist(p1, M) <= dist(p2, M) ? p1 : p2);
}

/** Hold this wall at its measured length (or let it move again). */
export function setWallLocked(prev: Floor, wallId: ID, locked: boolean): Floor {
  if (!prev.walls[wallId]) fail('missing', 'Wall not found');
  return updateWall(prev, wallId, { locked });
}

/**
 * Set the interior (inside face to inside face) length of a room edge.
 * Works by converting to the centerline length the wall needs; the wall-to-wall corner angles are
 * unchanged by setWallLength, so one pass is exact for orthogonal rooms — angled rooms converge in a
 * couple of iterations. The edge's first corner stays put (or its second with anchor 'b').
 */
export function setRoomEdgeInteriorLength(prev: Floor, roomId: ID, edgeIndex: number, target: number, anchor: 'a' | 'b' | 'auto' = 'a', opts: { lock?: boolean } = {}): Floor {
  const room0 = prev.rooms[roomId];
  if (!room0) fail('missing', 'Room not found');
  if (!(edgeIndex >= 0 && edgeIndex < room0.vertexIds.length)) fail('edge', 'That wall is not part of the room.');
  if (!(target >= 0.05)) fail('length', 'Interior length must be at least 5 cm.');
  let f = prev;
  for (let pass = 0; pass < 4; pass++) {
    const room = f.rooms[roomId];
    const w = roomEdgeWalls(f, room)[edgeIndex];
    if (!w) return fail('missing', 'Wall not found');
    const m = roomMetrics(f, room);
    const cur = m.netEdgeLengths[edgeIndex];
    if (!(cur > 0)) fail('thickness', 'The walls are too thick for this room.');
    const delta = target - cur;
    if (Math.abs(delta) < 1e-6) break;
    const end = anchor === 'auto' ? anchorEnd(f, w.id, w.a === room.vertexIds[edgeIndex] ? 'a' : 'b') : anchor;
    const startVertex = anchor === 'auto'
      ? (end === 'a' ? w.a : w.b)
      : room.vertexIds[end === 'a' ? edgeIndex : (edgeIndex + 1) % room.vertexIds.length];
    f = setWallLength(f, w.id, wallLength(f, w) + delta, w.a === startVertex ? 'a' : 'b');
  }
  if (opts.lock) {
    const w = roomEdgeWalls(f, f.rooms[roomId])[edgeIndex];
    if (w) f = updateWall(f, w.id, { locked: true });
  }
  return f;
}

export function setWallAngle(prev: Floor, wallId: ID, deg: number): Floor {
  const w = prev.walls[wallId];
  if (!w) fail('missing', 'Wall not found');
  const { a, b } = wallEnds(prev, w);
  const L = dist(a, b);
  const r = (deg * Math.PI) / 180;
  return moveVertex(prev, w.b, { x: a.x + Math.cos(r) * L, y: a.y + Math.sin(r) * L });
}

export function updateWall(prev: Floor, wallId: ID, patch: Partial<Pick<Wall, 'thickness' | 'height' | 'exterior' | 'material' | 'kind' | 'railingStyle' | 'locked'>>): Floor {
  const cur = prev.walls[wallId];
  if (!cur) fail('missing', 'Wall not found');
  const f = copy(prev);
  const w = { ...f.walls[wallId], ...patch };
  if ('exterior' in patch) w.exteriorManual = true;
  if (patch.kind && patch.kind !== cur.kind) {
    // switching type: give the wall a sensible height for its new kind
    if (patch.kind === 'railing') {
      if (Object.values(f.openings).some((o) => o.wallId === wallId)) fail('railing-opening', 'Remove the doors/windows on this wall before turning it into a railing.');
      if (patch.height === undefined) w.height = cur.height != null && cur.height <= 2 ? cur.height : DEFAULT_RAILING_HEIGHT;
      if (patch.thickness === undefined) w.thickness = Math.min(cur.thickness, 0.12);
    } else if (patch.kind === 'open') {
      // an open passage: the rooms stay separate rooms, there is simply no wall between them
      if (Object.values(f.openings).some((o) => o.wallId === wallId)) fail('open-opening', 'Remove the doors/windows on this wall before opening the passage.');
      if (patch.height === undefined) w.height = null;
    } else {
      if (patch.height === undefined) w.height = null;
      if (patch.thickness === undefined && w.thickness < f.defaultWallThickness) w.thickness = f.defaultWallThickness;
    }
  }
  f.walls[wallId] = w;
  return finalize(prev, f);
}

export function setWallKind(prev: Floor, wallId: ID, kind: WallKind, railingStyle?: RailingStyle): Floor {
  return updateWall(prev, wallId, railingStyle ? { kind, railingStyle } : { kind });
}

/** Split a wall by inserting a corner at distance t from vertex a. */
export function insertCorner(prev: Floor, wallId: ID, t: number): { floor: Floor; vertexId: ID } {
  const w = prev.walls[wallId];
  if (!w) fail('missing', 'Wall not found');
  const L = wallLength(prev, w);
  if (t <= 0.01 || t >= L - 0.01) fail('corner', 'The new corner must be inside the wall.');
  for (const o of Object.values(prev.openings))
    if (o.wallId === wallId && t > o.t - o.width / 2 - 1e-6 && t < o.t + o.width / 2 + 1e-6) fail('corner', 'Cannot split a wall through a door or window.');
  const f = copy(prev);
  const { a, b } = wallEnds(prev, w);
  const p = cleanPt(add(a, scale(norm(sub(b, a)), t)));
  const id = uid();
  f.vertices[id] = { id, ...p };
  for (const r of Object.values(f.rooms)) {
    const ids = r.vertexIds;
    for (let i = 0; i < ids.length; i++) {
      const x = ids[i], y = ids[(i + 1) % ids.length];
      if (edgeKey(x, y) === edgeKey(w.a, w.b)) { ids.splice(i + 1, 0, id); break; }
    }
  }
  if (w.standalone) {
    const w2: Wall = { ...w, id: uid(), a: id, b: w.b };
    f.walls[w.id] = { ...w, b: id };
    f.walls[w2.id] = w2;
  }
  return { floor: finalize(prev, f), vertexId: id };
}

export function deleteCorner(prev: Floor, vid: ID): Floor {
  const f = copy(prev);
  for (const r of Object.values(f.rooms)) {
    if (!r.vertexIds.includes(vid)) continue;
    if (r.vertexIds.length <= 3) fail('corner', `${r.name} needs at least 3 corners.`);
    r.vertexIds = r.vertexIds.filter((x) => x !== vid);
  }
  for (const w of Object.values(f.walls)) if (w.standalone && (w.a === vid || w.b === vid)) delete f.walls[w.id];
  return finalize(prev, f);
}

/** Merge two collinear walls by removing the straight corner between them. */
export function mergeWallsAt(prev: Floor, vid: ID): Floor {
  const walls = Object.values(prev.walls).filter((w) => w.a === vid || w.b === vid);
  if (walls.length !== 2) fail('merge-walls', 'Only a corner joining exactly two walls can be removed.');
  const [w1, w2] = walls;
  const o1 = w1.a === vid ? w1.b : w1.a, o2 = w2.a === vid ? w2.b : w2.a;
  const d1 = norm(sub(pt(prev, o1), pt(prev, vid))), d2 = norm(sub(pt(prev, o2), pt(prev, vid)));
  if (dot(d1, d2) > -0.9999) fail('merge-walls', 'The walls are not in line.');
  return deleteCorner(prev, vid);
}

export function addPartitionWall(prev: Floor, p1: Vec2, p2: Vec2, thickness = 0.1, opts: { kind?: WallKind; railingStyle?: RailingStyle; height?: number | null } = {}): { floor: Floor; wallId: ID } {
  if (dist(p1, p2) < 0.05) fail('length', 'Wall is too short.');
  const f = copy(prev);
  const idFor = (p: Vec2) => {
    const ex = findVertexAt(f, p);
    if (ex) return ex;
    const id = uid();
    f.vertices[id] = { id, ...cleanPt(p) };
    return id;
  };
  const a = idFor(p1), b = idFor(p2);
  const kind = opts.kind ?? 'solid';
  const w: Wall = {
    id: uid(), a, b, thickness: kind === 'railing' ? Math.min(thickness, 0.08) : thickness,
    height: opts.height ?? (kind === 'railing' ? DEFAULT_RAILING_HEIGHT : null),
    exterior: false, exteriorManual: false, material: kind === 'railing' ? 'steel' : 'plaster', standalone: true,
    kind, railingStyle: opts.railingStyle ?? 'bars', locked: false,
  };
  f.walls[w.id] = w;
  return { floor: finalize(prev, f), wallId: w.id };
}

// ---------------------------------------------------------------------------------------------
// Closing a ring of walls into a room
// ---------------------------------------------------------------------------------------------

const TAU = Math.PI * 2;

/** corner -> the corners it is joined to by a wall (room walls included) */
function wallGraph(f: Floor): Map<ID, ID[]> {
  const m = new Map<ID, Set<ID>>();
  const link = (from: ID, to: ID) => { const s = m.get(from); if (s) s.add(to); else m.set(from, new Set([to])); };
  for (const w of Object.values(f.walls)) {
    if (w.a === w.b || !f.vertices[w.a] || !f.vertices[w.b]) continue;
    link(w.a, w.b); link(w.b, w.a);
  }
  return new Map([...m].map(([k, s]) => [k, [...s]]));
}

/**
 * Walk the face of the wall graph that lies on one side of the half-edge u0 -> v0, by always taking
 * the tightest turn at each corner. Returns the face's corners, or null if it does not close into a
 * simple ring (an open chain, or a corner visited twice).
 */
function traceFace(f: Floor, adj: Map<ID, ID[]>, u0: ID, v0: ID): ID[] | null {
  const ring: ID[] = [];
  let u = u0, v = v0;
  for (let guard = 0; guard < 1024; guard++) {
    ring.push(u);
    const ns = adj.get(v);
    if (!ns?.length) return null;
    const P = pt(f, v);
    const base = Math.atan2(pt(f, u).y - P.y, pt(f, u).x - P.x);
    let next: ID | null = null, tightest = Infinity;
    for (const n of ns) {
      if (n === u && ns.length > 1) continue; // only turn back at a dead end
      const Q = pt(f, n);
      let turn = (base - Math.atan2(Q.y - P.y, Q.x - P.x)) % TAU;
      if (turn <= 1e-9) turn += TAU; // measured from the way we came in, never zero
      if (turn < tightest) { tightest = turn; next = n; }
    }
    if (!next) return null;
    if (v === u0 && next === v0) return new Set(ring).size === ring.length && ring.length >= 3 ? ring : null;
    u = v; v = next;
  }
  return null;
}

/**
 * The rings of walls that `wallId` closes — the faces of the wall graph on either side of it,
 * smallest first. Empty when the wall closes nothing (it is part of an open chain).
 */
export function wallLoops(f: Floor, wallId: ID): ID[][] {
  const w = f.walls[wallId];
  if (!w) return [];
  const adj = wallGraph(f);
  const faces: ID[][] = [];
  for (const [u, v] of [[w.a, w.b], [w.b, w.a]] as const) {
    const ring = traceFace(f, adj, u, v);
    if (!ring) continue;
    if (faces.some((o) => o.length === ring.length && o.every((id) => ring.includes(id)))) continue;
    faces.push(ring);
  }
  const area = (ring: ID[]) => Math.abs(signedArea(ring.map((id) => pt(f, id))));
  return faces.filter((r) => area(r) > 1e-6).sort((a, b) => area(a) - area(b));
}

/** The tightest ring of walls closed by `wallId`, or null when it closes none. */
export function wallLoopAt(f: Floor, wallId: ID): ID[] | null {
  return wallLoops(f, wallId)[0] ?? null;
}

/**
 * Turn the ring of walls closed by `wallId` into a room. The walls themselves are kept — finalize()
 * promotes a partition that coincides with a room edge, so their thickness, height and railing
 * settings carry over, and a ring closed against an existing room shares that room's wall. Returns
 * null when the wall closes no ring, or when no ring can become a room (self-intersecting, or it
 * would overlap an existing room); the caller then keeps the walls as they are.
 */
export function closeWallLoop(prev: Floor, wallId: ID, opts: RoomOptions = {}): { floor: Floor; roomId: ID } | null {
  for (const ring of wallLoops(prev, wallId)) {
    try {
      return addRoom(prev, ring.map((id) => pt(prev, id)), opts);
    } catch (e) {
      if (!(e instanceof GeometryError)) throw e;
    }
  }
  return null;
}

/**
 * Remove a wall. A drawn partition goes away completely; a wall that is an edge of a room cannot
 * simply vanish (the room would lose its outline), so it becomes an OPEN passage: no wall, no
 * surface, nothing in 3D — and the rooms on either side stay separate rooms, each keeping its name,
 * area and finishes. That is how an open-plan kitchen and living room are drawn.
 */
export function deleteWall(prev: Floor, wallId: ID): Floor {
  const w = prev.walls[wallId];
  if (!w) fail('missing', 'Wall not found');
  if (!w.standalone) {
    if (w.kind === 'open') fail('already-open', 'There is no wall there — the passage is already open.');
    return updateWall(prev, wallId, { kind: 'open' });
  }
  const f = copy(prev);
  delete f.walls[wallId];
  for (const o of Object.values(f.openings)) if (o.wallId === wallId) delete f.openings[o.id];
  return finalize(prev, f);
}

// ---------------------------------------------------------------------------------------------
// Openings
// ---------------------------------------------------------------------------------------------

export const OPENING_DEFAULTS: Record<Opening['kind'], Pick<Opening, 'width' | 'height' | 'sill' | 'subtype'>> = {
  door: { width: 0.8, height: 2.1, sill: 0, subtype: 'single' },
  window: { width: 1.2, height: 1.2, sill: 0.9, subtype: 'sliding' },
  opening: { width: 0.9, height: 2.1, sill: 0, subtype: 'opening' },
};

export function addOpening(prev: Floor, wallId: ID, kind: Opening['kind'], t: number, patch: Partial<Opening> = {}): { floor: Floor; openingId: ID } {
  const w = prev.walls[wallId];
  if (!w) fail('missing', 'Wall not found');
  const f = copy(prev);
  const L = wallLength(prev, w);
  const d = { ...OPENING_DEFAULTS[kind], ...patch };
  const tt = Math.min(Math.max(t, d.width / 2), L - d.width / 2);
  if (d.width > L + 1e-6) fail('opening-fit', `The ${kind} (${(d.width * 100).toFixed(0)} cm) is wider than the wall (${L.toFixed(2)} m).`);
  const o: Opening = {
    id: uid(), wallId, kind, subtype: d.subtype, t: clean(tt), width: d.width, height: d.height, sill: d.sill,
    hinge: patch.hinge ?? 'start', side: patch.side ?? 1, frameDepth: patch.frameDepth ?? 0.05, material: patch.material ?? (kind === 'window' ? 'aluminium' : 'wood'),
  };
  f.openings[o.id] = o;
  return { floor: finalize(prev, f), openingId: o.id };
}

export function updateOpening(prev: Floor, id: ID, patch: Partial<Omit<Opening, 'id'>>): Floor {
  if (!prev.openings[id]) fail('missing', 'Opening not found');
  const f = copy(prev);
  f.openings[id] = { ...f.openings[id], ...patch };
  return finalize(prev, f);
}

/**
 * Position an opening by a distance measured to one of its EDGES: from the corner to the near side
 * of the door, or from its far side to the next corner — the two measurements taken on site. In
 * interior mode the distance runs from the inside face of the wall at that end.
 * `keepWidth: false` moves the opposite edge instead, so measuring both sides of a window sets its
 * width from what was actually measured.
 */
export function setOpeningOffset(
  prev: Floor, id: ID, side: 'start' | 'end', distance: number,
  opts: { measure?: 'centerline' | 'interior'; keepWidth?: boolean } = {},
): Floor {
  const o = prev.openings[id];
  if (!o) fail('missing', 'Opening not found');
  if (!(distance >= 0)) fail('offset', 'A distance to the wall cannot be negative.');
  const off = openingOffsets(prev, o, opts.measure ?? 'centerline');
  if (opts.keepWidth === false) {
    // hold the opposite edge and move this one: the measured width follows
    const far = side === 'start' ? off.to - off.end : off.from + off.start;
    const near = side === 'start' ? off.from + distance : off.to - distance;
    const width = Math.abs(far - near);
    if (!(width >= 0.05)) fail('opening-size', 'That leaves the opening narrower than 5 cm.');
    return updateOpening(prev, id, { width, t: (far + near) / 2 });
  }
  const t = side === 'start' ? off.from + distance + o.width / 2 : off.to - distance - o.width / 2;
  return updateOpening(prev, id, { t });
}

export function deleteOpening(prev: Floor, id: ID): Floor {
  const f = copy(prev);
  delete f.openings[id];
  return finalize(prev, f);
}

// ---------------------------------------------------------------------------------------------
// Furniture, dimensions, annotations
// ---------------------------------------------------------------------------------------------

export function addFurniture(prev: Floor, item: Omit<Furniture, 'id'>): { floor: Floor; id: ID } {
  if (!(item.width > 0 && item.depth > 0 && item.height > 0)) fail('size', 'Object dimensions must be positive.');
  const f = copy(prev);
  const id = uid();
  f.furniture[id] = { ...item, id };
  return { floor: finalize(prev, f), id };
}

export function updateFurniture(prev: Floor, id: ID, patch: Partial<Omit<Furniture, 'id'>>): Floor {
  const cur = prev.furniture[id];
  if (!cur) fail('missing', 'Object not found');
  const next = { ...cur, ...patch };
  if (!(next.width > 0 && next.depth > 0 && next.height > 0)) fail('size', 'Object dimensions must be positive.');
  const f = copy(prev);
  f.furniture[id] = next;
  return f;
}

export function deleteFurniture(prev: Floor, id: ID): Floor {
  const f = copy(prev);
  delete f.furniture[id];
  return f;
}

export function addDimension(prev: Floor, a: Vec2, b: Vec2, offset = 0.3): { floor: Floor; id: ID } {
  if (dist(a, b) < 0.005) fail('length', 'Dimension is too short.');
  const f = copy(prev);
  const id = uid();
  f.dimensions[id] = { id, a: cleanPt(a), b: cleanPt(b), offset };
  return { floor: f, id };
}

export function addAnnotation(prev: Floor, p: Vec2, text: string): { floor: Floor; id: ID } {
  const f = copy(prev);
  const id = uid();
  f.annotations[id] = { id, x: p.x, y: p.y, text };
  return { floor: f, id };
}

// ---------------------------------------------------------------------------------------------
// Lowered ceilings (soffits)
// ---------------------------------------------------------------------------------------------

export function ceilingDropCorners(c: { x: number; y: number; width: number; depth: number; rotation: number }) { return furnitureCorners(c); }

/** Ceiling height of the room under the zone centre (or floor default). */
export function ceilingAbove(f: Floor, p: Vec2): number {
  for (const r of Object.values(f.rooms)) if (pointInPolygon(p, roomPoints(f, r))) return r.height;
  return f.defaultHeight;
}

function checkDrop(f: Floor, c: CeilingDrop) {
  if (!(c.width >= 0.05 && c.depth >= 0.05)) fail('size', 'Lowered ceiling must be at least 5 × 5 cm.');
  const top = ceilingAbove(f, c);
  if (!(c.height > 0.5 && c.height < top - 1e-6)) fail('ceiling-height', `Lowered ceiling height must be between 0.50 m and the room ceiling (${top.toFixed(2)} m).`);
}

export function addCeilingDrop(prev: Floor, o: Omit<CeilingDrop, 'id' | 'name' | 'rotation'> & { name?: string; rotation?: number }): { floor: Floor; id: ID } {
  const f = copy(prev);
  const id = uid();
  const c: CeilingDrop = { id, name: o.name ?? 'Lowered ceiling', rotation: o.rotation ?? 0, x: clean(o.x), y: clean(o.y), width: clean(o.width), depth: clean(o.depth), height: o.height };
  checkDrop(f, c);
  f.ceilingDrops = { ...(f.ceilingDrops ?? {}), [id]: c };
  return { floor: f, id };
}

export function updateCeilingDrop(prev: Floor, id: ID, patch: Partial<Omit<CeilingDrop, 'id'>>): Floor {
  const cur = prev.ceilingDrops?.[id];
  if (!cur) fail('missing', 'Lowered ceiling not found');
  const f = copy(prev);
  const c = { ...cur!, ...patch };
  checkDrop(f, c);
  f.ceilingDrops = { ...f.ceilingDrops, [id]: c };
  return f;
}

// ---------------------------------------------------------------------------------------------
// Site photos
// ---------------------------------------------------------------------------------------------

/** Pin a photo taken on site to a point on the plan. */
export function addPhoto(prev: Floor, photo: Omit<Photo, 'id' | 'takenAt'> & { takenAt?: string }): { floor: Floor; id: ID } {
  if (!photo.dataUrl) fail('photo', 'The photo is empty.');
  const f = copy(prev);
  const id = uid();
  const n = Object.keys(f.photos ?? {}).length + 1;
  f.photos = {
    ...(f.photos ?? {}),
    [id]: {
      ...photo, ...cleanPt(photo), id, name: photo.name || `Photo ${n}`,
      subjectId: photo.subjectId ?? null, note: photo.note ?? '',
      takenAt: photo.takenAt ?? new Date().toISOString(),
    },
  };
  return { floor: f, id };
}

export function updatePhoto(prev: Floor, id: ID, patch: Partial<Omit<Photo, 'id'>>): Floor {
  if (!prev.photos?.[id]) fail('missing', 'Photo not found');
  const f = copy(prev);
  f.photos[id] = { ...f.photos[id], ...patch };
  return f;
}

export function deleteEntity(prev: Floor, id: ID): Floor {
  if (prev.photos?.[id]) { const f = copy(prev); delete f.photos[id]; return f; }
  if (prev.ceilingDrops?.[id]) { const f = copy(prev); delete f.ceilingDrops[id]; return f; }
  if (prev.rooms[id]) return deleteRoom(prev, id);
  if (prev.openings[id]) return deleteOpening(prev, id);
  if (prev.furniture[id]) return deleteFurniture(prev, id);
  if (prev.walls[id]) return deleteWall(prev, id);
  if (prev.vertices[id]) return deleteCorner(prev, id);
  const f = copy(prev);
  if (f.dimensions[id]) { delete f.dimensions[id]; return f; }
  if (f.annotations[id]) { delete f.annotations[id]; return f; }
  return fail('missing', 'Nothing to delete.');
}

export { interiorPoint };
