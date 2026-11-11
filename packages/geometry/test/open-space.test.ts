import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createFloor, addRectRoom, addRoom, roomMetrics, updateWall, deleteWall, deleteEntity, addOpening, wallLength, parseProject, createProject,
} from '../src/index';
import { GeometryError } from '../../shared-types/src/index';
import { buildDrawing } from '../../cad-io/src/index';
import { buildFloorMesh } from '../../renderer-3d/src/mesh';
import type { Floor } from '../../shared-types/src/index';

const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

/** two rooms side by side sharing one wall: 4.00 x 3.50 and 3.00 x 3.50 */
function twoRooms() {
  const a = addRectRoom(createFloor('F'), { x: 0, y: 0, width: 4, length: 3.5, name: 'Living' });
  const b = addRoom(a.floor, [{ x: 4, y: 0 }, { x: 7, y: 0 }, { x: 7, y: 3.5 }, { x: 4, y: 3.5 }], { name: 'Kitchen' });
  const shared = Object.values(b.floor.walls).find((w) => !w.exterior)!;
  return { floor: b.floor, living: a.roomId, kitchen: b.roomId, shared };
}

test('deleting the wall between two rooms opens the passage and keeps both rooms', () => {
  const { floor, living, kitchen, shared } = twoRooms();
  const f = deleteWall(floor, shared.id);
  assert.equal(Object.keys(f.rooms).length, 2);                 // not merged
  assert.equal(f.rooms[living].name, 'Living');
  assert.equal(f.rooms[kitchen].name, 'Kitchen');
  assert.equal(f.walls[shared.id].kind, 'open');                // the edge is still there, with no wall
  close(roomMetrics(f, f.rooms[living]).grossArea, 14);
  close(roomMetrics(f, f.rooms[kitchen]).grossArea, 10.5);
});

test('an open edge is not a wall surface, and the inside face runs right through it', () => {
  const { floor, living, shared } = twoRooms();
  const before = roomMetrics(floor, floor.rooms[living]);
  const f = deleteWall(floor, shared.id);
  const after = roomMetrics(f, f.rooms[living]);
  close(after.openLength, wallLength(f, f.walls[shared.id]) - 0.15); // the clear width of the passage
  assert.ok(after.netArea > before.netArea);                          // no wall to inset for
  assert.ok(after.wallArea < before.wallArea);                        // and nothing to paint there
  close(after.wallArea, (after.netPerimeter - after.openLength) * after.height - after.openingArea);
});

test('nothing is built for an open edge in 2D or 3D', () => {
  const { floor, shared } = twoRooms();
  const f = updateWall(floor, shared.id, { kind: 'open' });
  const solid = buildDrawing(floor, { unit: 'm', precision: 2 }).filter((p) => p.id === shared.id);
  const open = buildDrawing(f, { unit: 'm', precision: 2 }).filter((p) => p.id === shared.id && p.layer === 'walls');
  assert.ok(solid.some((p) => p.t === 'poly' && p.closed && p.fill));   // a filled wall body before
  assert.equal(open.length, 1);                                         // one dashed line after, no body
  assert.equal(open[0].t === 'poly' && open[0].dash, true);
  assert.equal(open[0].t === 'poly' && open[0].closed, false);
  // the passage is still dimensioned, so the plan says how wide it is
  assert.ok(buildDrawing(f, { unit: 'm', precision: 2 }).some((p) => p.id === shared.id && p.t === 'dim'));
  assert.equal(buildFloorMesh(floor).filter((p) => p.id === shared.id).length > 0, true);
  assert.equal(buildFloorMesh(f).filter((p) => p.id === shared.id).length, 0);
});

test('an open passage holds no door or window, and doors must go before it opens', () => {
  const { floor, shared } = twoRooms();
  const withDoor = addOpening(floor, shared.id, 'door', 1.5, { width: 0.9 }).floor;
  assert.throws(() => updateWall(withDoor, shared.id, { kind: 'open' }), (e: GeometryError) => e.code === 'open-opening');
  const f = updateWall(floor, shared.id, { kind: 'open' });
  assert.throws(() => addOpening(f, shared.id, 'door', 1.5, { width: 0.9 }), (e: GeometryError) => e.code === 'open-opening');
});

test('the passage can be closed again, and a second delete says it is already open', () => {
  const { floor, shared } = twoRooms();
  const open = deleteWall(floor, shared.id);
  assert.throws(() => deleteWall(open, shared.id), (e: GeometryError) => e.code === 'already-open');
  const closed = updateWall(open, shared.id, { kind: 'solid' });
  assert.equal(closed.walls[shared.id].kind, 'solid');
  close(roomMetrics(closed, closed.rooms[Object.keys(closed.rooms)[0]]).openLength, 0);
  assert.ok(closed.walls[shared.id].thickness > 0);
});

test('a drawn partition is still deleted outright, and the state survives a save', () => {
  const { floor, shared } = twoRooms();
  const f: Floor = deleteWall(floor, shared.id);
  assert.equal(deleteEntity(f, Object.values(f.rooms)[0].id).rooms[Object.values(f.rooms)[0].id], undefined);
  const p = createProject('P');
  const back = parseProject(JSON.parse(JSON.stringify({ ...p, floors: [f] })));
  assert.equal(back.floors[0].walls[shared.id].kind, 'open');
});
