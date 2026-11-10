import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createFloor, addRectRoom, addRoom, roomMetrics, floorMetrics, setWallLength, addOpening, insertCorner, splitRoom, mergeRooms,
  moveRoom, moveVertex, validatePolygon, polygonArea, triangulate, parseLength, formatLength, findWallForEdge, wallLength,
  roomEdgeWalls, reidFloor, validateFloor, moveWall, deleteRoom, openingGeometry, objectToWallDistance, addFurniture, rotateRoom,
  createProject, addFloor, parseProject, mergeWallsAt, updateOpening,
} from '../src/index';
import { GeometryError } from '../../shared-types/src/index';
import type { Floor } from '../../shared-types/src/index';

const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
const rooms = (f: Floor) => Object.values(f.rooms);

function apartment() {
  let f = createFloor('Floor 1');
  const r1 = addRectRoom(f, { x: 0, y: 0, width: 4, length: 3.5, height: 2.75, name: 'Living' });
  f = r1.floor;
  const r2 = addRectRoom(f, { x: 4, y: 0, width: 3, length: 3.5, name: 'Kitchen' });
  return { f: r2.floor, living: r1.roomId, kitchen: r2.roomId };
}

test('rectangle area, perimeter, volume (acceptance: 4.00 x 3.50 = 14.00 m²)', () => {
  const { floor, roomId } = addRectRoom(createFloor('F'), { x: 0, y: 0, width: 4, length: 3.5, height: 2.75 });
  const m = roomMetrics(floor, floor.rooms[roomId]);
  close(m.grossArea, 14);
  close(m.perimeter, 15);
  assert.equal(m.grossArea.toFixed(2), '14.00');
  // net interior area with 15 cm walls on centerline
  close(m.netArea, (4 - 0.15) * (3.5 - 0.15));
  close(m.volume, m.netArea * 2.75);
  assert.equal(Object.keys(floor.walls).length, 4);
  assert.ok(Object.values(floor.walls).every((w) => w.exterior));
});

test('exact precise-dimension creation 4.25 x 3.60 x 2.75', () => {
  const { floor, roomId } = addRectRoom(createFloor('F'), { x: 1.1, y: -2.3, width: 4.25, length: 3.6, height: 2.75 });
  const m = roomMetrics(floor, floor.rooms[roomId]);
  close(m.grossArea, 4.25 * 3.6, 1e-9);
  assert.deepEqual(m.edgeLengths.map((x) => +x.toFixed(9)).sort(), [3.6, 3.6, 4.25, 4.25]);
  assert.equal(floor.rooms[roomId].height, 2.75);
});

test('irregular and L-shaped polygon areas', () => {
  const L = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 5 }, { x: 0, y: 5 }];
  close(polygonArea(L), 6 * 2 + 2 * 3);
  const tri = triangulate(L);
  assert.equal(tri.length, 4);
  close(tri.reduce((s, [a, b, c]) => s + polygonArea([L[a], L[b], L[c]]), 0), 18);
  const irregular = [{ x: 0, y: 0 }, { x: 5, y: 1 }, { x: 4, y: 4 }, { x: 1, y: 3.5 }];
  close(polygonArea(irregular), 13);
  const angled = addRoom(createFloor('F'), [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 3 }, { x: 0, y: 3 }]);
  close(roomMetrics(angled.floor, angled.floor.rooms[angled.roomId]).grossArea, 13.5);
});

test('invalid polygons are rejected with clear codes', () => {
  assert.equal(validatePolygon([{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 2, y: 0 }, { x: 0, y: 2 }])?.code, 'self-intersect');
  assert.equal(validatePolygon([{ x: 0, y: 0 }, { x: 1, y: 0 }])?.code, 'too-few');
  assert.equal(validatePolygon([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }])?.code, 'degenerate');
  assert.throws(() => addRoom(createFloor('F'), [{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 2, y: 0 }, { x: 0, y: 2 }]), (e: GeometryError) => e.code === 'self-intersect');
});

test('shared walls: adjacent rooms share vertices and one interior wall', () => {
  const { f, living, kitchen } = apartment();
  assert.equal(Object.keys(f.vertices).length, 6);
  assert.equal(Object.keys(f.walls).length, 7);
  const shared = Object.values(f.walls).filter((w) => !w.exterior);
  assert.equal(shared.length, 1);
  close(wallLength(f, shared[0]), 3.5);
  const fm = floorMetrics(f);
  close(fm.grossArea, 14 + 10.5);
  assert.ok(f.rooms[living] && f.rooms[kitchen]);
});

test('T-junction: smaller neighbour splits the longer wall', () => {
  let f = addRectRoom(createFloor('F'), { x: 0, y: 0, width: 4, length: 3.5 }).floor;
  const r2 = addRectRoom(f, { x: 4, y: 0, width: 2, length: 2 });
  f = r2.floor;
  const r1 = rooms(f).find((r) => r.id !== r2.roomId)!;
  assert.equal(r1.vertexIds.length, 5);
  close(roomMetrics(f, r1).grossArea, 14);
  // 4 walls room1 (one split into 2) + 3 new walls of room 2
  assert.equal(Object.keys(f.walls).length, 8);
  assert.equal(Object.values(f.walls).filter((w) => !w.exterior).length, 1);
});

test('overlapping rooms are rejected', () => {
  const f = addRectRoom(createFloor('F'), { x: 0, y: 0, width: 4, length: 3.5 }).floor;
  assert.throws(() => addRectRoom(f, { x: 2, y: 1, width: 4, length: 2 }), (e: GeometryError) => e.code === 'overlap');
  assert.throws(() => addRectRoom(f, { x: 1, y: 1, width: 1, length: 1 }), (e: GeometryError) => e.code === 'overlap');
  assert.throws(() => addRectRoom(f, { x: 0, y: 0, width: 4, length: 3.5 }), (e: GeometryError) => e.code === 'overlap');
});

test('dimension editing: wall length change keeps rectangle and updates the shared neighbour', () => {
  const { f, living, kitchen } = apartment();
  const r = f.rooms[living];
  const top = findWallForEdge(f, r.vertexIds[0], r.vertexIds[1])!;
  close(wallLength(f, top), 4);
  const g = setWallLength(f, top.id, 5, top.a === r.vertexIds[0] ? 'a' : 'b');
  close(roomMetrics(g, g.rooms[living]).grossArea, 17.5);
  close(roomMetrics(g, g.rooms[kitchen]).grossArea, 7);
  validateFloor(g);
  // original untouched (immutability for undo)
  close(roomMetrics(f, f.rooms[living]).grossArea, 14);
});

test('doors: placement, fit validation, survive wall split with correct offset', () => {
  const { f, living } = apartment();
  const r = f.rooms[living];
  const top = findWallForEdge(f, r.vertexIds[0], r.vertexIds[1])!;
  const { floor: g, openingId } = addOpening(f, top.id, 'door', 2, { width: 0.8 });
  const og = openingGeometry(g, g.openings[openingId]);
  close(og.center.x, 2); close(og.center.y, 0);
  // shrinking the wall below the door must fail and must not corrupt
  assert.throws(() => setWallLength(g, top.id, 2.2), (e: GeometryError) => e.code === 'opening-fit');
  // overlapping second door rejected
  assert.throws(() => addOpening(g, top.id, 'door', 2.3), (e: GeometryError) => e.code === 'opening-overlap');
  // splitting through the door rejected; split elsewhere reassigns the door
  assert.throws(() => insertCorner(g, top.id, 2), (e: GeometryError) => e.code === 'corner');
  const { floor: h } = insertCorner(g, top.id, 1);
  const o = h.openings[openingId];
  assert.ok(o, 'door kept');
  const og2 = openingGeometry(h, o);
  close(og2.center.x, 2, 1e-6); close(og2.center.y, 0, 1e-6);
  close(wallLength(h, h.walls[o.wallId]), 3);
  // window
  const { floor: k, openingId: win } = addOpening(h, o.wallId, 'window', 2.6, { width: 0.6 });
  assert.equal(k.openings[win].sill, 0.9);
});

test('door survives moving its wall length from the anchor side', () => {
  const { floor: f, roomId } = addRectRoom(createFloor('F'), { x: 0, y: 0, width: 4, length: 3.5 });
  const r = f.rooms[roomId];
  const top = findWallForEdge(f, r.vertexIds[0], r.vertexIds[1])!;
  const { floor: g, openingId } = addOpening(f, top.id, 'door', 1);
  const h = setWallLength(g, top.id, 6, 'a');
  const og = openingGeometry(h, h.openings[openingId]);
  const A = h.vertices[top.a];
  close(Math.hypot(og.center.x - A.x, og.center.y - A.y), 1);
});

test('room split and merge preserve area', () => {
  const { floor: f, roomId } = addRectRoom(createFloor('F'), { x: 0, y: 0, width: 4, length: 3 });
  const r = f.rooms[roomId];
  const top = roomEdgeWalls(f, r)[0]!;
  const bottom = roomEdgeWalls(f, r)[2]!;
  const s1 = insertCorner(f, top.id, 2);
  const tb = Object.values(s1.floor.walls).find((w) => (w.a === bottom.a && w.b === bottom.b))!;
  const s2 = insertCorner(s1.floor, tb.id, 2);
  const { floor: g, newRoomId } = splitRoom(s2.floor, roomId, s1.vertexId, s2.vertexId);
  close(roomMetrics(g, g.rooms[roomId]).grossArea, 6);
  close(roomMetrics(g, g.rooms[newRoomId]).grossArea, 6);
  assert.equal(Object.values(g.walls).filter((w) => !w.exterior).length, 1);
  const m = mergeRooms(g, roomId, newRoomId);
  assert.equal(Object.keys(m.rooms).length, 1);
  close(floorMetrics(m).grossArea, 12);
  // straight corners can be merged away again
  const cleaned = mergeWallsAt(mergeWallsAt(m, s1.vertexId), s2.vertexId);
  assert.equal(Object.keys(cleaned.walls).length, 4);
});

test('moving a room detaches shared walls and carries its doors and furniture', () => {
  const { f, living, kitchen } = apartment();
  const r = f.rooms[kitchen];
  const ext = roomEdgeWalls(f, r).find((w) => w && w.exterior)!;
  const { floor: g, openingId } = addOpening(f, ext.id, 'window', 1.5);
  const fu = addFurniture(g, { catalogId: 'table', name: 'Table', category: 'kitchen', x: 5.5, y: 1.75, rotation: 0, width: 1.2, depth: 0.8, height: 0.75, elevation: 0, mirrored: false, layer: 'furniture', color: '#a77', meta: {} });
  const before = openingGeometry(fu.floor, fu.floor.openings[openingId]).center;
  const h = moveRoom(fu.floor, kitchen, 1, 0);
  const after = openingGeometry(h, h.openings[openingId]).center;
  close(after.x, before.x + 1); close(after.y, before.y);
  close(h.furniture[fu.id].x, 6.5);
  close(roomMetrics(h, h.rooms[living]).grossArea, 14);
  assert.equal(Object.values(h.walls).filter((w) => !w.exterior).length, 0);
  const rot = rotateRoom(h, kitchen, 90);
  close(roomMetrics(rot, rot.rooms[kitchen]).grossArea, 10.5);
});

test('vertex move rejects self-intersection and leaves input untouched', () => {
  const { floor: f, roomId } = addRectRoom(createFloor('F'), { x: 0, y: 0, width: 4, length: 3 });
  const v = f.rooms[roomId].vertexIds[0];
  assert.throws(() => moveVertex(f, v, { x: 2, y: 5 }), GeometryError);
  const g = moveVertex(f, v, { x: -1, y: 0 });
  close(floorMetrics(g).grossArea, 13.5);
  close(f.vertices[v].x, 0);
});

test('moving a shared wall changes both rooms', () => {
  const { f, living, kitchen } = apartment();
  const shared = Object.values(f.walls).find((w) => !w.exterior)!;
  const a = f.vertices[shared.a], b = f.vertices[shared.b];
  const sign = (b.y - a.y) > 0 ? -1 : 1; // left normal of a->b points -x when going +y
  const g = moveWall(f, shared.id, 0.5 * sign);
  close(roomMetrics(g, g.rooms[living]).grossArea + roomMetrics(g, g.rooms[kitchen]).grossArea, 24.5);
  close(roomMetrics(g, g.rooms[living]).grossArea, 14 + 0.5 * 3.5);
});

test('delete room removes its exclusive walls/openings but keeps the neighbour intact', () => {
  const { f, living, kitchen } = apartment();
  const g = deleteRoom(f, kitchen);
  assert.equal(Object.keys(g.walls).length, 4);
  assert.ok(Object.values(g.walls).every((w) => w.exterior));
  close(roomMetrics(g, g.rooms[living]).grossArea, 14);
});

test('object-to-wall distance', () => {
  const { floor: f } = addRectRoom(createFloor('F'), { x: 0, y: 0, width: 4, length: 3.5 });
  const { floor: g, id } = addFurniture(f, { catalogId: 'sofa', name: 'Sofa', category: 'living', x: 2, y: 1, rotation: 0, width: 2, depth: 0.9, height: 0.8, elevation: 0, mirrored: false, layer: 'furniture', color: '#888', meta: {} });
  // footprint top edge at y = 0.55, wall face at y = 0.075
  close(objectToWallDistance(g, id).distance, 0.55 - 0.075);
});

test('units parse/format', () => {
  close(parseLength('4.25')!, 4.25);
  close(parseLength('425cm')!, 4.25);
  close(parseLength('4250 mm')!, 4.25);
  close(parseLength('80', 'cm')!, 0.8);
  close(parseLength("12' 6\"")!, 12 * 0.3048 + 6 * 0.0254);
  close(parseLength('3,5')!, 3.5);
  assert.equal(parseLength('abc'), null);
  assert.equal(formatLength(4.256, 'm', 2), '4.26 m');
  assert.equal(formatLength(0.8, 'cm', 2), '80.0 cm');
  assert.equal(formatLength(0.3048 * 10 + 0.0254 * 3, 'ft-in', 2), `10' 3"`);
});

test('floor duplicate re-ids all entities and stays valid; project JSON roundtrip', () => {
  const { f } = apartment();
  const d = reidFloor(f);
  validateFloor(d);
  assert.equal(Object.keys(d.walls).length, 7);
  assert.ok(Object.keys(d.vertices).every((k) => !(k in f.vertices)));
  let p = createProject('My Apartment');
  p = addFloor(p, 'Floor 1').project;
  p = { ...p, floors: [{ ...f, id: p.floors[0].id, name: 'Floor 1' }] };
  const back = parseProject(JSON.parse(JSON.stringify(p)));
  close(floorMetrics(back.floors[0]).grossArea, 24.5);
  assert.throws(() => parseProject({ ...p, floors: [] }));
});

test('opening update validates and keeps geometry', () => {
  const { floor: f, roomId } = addRectRoom(createFloor('F'), { x: 0, y: 0, width: 4, length: 3.5 });
  const w = roomEdgeWalls(f, f.rooms[roomId])[0]!;
  const { floor: g, openingId } = addOpening(f, w.id, 'window', 2, { width: 1.2 });
  assert.throws(() => updateOpening(g, openingId, { width: 5 }), GeometryError);
  const h = updateOpening(g, openingId, { width: 2, t: 2 });
  close(h.openings[openingId].width, 2);
});
