import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createFloor, createProject, addRectRoom, addRoom, roomMetrics, roomEdgeWalls, setRoomEdgeInteriorLength, updateWall,
  setWallKind, wallLength, parseProject, migrateProject, addOpening,
} from '../src/index';
import { GeometryError } from '../../shared-types/src/index';
import { buildDrawing } from '../../cad-io/src/index';

const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
const room4x35 = () => addRectRoom(createFloor('F'), { x: 0, y: 0, width: 4, length: 3.5, height: 2.6, name: 'Room' });

test('interior lengths are the centerline minus half of each neighbouring wall', () => {
  const { floor, roomId } = room4x35();
  const m = roomMetrics(floor, floor.rooms[roomId]);
  assert.deepEqual(m.edgeLengths.map((x) => +x.toFixed(3)), [4, 3.5, 4, 3.5]);
  assert.deepEqual(m.netEdgeLengths.map((x) => +x.toFixed(3)), [3.85, 3.35, 3.85, 3.35]);
  close(m.netArea, 3.85 * 3.35);
});

test('editing an interior length moves only the far wall and is exact', () => {
  const { floor, roomId } = room4x35();
  const g = setRoomEdgeInteriorLength(floor, roomId, 0, 4);          // interior 3.85 -> 4.00
  const m = roomMetrics(g, g.rooms[roomId]);
  close(m.netEdgeLengths[0], 4);
  close(m.edgeLengths[0], 4.15);                                     // centerline grew by the two half-thicknesses
  close(m.netEdgeLengths[1], 3.35);                                  // the other direction is untouched
  close(m.netArea, 4 * 3.35);
  // the anchored corner stayed put
  const v0 = g.vertices[g.rooms[roomId].vertexIds[0]];
  close(v0.x, 0); close(v0.y, 0);
  // and the opposite edge follows (it is the same room)
  close(m.netEdgeLengths[2], 4);
});

test('interior editing accounts for different wall thicknesses', () => {
  const { floor, roomId } = room4x35();
  const walls = roomEdgeWalls(floor, floor.rooms[roomId]);
  const f = updateWall(updateWall(floor, walls[1]!.id, { thickness: 0.3 }), walls[3]!.id, { thickness: 0.1 });
  const before = roomMetrics(f, f.rooms[roomId]);
  close(before.netEdgeLengths[0], 4 - 0.15 - 0.05);
  const g = setRoomEdgeInteriorLength(f, roomId, 0, 3.6);
  const m = roomMetrics(g, g.rooms[roomId]);
  close(m.netEdgeLengths[0], 3.6);
  close(m.edgeLengths[0], 3.6 + 0.15 + 0.05);
});

test('interior editing works on angled rooms and with railings', () => {
  const { floor, roomId } = addRoom(createFloor('F'), [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 3 }, { x: 0, y: 4 }]);
  const g = setRoomEdgeInteriorLength(floor, roomId, 0, 4.5);
  close(roomMetrics(g, g.rooms[roomId]).netEdgeLengths[0], 4.5, 1e-4);
  const rail = setWallKind(floor, roomEdgeWalls(floor, floor.rooms[roomId])[2]!.id, 'railing');
  const h = setRoomEdgeInteriorLength(rail, roomId, 0, 4.2);
  close(roomMetrics(h, h.rooms[roomId]).netEdgeLengths[0], 4.2, 1e-4);
});

test('interior editing refuses impossible values and keeps the model valid', () => {
  const { floor, roomId } = room4x35();
  assert.throws(() => setRoomEdgeInteriorLength(floor, roomId, 0, 0.01), (e: GeometryError) => e.code === 'length');
  assert.throws(() => setRoomEdgeInteriorLength(floor, roomId, 9, 3), (e: GeometryError) => e.code === 'edge');
  // a door that no longer fits blocks the change, leaving the room untouched
  const w = roomEdgeWalls(floor, floor.rooms[roomId])[0]!;
  const withDoor = addOpening(floor, w.id, 'door', 2, { width: 1.6 }).floor;
  assert.throws(() => setRoomEdgeInteriorLength(withDoor, roomId, 0, 1), GeometryError);
  close(roomMetrics(withDoor, withDoor.rooms[roomId]).netEdgeLengths[0], 3.85);
});

test('interior mode dimensions the inside faces and labels the net area', () => {
  const { floor } = room4x35();
  const texts = (mode: 'centerline' | 'interior') => buildDrawing(floor, { unit: 'm', precision: 2, measure: mode })
    .filter((p) => p.t === 'dim' || p.t === 'text').map((p) => (p as { text: string }).text);
  const centre = texts('centerline'), inner = texts('interior');
  assert.ok(centre.includes('4.00 m') && centre.includes('14.00 m²'));
  assert.ok(inner.includes('3.85 m') && inner.includes('3.35 m'));
  assert.ok(!inner.includes('4.00 m'));
  assert.ok(inner.includes('12.90 m²'));   // net area label
});

test('projects saved before this feature default to centerline', () => {
  const { floor } = room4x35();
  const p = { ...createProject('P'), floors: [floor] };
  const raw = JSON.parse(JSON.stringify(p));
  delete raw.settings.measure;
  assert.equal(parseProject(migrateProject(raw)).settings.measure, 'centerline');
  assert.equal(parseProject(raw).settings.measure, 'centerline');
});
