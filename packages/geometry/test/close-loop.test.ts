import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createFloor, addRectRoom, addPartitionWall, closeWallLoop, wallLoopAt, wallLoops, roomMetrics, roomEdgeWalls, wallHeight, DEFAULT_RAILING_HEIGHT,
} from '../src/index';
import type { Floor, Vec2 } from '../../shared-types/src/index';

const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

/** draw a chain of walls the way the canvas does, returning the floor and the last wall's id */
function chain(f: Floor, pts: Vec2[], opts: Parameters<typeof addPartitionWall>[4] = {}) {
  let floor = f, wallId = '';
  for (let i = 0; i < pts.length - 1; i++) {
    const r = addPartitionWall(floor, pts[i], pts[i + 1], undefined, opts);
    floor = r.floor; wallId = r.wallId;
  }
  return { floor, wallId };
}

const RECT: Vec2[] = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3.5 }, { x: 0, y: 3.5 }];

test('an open chain of walls closes no loop', () => {
  const { floor, wallId } = chain(createFloor('F'), RECT); // 3 of the 4 sides
  assert.equal(wallLoopAt(floor, wallId), null);
  assert.equal(closeWallLoop(floor, wallId), null);
  assert.equal(Object.keys(floor.rooms).length, 0);
});

test('the wall that closes the ring turns the enclosed area into a room', () => {
  const { floor, wallId } = chain(createFloor('F'), [...RECT, RECT[0]]);
  assert.equal(wallLoopAt(floor, wallId)?.length, 4);
  const closed = closeWallLoop(floor, wallId, { name: 'Living' });
  assert.ok(closed);
  const room = closed.floor.rooms[closed.roomId];
  assert.equal(room.name, 'Living');
  close(roomMetrics(closed.floor, room).grossArea, 14);
  // the drawn walls became this room's walls instead of being duplicated
  assert.equal(Object.keys(closed.floor.walls).length, 4);
  assert.equal(Object.values(closed.floor.walls).filter((w) => w.standalone).length, 0);
  assert.equal(roomEdgeWalls(closed.floor, room).filter(Boolean).length, 4);
});

test('a closed ring of railings becomes a balcony whose edges stay railings', () => {
  const { floor, wallId } = chain(createFloor('F'), [...RECT, RECT[0]], { kind: 'railing' });
  const closed = closeWallLoop(floor, wallId, { name: 'Balcony' });
  assert.ok(closed);
  const edges = roomEdgeWalls(closed.floor, closed.floor.rooms[closed.roomId]);
  assert.equal(edges.filter((w) => w?.kind === 'railing').length, 4);
  close(wallHeight(closed.floor, edges[0]!), DEFAULT_RAILING_HEIGHT);
});

test('walls closed against an existing room make a connected room sharing its wall', () => {
  const base = addRectRoom(createFloor('F'), { x: 0, y: 0, width: 4, length: 3.5, name: 'A' }).floor;
  const { floor, wallId } = chain(base, [{ x: 4, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 3.5 }, { x: 4, y: 3.5 }]);
  const closed = closeWallLoop(floor, wallId, { name: 'B' });
  assert.ok(closed);
  const b = closed.floor.rooms[closed.roomId];
  assert.equal(b.vertexIds.length, 4);
  close(roomMetrics(closed.floor, b).grossArea, 7);
  // 7 walls, not 8: the shared edge belongs to both rooms and is no longer exterior
  assert.equal(Object.keys(closed.floor.walls).length, 7);
  const shared = roomEdgeWalls(closed.floor, b).find((w) => w && !w.exterior);
  assert.ok(shared);
  assert.ok(roomEdgeWalls(closed.floor, closed.floor.rooms[Object.keys(closed.floor.rooms).find((id) => id !== b.id)!]).some((w) => w?.id === shared.id));
});

test('a dangling wall closes nothing, and the ring beside it is still found', () => {
  const ring = chain(createFloor('F'), [...RECT, RECT[0]]);
  const tail = addPartitionWall(ring.floor, { x: 0, y: 0 }, { x: -2, y: 0 });
  assert.equal(wallLoopAt(tail.floor, tail.wallId), null);
  assert.equal(wallLoopAt(tail.floor, ring.wallId)?.length, 4); // the rectangle, not the outer walk
  close(roomMetrics(closeWallLoop(tail.floor, ring.wallId)!.floor, Object.values(closeWallLoop(tail.floor, ring.wallId)!.floor.rooms)[0]).grossArea, 14);
});

test('a ring drawn inside an existing room makes no room', () => {
  const base = addRectRoom(createFloor('F'), { x: 0, y: 0, width: 4, length: 3.5 }).floor;
  const { floor, wallId } = chain(base, [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 2 }, { x: 1, y: 1 }]);
  assert.ok(wallLoops(floor, wallId).length); // the walls do close a ring
  assert.equal(closeWallLoop(floor, wallId), null); // ... but it would overlap the room
  assert.equal(Object.keys(floor.rooms).length, 1);
});

test('a self-crossing ring makes no room', () => {
  const { floor, wallId } = chain(createFloor('F'), [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }, { x: 4, y: 3 }, { x: 0, y: 0 }]);
  assert.equal(closeWallLoop(floor, wallId), null);
  assert.equal(Object.keys(floor.rooms).length, 0);
});

test('a partition across a room does not silently become a room', () => {
  const base = addRectRoom(createFloor('F'), { x: 0, y: 0, width: 4, length: 3.5 }).floor;
  const { floor, wallId } = chain(base, [{ x: 2, y: 0 }, { x: 2, y: 3.5 }]);
  assert.equal(closeWallLoop(floor, wallId), null);
  assert.equal(Object.keys(floor.rooms).length, 1);
});
