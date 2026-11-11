import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createFloor, addRectRoom, roomEdgeWalls, roomMetrics, setWallLength, setWallLocked, setRoomEdgeInteriorLength,
  wallLength, moveVertex, moveVertices, updateWall, parseProject, createProject, migrateProject,
} from '../src/index';
import { GeometryError } from '../../shared-types/src/index';
import type { Floor, ID } from '../../shared-types/src/index';

const close = (a: number, b: number, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
/** 4.00 x 3.50 room: edge 0 bottom, 1 right, 2 top (opposite 0), 3 left */
function room() {
  const { floor, roomId } = addRectRoom(createFloor('F'), { x: 0, y: 0, width: 4, length: 3.5, name: 'R' });
  return { floor, roomId };
}
const edge = (f: Floor, roomId: ID, i: number) => roomEdgeWalls(f, f.rooms[roomId])[i]!;
const len = (f: Floor, roomId: ID, i: number) => wallLength(f, edge(f, roomId, i));

test('without a lock, measuring one wall still squares the room up (the old behaviour)', () => {
  const { floor, roomId } = room();
  const f = setWallLength(floor, edge(floor, roomId, 0).id, 4.18);
  close(len(f, roomId, 0), 4.18);
  close(len(f, roomId, 2), 4.18); // the opposite wall followed
});

test('a measured wall keeps its length when the opposite wall is measured too', () => {
  const { floor, roomId } = room();
  let f = setWallLength(floor, edge(floor, roomId, 0).id, 4.18, 'a', { lock: true });
  assert.equal(edge(f, roomId, 0).locked, true);
  f = setWallLength(f, edge(f, roomId, 2).id, 4.05, 'a', { lock: true });
  close(len(f, roomId, 0), 4.18); // held
  close(len(f, roomId, 2), 4.05); // measured
  close(len(f, roomId, 1), 3.5, 0.01); // an unmeasured side takes up the difference by tilting
  // the room is a trapezoid now, and still a valid room
  assert.ok(roomMetrics(f, f.rooms[roomId]).grossArea > 13);
});

test('each of the four walls keeps its own measurement', () => {
  const { floor, roomId } = room();
  let f: Floor = floor;
  const want = [4.18, 3.46, 4.05, 3.52];
  for (let i = 0; i < 4; i++) f = setWallLength(f, edge(f, roomId, i).id, want[i], 'a', { lock: true });
  for (let i = 0; i < 4; i++) close(len(f, roomId, i), want[i], 0.02);
  assert.equal(Object.values(f.walls).filter((w) => w.locked).length, 4);
});

test('a locked wall refuses to be edited until it is released', () => {
  const { floor, roomId } = room();
  const id = edge(floor, roomId, 0).id;
  const f = setWallLength(floor, id, 4.18, 'a', { lock: true });
  assert.throws(() => setWallLength(f, id, 3.9), (e: GeometryError) => e.code === 'locked');
  assert.throws(() => setRoomEdgeInteriorLength(f, roomId, 0, 3.9), (e: GeometryError) => e.code === 'locked');
  const released = setWallLocked(f, id, false);
  close(wallLength(setWallLength(released, id, 3.9), released.walls[id]), 3.9);
});

test('no other edit may stretch a locked wall either', () => {
  const { floor, roomId } = room();
  const w = edge(floor, roomId, 0);
  const f = setWallLocked(floor, w.id, true);
  assert.throws(() => moveVertex(f, w.b, { x: 5, y: 0 }), (e: GeometryError) => e.code === 'locked');
  // sliding the whole wall (both corners at once) keeps its length, so it is allowed
  const slid = moveVertices(f, { [w.a]: { x: 0, y: -0.2 }, [w.b]: { x: 0, y: -0.2 } });
  close(wallLength(slid, slid.walls[w.id]), 4);
});

test('a corner held by a measured wall is triangulated, so both lengths come out exact', () => {
  const { floor, roomId } = room();
  let f = setWallLocked(floor, edge(floor, roomId, 1).id, true); // right side measured at 3.50
  f = setWallLocked(f, edge(f, roomId, 2).id, true);             // top measured at 4.00
  f = setWallLength(f, edge(f, roomId, 0).id, 4.4, 'a', { lock: true });
  close(len(f, roomId, 0), 4.4);  // the new measurement
  close(len(f, roomId, 1), 3.5);  // ... and both earlier ones still hold
  close(len(f, roomId, 2), 4);
});

test('measurements that cannot physically meet are refused, and nothing moves', () => {
  const { floor, roomId } = room();
  let f = setWallLocked(floor, edge(floor, roomId, 0).id, true); // bottom 4.00
  f = setWallLocked(f, edge(f, roomId, 3).id, true);             // left 3.50
  // the top wall would have to be 10 m while its far corner stays 3.50 m from the locked left wall
  assert.throws(() => setWallLength(f, edge(f, roomId, 2).id, 10), (e: GeometryError) => e.code === 'locked');
  close(len(f, roomId, 2), 4);
  close(len(f, roomId, 0), 4);
});

test('interior measurements lock the same way and survive a save/load', () => {
  const { floor, roomId } = room();
  let f = setRoomEdgeInteriorLength(floor, roomId, 0, 3.72, 'a', { lock: true });
  close(roomMetrics(f, f.rooms[roomId]).netEdgeLengths[0], 3.72);
  assert.equal(edge(f, roomId, 0).locked, true);
  f = setRoomEdgeInteriorLength(f, roomId, 2, 3.6, 'a', { lock: true });
  close(roomMetrics(f, f.rooms[roomId]).netEdgeLengths[0], 3.72, 0.02); // the first measurement held
  close(roomMetrics(f, f.rooms[roomId]).netEdgeLengths[2], 3.6, 0.02);

  const p = createProject('P');
  const saved = JSON.parse(JSON.stringify({ ...p, floors: [f] }));
  const back = parseProject(saved);
  assert.equal(Object.values(back.floors[0].walls).filter((w) => w.locked).length, 2);
  // a project saved before locks existed loads with every wall free
  const old = JSON.parse(JSON.stringify({ ...p, floors: [f] }));
  for (const w of Object.values(old.floors[0].walls) as { locked?: boolean }[]) delete w.locked;
  assert.equal(Object.values(migrateProject(old).floors[0].walls).filter((w) => w.locked).length, 0);
});

test('a lock does not block anything else about the wall', () => {
  const { floor, roomId } = room();
  const id = edge(floor, roomId, 0).id;
  const f = setWallLocked(floor, id, true);
  const thicker = updateWall(f, id, { thickness: 0.2 });
  assert.equal(thicker.walls[id].thickness, 0.2);
  assert.equal(thicker.walls[id].locked, true);
  close(wallLength(thicker, thicker.walls[id]), 4);
});

test('after one measurement, the next one grows into the free corner', () => {
  const { floor, roomId } = room();
  const v = (f: Floor, i: number) => f.vertices[f.rooms[roomId].vertexIds[i]];
  // the right-hand wall is measured first, so the corner it holds must not move
  let f = setWallLength(floor, edge(floor, roomId, 1).id, 3.42, 'a', { lock: true });
  const rightTop = { ...v(f, 2) }, rightBottom = { ...v(f, 1) }, leftBottom = { ...v(f, 0) };
  // now measure the bottom wall, which meets that locked wall at its second corner
  f = setWallLength(f, edge(f, roomId, 0).id, 4.37, 'auto', { lock: true });
  close(len(f, roomId, 0), 4.37);
  close(len(f, roomId, 1), 3.42);               // the measurement taken first still holds
  close(v(f, 1).x, rightBottom.x); close(v(f, 1).y, rightBottom.y);  // the held corner did not move
  close(v(f, 2).x, rightTop.x); close(v(f, 2).y, rightTop.y);
  assert.ok(Math.abs(v(f, 0).x - leftBottom.x) > 0.3);               // the free corner took the change
});

test('with nothing measured yet, the first corner of the edge stays as before', () => {
  const { floor, roomId } = room();
  const v = (f: Floor, i: number) => f.vertices[f.rooms[roomId].vertexIds[i]];
  const first = { ...v(floor, 0) };
  const f = setWallLength(floor, edge(floor, roomId, 0).id, 4.4, 'auto');
  close(v(f, 0).x, first.x); close(v(f, 0).y, first.y);
  close(len(f, roomId, 0), 4.4);
});
