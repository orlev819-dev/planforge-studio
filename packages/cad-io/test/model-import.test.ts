import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSTL, parseOBJ, buildModelAsset, guessUnit, decodeFloats, toGLB, readGLB, buildDrawing, parseModelFile } from '../src/index';
import { buildFloorMesh, buildProjectMesh } from '../../renderer-3d/src/mesh';
import { createFloor, createProject, addFurniture, parseProject } from '../../geometry/src/index';

const close = (a: number, b: number, tol = 1e-4) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

// a 600 x 400 x 750 mm box (Z-up, as typical from CAD), 12 triangles
function boxTris(w: number, d: number, h: number): number[] {
  const P = (x: number, y: number, z: number) => [x * w, y * d, z * h];
  const q = (a: number[], b: number[], c: number[], e: number[]) => [...a, ...b, ...c, ...a, ...c, ...e];
  return [
    ...q(P(0, 0, 0), P(1, 0, 0), P(1, 1, 0), P(0, 1, 0)), ...q(P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1)),
    ...q(P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1)), ...q(P(0, 1, 0), P(1, 1, 0), P(1, 1, 1), P(0, 1, 1)),
    ...q(P(0, 0, 0), P(0, 1, 0), P(0, 1, 1), P(0, 0, 1)), ...q(P(1, 0, 0), P(1, 1, 0), P(1, 1, 1), P(1, 0, 1)),
  ];
}
function binarySTL(t: number[]): ArrayBuffer {
  const n = t.length / 9, buf = new ArrayBuffer(84 + n * 50), dv = new DataView(buf);
  dv.setUint32(80, n, true);
  for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) dv.setFloat32(84 + i * 50 + 12 + k * 4, t[i * 9 + k], true);
  return buf;
}
function asciiSTL(t: number[]): string {
  let s = 'solid box\n';
  for (let i = 0; i < t.length; i += 9) s += `facet normal 0 0 0\n outer loop\n${[0, 3, 6].map((o) => `  vertex ${t[i + o]} ${t[i + o + 1]} ${t[i + o + 2]}`).join('\n')}\n endloop\nendfacet\n`;
  return s + 'endsolid box\n';
}

test('binary and ASCII STL parse to the same triangles', () => {
  const t = boxTris(600, 400, 750);
  const b = parseSTL(binarySTL(t)), a = parseSTL(new TextEncoder().encode(asciiSTL(t)).buffer as ArrayBuffer);
  assert.equal(b.length, 12 * 9); assert.deepEqual([...a], [...b]);
  assert.equal(guessUnit(b), 'mm');
});

test('OBJ: quads + negative indices + v/vt/vn faces are triangulated', () => {
  const obj = 'o chair\nv 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nvt 0 0\nvn 0 0 1\nf 1/1/1 2/1/1 3/1/1 4/1/1\nf -4 -3 -2\n';
  const t = parseOBJ(obj);
  assert.equal(t.length / 9, 3);
  assert.throws(() => parseOBJ('v 0 0 0\nf 1 2 3\n'));
  assert.throws(() => parseModelFile('x.fbx', new ArrayBuffer(4)));
});

test('asset normalisation: mm -> m, Z-up -> Y-up, centred, on floor, hull footprint', () => {
  const a = buildModelAsset('a1', 'Cabinet', 'stl', parseSTL(binarySTL(boxTris(600, 400, 750))), { unit: 'mm', up: 'z', color: '#888888' });
  close(a.size.x, 0.6); close(a.size.y, 0.75); close(a.size.z, 0.4);
  assert.equal(a.triangles, 12);
  const t = decodeFloats(a.data);
  const ys = [...t].filter((_, i) => i % 3 === 1), xs = [...t].filter((_, i) => i % 3 === 0);
  close(Math.min(...ys), 0); close(Math.max(...ys), 0.75); close(Math.min(...xs), -0.3); close(Math.max(...xs), 0.3);
  assert.equal(a.hull.length, 4);
});

test('placed model: 3D mesh scaled/rotated, 2D footprint, GLB export, project JSON roundtrip', () => {
  const asset = buildModelAsset('a1', 'Cabinet', 'stl', parseSTL(binarySTL(boxTris(600, 400, 750))), { unit: 'mm', up: 'z', color: '#888888' });
  const { floor, id } = addFurniture(createFloor('F'), { catalogId: 'custom', name: 'Cabinet', category: 'custom', x: 2, y: 1, rotation: 90, width: 1.2, depth: 0.4, height: 0.75, elevation: 0, mirrored: false, layer: 'furniture', color: '#888888', meta: { modelId: 'a1', shape: 'model' } });
  const part = buildFloorMesh(floor, { assets: { a1: asset } }).find((p) => p.id === id)!;
  assert.ok(part.twoSided);
  const xs = part.positions.filter((_, i) => i % 3 === 0), zs = part.positions.filter((_, i) => i % 3 === 2);
  // rotated 90°: width 1.2 runs along plan y, depth 0.4 along plan x
  close(Math.max(...xs) - Math.min(...xs), 0.4); close(Math.max(...zs) - Math.min(...zs), 1.2);
  const prims = buildDrawing(floor, { unit: 'm', precision: 2, assets: { a1: asset } });
  assert.ok(prims.some((p) => p.t === 'poly' && p.id === id && p.pts.length === 4 && !p.dash));
  const p = { ...createProject('M'), floors: [floor], assets: { a1: asset } };
  const { json } = readGLB(toGLB(buildProjectMesh(p)));
  assert.equal(json.accessors.length, 3);
  const back = parseProject(JSON.parse(JSON.stringify(p)));
  assert.equal(decodeFloats(back.assets.a1.data).length, 12 * 9);
});

test('unit guess picks plausible furniture size', () => {
  assert.equal(guessUnit(new Float32Array([0, 0, 0, 120, 0, 0, 0, 76, 0])), 'cm');
  assert.equal(guessUnit(new Float32Array([0, 0, 0, 750, 0, 0, 0, 400, 0])), 'mm');
  assert.equal(guessUnit(new Float32Array([0, 0, 0, 1.8, 0, 0, 0, 0.9, 0])), 'm');
});
