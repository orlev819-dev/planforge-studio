/** The furniture & interior library: catalogue integrity, real geometry, plan symbols. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, CATEGORIES, catalogById, FINISHES } from '../../shared-types/src/catalog';
import { furnitureParts } from '../../renderer-3d/src/furniture';
import { planSymbol } from '../../cad-io/src/symbols';
import { buildFloorMesh, tint } from '../../renderer-3d/src/mesh';
import { buildDrawing } from '../../cad-io/src/index';
import { createFloor, addRectRoom, addFurniture } from '../src/index';

test('every catalogue entry is complete, unique and sized like the real thing', () => {
  const ids = new Set<string>();
  const cats = new Set(CATEGORIES.map((c) => c.id));
  for (const c of CATALOG) {
    assert.ok(!ids.has(c.id), `duplicate id ${c.id}`);
    ids.add(c.id);
    assert.ok(cats.has(c.category), `${c.id}: unknown category ${c.category}`);
    assert.ok(c.name.en.trim() && c.name.he.trim(), `${c.id}: needs both names`);
    assert.ok(/^#[0-9a-f]{6}$/i.test(c.color), `${c.id}: bad colour`);
    for (const v of [c.width, c.depth, c.height]) assert.ok(v >= 0.01 && v <= 6, `${c.id}: unrealistic size`);
    assert.ok((c.elevation ?? 0) >= 0 && (c.elevation ?? 0) < 3, `${c.id}: bad elevation`);
    for (const f of c.finishes ?? []) assert.ok(/^#[0-9a-f]{6}$/i.test(f), `${c.id}: bad finish`);
  }
  assert.ok(CATALOG.length >= 100, `catalogue is ${CATALOG.length} items`);
  // the categories the brief asks for are all populated
  for (const id of ['living', 'kitchen', 'dining', 'bedroom', 'kids', 'bathroom', 'toilet', 'appliances', 'curtains', 'lighting', 'storage', 'balcony', 'decor', 'electrical'])
    assert.ok(CATALOG.some((c) => c.category === id), `nothing in ${id}`);
  assert.ok(Object.values(FINISHES).every((set) => set.length >= 3));
});

test('every item builds real geometry — parts, not one box', () => {
  const simple = new Set(['box', 'flat', 'cylinder', 'column', 'counter', 'rug', 'picture', 'towel', 'ac', 'vase', 'shower-screen']);
  for (const c of CATALOG) {
    const parts = furnitureParts(c.shape, c.width, c.depth, c.height);
    assert.ok(parts.length >= 1, `${c.id}: no geometry`);
    if (!simple.has(c.shape)) assert.ok(parts.length >= 3, `${c.id} (${c.shape}): only ${parts.length} part(s)`);
    for (const p of parts) {
      const [x0, y0, x1, y1] = p.r;
      assert.ok(x1 > x0 && y1 > y0, `${c.id}: inverted part`);
      assert.ok(p.z[1] > p.z[0] - 1e-9, `${c.id}: inverted height`);
      assert.ok(Math.abs(x0) <= c.width * 1.6 && Math.abs(y0) <= c.depth * 1.6 + 0.3, `${c.id}: part outside the object`);
      assert.ok(p.z[1] <= c.height * 1.6 + 0.8, `${c.id}: part above the object`);
    }
    // the parts fill the object's footprint, so nothing is a floating detail
    const w = Math.max(...parts.map((p) => p.r[2])) - Math.min(...parts.map((p) => p.r[0]));
    assert.ok(w > c.width * 0.5, `${c.id}: geometry much narrower than the object`);
  }
});

test('every item has a plan symbol that stays inside its outline', () => {
  let drawn = 0;
  for (const c of CATALOG) {
    const sym = planSymbol(c.shape, c.width, c.depth);
    if (sym.length) drawn++;
    for (const l of sym) {
      assert.ok(l.pts.length >= 2, `${c.id}: empty symbol line`);
      for (const p of l.pts) {
        assert.ok(Math.abs(p.x) <= c.width / 2 + 1e-6, `${c.id}: symbol wider than the object`);
        assert.ok(Math.abs(p.y) <= c.depth / 2 + 1e-6, `${c.id}: symbol deeper than the object`);
      }
    }
  }
  assert.ok(drawn / CATALOG.length > 0.8, `only ${drawn} of ${CATALOG.length} items have a symbol`);
});

test('tint shades a finish without leaving the colour', () => {
  assert.equal(tint('#808080', 1), '#808080');
  assert.ok(tint('#808080', 0.8) < '#808080');
  assert.equal(tint('#000000', 0.5), '#000000');
  assert.equal(tint('#ffffff', 1.5), '#ffffff');
});

test('a furnished room renders in 2D and 3D from the same objects', () => {
  let f = addRectRoom(createFloor('F'), { x: 0, y: 0, width: 5, length: 4 }).floor;
  const place = (catalogId: string, x: number, y: number) => {
    const c = catalogById(catalogId)!;
    const r = addFurniture(f, {
      catalogId: c.id, name: c.name.en, category: c.category, x, y, rotation: 0,
      width: c.width, depth: c.depth, height: c.height, elevation: c.elevation ?? 0,
      mirrored: false, layer: 'furniture', color: c.color, meta: { shape: c.shape },
    });
    f = r.floor; return r.id;
  };
  const sofa = place('sofa-l', 1.5, 1.2);
  place('coffee-table', 2.5, 2.2);
  place('tv-unit', 2.5, 3.6);
  place('fridge', 4.5, 0.5);
  place('curtain-black', 0.9, 3.8);
  place('curtain-sheer', 2.6, 3.85);
  place('pendant', 2.5, 2.0);

  const mesh = buildFloorMesh(f);
  for (const id of Object.keys(f.furniture)) assert.ok(mesh.some((p) => p.id === id), 'every object is in the 3D scene');
  assert.ok(mesh.filter((p) => p.id === sofa).length >= 2, 'the L sofa is built from several materials');
  assert.ok(mesh.some((p) => p.kind === 'light'), 'the pendant has a lit part');
  assert.ok(mesh.some((p) => p.kind === 'glass'), 'the sheer parts are transparent');

  const prims = buildDrawing(f, { unit: 'm', precision: 2 });
  for (const id of Object.keys(f.furniture)) assert.ok(prims.some((p) => p.id === id && p.layer === 'furniture'), 'every object is on the plan');
  assert.ok(prims.filter((p) => p.id === sofa).length >= 3, 'the sofa draws its outline and its symbol');
});
