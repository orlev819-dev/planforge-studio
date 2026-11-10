import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFloor, addRectRoom, addCeilingDrop, updateCeilingDrop, deleteEntity, roomMetrics, clipByConvex, polygonArea, migrateProject, reidFloor } from '../src/index';
import { GeometryError } from '../../shared-types/src/index';
import { buildDrawing, toDXF, parseDXF } from '../../cad-io/src/index';
import { buildFloorMesh } from '../../renderer-3d/src/mesh';

const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
const room = () => addRectRoom(createFloor('F'), { x: 0, y: 0, width: 4, length: 3.5, height: 2.75 });

test('convex clipping', () => {
  const sq = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];
  const zone = [{ x: 3, y: 1 }, { x: 6, y: 1 }, { x: 6, y: 2 }, { x: 3, y: 2 }];
  close(polygonArea(clipByConvex(sq, zone)), 1);
  assert.equal(clipByConvex(sq, [{ x: 10, y: 10 }, { x: 11, y: 10 }, { x: 11, y: 11 }]).length, 0);
});

test('lowered ceiling reduces room volume, reports area and soffit faces', () => {
  const { floor, roomId } = room();
  const before = roomMetrics(floor, floor.rooms[roomId]);
  // 1.0 x 1.2 m zone fully inside the room, 35 cm lower (2.40 under 2.75)
  const { floor: g, id } = addCeilingDrop(floor, { x: 2, y: 1.5, width: 1, depth: 1.2, height: 2.4 });
  const m = roomMetrics(g, g.rooms[roomId]);
  close(m.loweredArea, 1.2);
  close(m.volume, before.volume - 1.2 * 0.35);
  close(m.soffitSideArea, (2 * 1 + 2 * 1.2) * 0.35);
  close(m.netArea, before.netArea); // floor area unaffected
  // zone sticking out of the room counts only the inside part; edge along the wall is not an exposed face
  const h = updateCeilingDrop(g, id, { x: 0.075 + 0.5, y: 1.5, width: 1, depth: 1 }); // left edge flush with the wall face
  const m2 = roomMetrics(h, h.rooms[roomId]);
  close(m2.loweredArea, 1);
  close(m2.soffitSideArea, 3 * 0.35);
  assert.equal(Object.keys(deleteEntity(h, id).ceilingDrops).length, 0);
});

test('lowered ceiling validation', () => {
  const { floor } = room();
  assert.throws(() => addCeilingDrop(floor, { x: 2, y: 1.5, width: 1, depth: 1, height: 2.75 }), (e: GeometryError) => e.code === 'ceiling-height');
  assert.throws(() => addCeilingDrop(floor, { x: 2, y: 1.5, width: 1, depth: 1, height: 3.2 }), (e: GeometryError) => e.code === 'ceiling-height');
  assert.throws(() => addCeilingDrop(floor, { x: 2, y: 1.5, width: 0.01, depth: 1, height: 2.4 }), (e: GeometryError) => e.code === 'size');
});

test('lowered ceiling appears in 2D, DXF and 3D; survives re-id and old-project migration', () => {
  const { floor } = room();
  const { floor: g } = addCeilingDrop(floor, { x: 2, y: 1.5, width: 1, depth: 1.2, height: 2.4, name: 'Bulkhead' });
  const prims = buildDrawing(g, { unit: 'm', precision: 2 });
  assert.ok(prims.some((p) => p.t === 'text' && p.text === 'Bulkhead 2.40 m'));
  assert.ok(parseDXF(toDXF(prims)).some((e) => e.layer === 'CEILINGS'));
  const soffit = buildFloorMesh(g).find((p) => p.kind === 'soffit')!;
  const ys = soffit.positions.filter((_, i) => i % 3 === 1);
  close(Math.min(...ys), 2.4); close(Math.max(...ys), 2.75);
  assert.equal(Object.keys(reidFloor(g).ceilingDrops).length, 1);
  const old: any = { floors: [{ ...g, ceilingDrops: undefined }] };
  assert.deepEqual(migrateProject(old).floors[0].ceilingDrops, {});
});
