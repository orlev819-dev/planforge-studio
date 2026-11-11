import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createFloor, addRectRoom, roomEdgeWalls, addOpening, openingOffsets, setOpeningOffset, openingGeometry, updateWall, dist,
} from '../src/index';
import { GeometryError } from '../../shared-types/src/index';
import type { Floor, ID } from '../../shared-types/src/index';

const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

/** 4.00 x 3.50 room with the default 0.15 m walls, and an 0.80 m door centred on the bottom wall */
function withDoor() {
  const { floor: f0, roomId } = addRectRoom(createFloor('F'), { x: 0, y: 0, width: 4, length: 3.5 });
  const wall = roomEdgeWalls(f0, f0.rooms[roomId])[0]!;
  const { floor, openingId } = addOpening(f0, wall.id, 'door', 2, { width: 0.8 });
  return { floor, openingId, wallId: wall.id, roomId };
}
const off = (f: Floor, id: ID, m: 'centerline' | 'interior' = 'centerline') => openingOffsets(f, f.openings[id], m);

test('offsets are measured to the edges of the opening, not its centre', () => {
  const { floor, openingId } = withDoor();
  const o = off(floor, openingId);
  close(o.span, 4);
  close(o.start, 1.6);   // corner -> near side of the 0.80 door centred at 2.00
  close(o.end, 1.6);     // far side -> the other corner
  close(o.start + o.width + o.end, 4);
});

test('in interior mode they run from the inside faces, like a tape in the room', () => {
  const { floor, openingId } = withDoor();
  const o = off(floor, openingId, 'interior');
  close(o.span, 3.85);   // 4.00 less half of each 0.15 side wall
  close(o.start, 1.525);
  close(o.end, 1.525);
  close(o.start + o.width + o.end, o.span);
});

test('setting a measured distance moves the opening and keeps its width', () => {
  const { floor, openingId } = withDoor();
  const f = setOpeningOffset(floor, openingId, 'start', 0.9);
  const o = off(f, openingId);
  close(o.start, 0.9);
  close(o.width, 0.8);
  close(o.end, 4 - 0.9 - 0.8);
  // the same measurement taken from the other end
  const g = setOpeningOffset(floor, openingId, 'end', 0.6);
  close(off(g, openingId).end, 0.6);
  close(off(g, openingId).start, 4 - 0.6 - 0.8);
});

test('an interior measurement lands on the inside face it was taken from', () => {
  const { floor, openingId, roomId } = withDoor();
  const f = setOpeningOffset(floor, openingId, 'start', 1.2, { measure: 'interior' });
  close(off(f, openingId, 'interior').start, 1.2);
  close(off(f, openingId).start, 1.275);  // 7.5 cm more from the centerline corner
  // a thicker side wall moves the inside face, and the measurement follows it
  const side = roomEdgeWalls(f, f.rooms[roomId])[3]!;
  const thick = updateWall(f, side.id, { thickness: 0.3 });
  close(off(thick, openingId, 'interior').start, 1.125);
});

test('measuring both sides of a window sets its width from the measurements', () => {
  const { floor, openingId } = withDoor();
  let f = setOpeningOffset(floor, openingId, 'start', 1, { keepWidth: false });
  f = setOpeningOffset(f, openingId, 'end', 1.8, { keepWidth: false });
  const o = off(f, openingId);
  close(o.start, 1);
  close(o.end, 1.8);
  close(o.width, 4 - 1 - 1.8);
});

test('a distance that would push the opening off its wall is refused', () => {
  const { floor, openingId } = withDoor();
  assert.throws(() => setOpeningOffset(floor, openingId, 'start', 3.5), (e: GeometryError) => e.code === 'opening-fit');
  assert.throws(() => setOpeningOffset(floor, openingId, 'start', -1), (e: GeometryError) => e.code === 'offset');
  // and nothing moved
  close(off(floor, openingId).start, 1.6);
});

test('the offsets describe where the opening really is on the plan', () => {
  const { floor, openingId } = withDoor();
  const f = setOpeningOffset(floor, openingId, 'start', 0.75);
  const g = openingGeometry(f, f.openings[openingId]);
  close(dist(g.a, g.start), 0.75);        // the near jamb is 0.75 m from the corner
  close(dist(g.start, g.end), 0.8);
});
