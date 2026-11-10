import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createFloor, createProject, addRectRoom, addPartitionWall, addOpening, updateWall, setWallKind, roomMetrics, roomEdgeWalls,
  wallHeight, wallMetrics, parseProject, migrateProject, DEFAULT_RAILING_HEIGHT, setWallLength,
} from '../src/index';
import { GeometryError } from '../../shared-types/src/index';
import { buildDrawing, toDXF, parseDXF, toSVG } from '../../cad-io/src/index';
import { buildFloorMesh } from '../../renderer-3d/src/mesh';

const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
/** balcony: 4 x 2 m room whose south edge is a railing */
function balcony() {
  const { floor, roomId } = addRectRoom(createFloor('F'), { x: 0, y: 0, width: 4, length: 2, height: 2.6, name: 'Balcony' });
  const south = roomEdgeWalls(floor, floor.rooms[roomId])[2]!;
  return { floor: setWallKind(floor, south.id, 'railing'), roomId, railId: south.id };
}

test('standalone railing: low, thin, own defaults', () => {
  const { floor, wallId } = addPartitionWall(createFloor('F'), { x: 0, y: 0 }, { x: 3, y: 0 }, 0.1, { kind: 'railing' });
  const w = floor.walls[wallId];
  assert.equal(w.kind, 'railing');
  assert.equal(w.railingStyle, 'bars');
  close(wallHeight(floor, w), DEFAULT_RAILING_HEIGHT);
  assert.ok(w.thickness <= 0.08);
  close(wallMetrics(floor, wallId).length, 3);
});

test('converting a room wall to a railing keeps the room but opens that side', () => {
  const { floor, roomId, railId } = balcony();
  const m = roomMetrics(floor, floor.rooms[roomId]);
  close(m.grossArea, 8);                                  // area unchanged
  close(m.railingLength, 4 - 0.15);                       // net length of that edge
  const base = addRectRoom(createFloor('F'), { x: 0, y: 0, width: 4, length: 2, height: 2.6 });
  const solid = roomMetrics(base.floor, base.floor.rooms[base.roomId]);
  close(m.wallArea, (m.netPerimeter - m.railingLength) * 2.6);  // railing side is not paintable wall
  assert.ok(m.wallArea < solid.wallArea - 9.9 && m.wallArea > solid.wallArea - 10.1);
  close(wallHeight(floor, floor.walls[railId]), DEFAULT_RAILING_HEIGHT);
  // converting back restores a full-height wall
  const back = setWallKind(floor, railId, 'solid');
  close(wallHeight(back, back.walls[railId]), 2.6);
  close(roomMetrics(back, back.rooms[roomId]).wallArea, solid.wallArea);
});

test('railings reject doors and windows, in both directions', () => {
  const { floor, railId } = balcony();
  assert.throws(() => addOpening(floor, railId, 'door', 2), (e: GeometryError) => e.code === 'railing-opening');
  const withDoor = addOpening(setWallKind(floor, railId, 'solid'), railId, 'door', 2).floor;
  assert.throws(() => setWallKind(withDoor, railId, 'railing'), (e: GeometryError) => e.code === 'railing-opening');
});

test('railing height is validated and editable', () => {
  const { floor, railId } = balcony();
  assert.throws(() => updateWall(floor, railId, { height: 0.1 }), (e: GeometryError) => e.code === 'railing-height');
  assert.throws(() => updateWall(floor, railId, { height: 3 }), (e: GeometryError) => e.code === 'railing-height');
  close(wallHeight(updateWall(floor, railId, { height: 1.1 }), floor.walls[railId]), DEFAULT_RAILING_HEIGHT); // input untouched
  const g = updateWall(floor, railId, { height: 1.1 });
  close(wallHeight(g, g.walls[railId]), 1.1);
  // editing geometry keeps the railing kind
  const h = setWallLength(g, railId, 5);
  assert.equal(Object.values(h.walls).filter((w) => w.kind === 'railing').length, 1);
});

test('2D: railing drawn as open rails with balusters, not a solid wall body', () => {
  const { floor, railId } = balcony();
  const prims = buildDrawing(floor, { unit: 'm', precision: 2 });
  const mine = prims.filter((p) => p.id === railId);
  assert.ok(mine.length > 10, 'rails + balusters + posts');
  assert.equal(mine.filter((p) => p.t === 'poly' && p.closed && p.fill === '#2b2d31').length, 0, 'no solid wall fill');
  // glass and panel styles draw differently
  const glass = buildDrawing(updateWall(floor, railId, { railingStyle: 'glass' }), { unit: 'm', precision: 2 }).filter((p) => p.id === railId);
  const panel = buildDrawing(updateWall(floor, railId, { railingStyle: 'panel' }), { unit: 'm', precision: 2 }).filter((p) => p.id === railId);
  assert.notEqual(glass.length, mine.length);
  assert.ok(panel.some((p) => p.t === 'poly' && p.closed));
  assert.ok(parseDXF(toDXF(prims)).length > 0);
  assert.ok(toSVG(prims).includes('#1864ab'));
});

test('3D: railing is open posts/rail at railing height, not a full wall', () => {
  const { floor, railId } = balcony();
  const parts = buildFloorMesh(floor);
  const rail = parts.filter((p) => p.id === railId);
  assert.ok(rail.length >= 2);
  assert.ok(rail.every((p) => p.kind === 'railing'));
  const ys = rail.flatMap((p) => p.positions.filter((_, i) => i % 3 === 1));
  close(Math.max(...ys), DEFAULT_RAILING_HEIGHT, 1e-5);
  const solidWalls = parts.filter((p) => p.kind === 'wall');
  assert.equal(solidWalls.length, 3);
  // glass style adds a translucent panel
  const g = buildFloorMesh(updateWall(floor, railId, { railingStyle: 'glass' }));
  assert.ok(g.some((p) => p.kind === 'glass' && p.id === railId && p.color[3] < 1));
});

test('older projects without kind migrate to solid walls and still validate', () => {
  const { floor } = balcony();
  const p = { ...createProject('B'), floors: [floor] };
  const raw = JSON.parse(JSON.stringify(p));
  for (const w of Object.values<Record<string, unknown>>(raw.floors[0].walls)) { delete w.kind; delete w.railingStyle; }
  const back = parseProject(migrateProject(raw));
  assert.equal(Object.values(back.floors[0].walls).every((w) => w.kind === 'solid'), true);
  // zod default also fills it in when migrate is skipped
  const direct = parseProject(raw);
  assert.equal(Object.values(direct.floors[0].walls)[0].railingStyle, 'bars');
});
