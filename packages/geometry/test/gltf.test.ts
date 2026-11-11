/** glTF 2.0 / GLB import. The fixtures are real GLB files built here, byte for byte. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGLB, parseGLTFText, parseModelFile, buildModelAsset, guessUnit, ModelImportError } from '../../cad-io/src/model-import';
import { buildFloorMesh } from '../../renderer-3d/src/mesh';
import { createFloor, addFurniture } from '../src/index';

if (typeof globalThis.atob !== 'function') throw new Error('atob is required');

/** a unit cube's 12 triangles as 36 indexed vertices */
const CUBE_POS = new Float32Array([
  0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, // back
  0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, // front
]);
const CUBE_IDX = new Uint16Array([
  0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1,
  3, 2, 6, 3, 6, 7, 0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2,
]);

/** Build a valid .glb with one or two primitives, each with its own material. */
function makeGlb(opts: { scale?: number[]; translation?: number[]; twoMaterials?: boolean } = {}): ArrayBuffer {
  const pos = new Uint8Array(CUBE_POS.buffer);
  const idx = new Uint8Array(CUBE_IDX.buffer);
  const pad4 = (n: number) => (4 - (n % 4)) % 4;
  const bin = new Uint8Array(pos.length + pad4(pos.length) + idx.length + pad4(idx.length));
  bin.set(pos, 0);
  const idxOffset = pos.length + pad4(pos.length);
  bin.set(idx, idxOffset);
  const half = CUBE_IDX.length / 2;
  const json: Record<string, unknown> = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, ...(opts.scale ? { scale: opts.scale } : {}), ...(opts.translation ? { translation: opts.translation } : {}) }],
    meshes: [{
      primitives: opts.twoMaterials
        ? [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }, { attributes: { POSITION: 0 }, indices: 2, material: 1 }]
        : [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }],
    }],
    materials: [
      { pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] } },
      { pbrMetallicRoughness: { baseColorFactor: [0, 0, 1, 1] } },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: CUBE_POS.length / 3, type: 'VEC3' },
      opts.twoMaterials
        ? { bufferView: 1, componentType: 5123, count: half, type: 'SCALAR' }
        : { bufferView: 1, componentType: 5123, count: CUBE_IDX.length, type: 'SCALAR' },
      { bufferView: 1, byteOffset: half * 2, componentType: 5123, count: half, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: pos.length },
      { buffer: 0, byteOffset: idxOffset, byteLength: idx.length },
    ],
    buffers: [{ byteLength: bin.length }],
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = pad4(jsonBytes.length);
  const total = 12 + 8 + jsonBytes.length + jsonPad + 8 + bin.length;
  const out = new ArrayBuffer(total);
  const dv = new DataView(out), u8 = new Uint8Array(out);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length + jsonPad, true); dv.setUint32(16, 0x4e4f534a, true);
  u8.set(jsonBytes, 20);
  for (let i = 0; i < jsonPad; i++) u8[20 + jsonBytes.length + i] = 0x20;
  const binAt = 20 + jsonBytes.length + jsonPad;
  dv.setUint32(binAt, bin.length, true); dv.setUint32(binAt + 4, 0x004e4942, true);
  u8.set(bin, binAt + 8);
  return out;
}

test('a .glb comes in as triangles with its own material colours', () => {
  const m = parseGLB(makeGlb());
  assert.equal(m.tris.length / 9, 12);                  // a cube is 12 triangles
  assert.deepEqual(m.groups, [{ color: '#ff0000', start: 0, count: 12 }]); // linear 1,0,0 -> sRGB red
  const two = parseGLB(makeGlb({ twoMaterials: true }));
  assert.equal(two.groups.length, 2);
  assert.equal(two.groups[0].count + two.groups[1].count, 12);
  assert.equal(two.groups[1].color, '#0000ff');
});

test('node transforms are applied', () => {
  const plain = parseGLB(makeGlb());
  const moved = parseGLB(makeGlb({ scale: [2, 3, 4], translation: [10, 0, 0] }));
  const span = (t: Float32Array, k: number) => {
    let lo = Infinity, hi = -Infinity;
    for (let i = k; i < t.length; i += 3) { lo = Math.min(lo, t[i]); hi = Math.max(hi, t[i]); }
    return { lo, hi };
  };
  assert.equal(span(plain.tris, 0).hi - span(plain.tris, 0).lo, 1);
  assert.equal(span(moved.tris, 0).hi - span(moved.tris, 0).lo, 2);
  assert.equal(span(moved.tris, 1).hi - span(moved.tris, 1).lo, 3);
  assert.equal(span(moved.tris, 2).hi - span(moved.tris, 2).lo, 4);
  assert.equal(span(moved.tris, 0).lo, 10);
});

test('a .gltf with its buffer embedded reads the same way', () => {
  const glb = makeGlb();
  // rebuild the same model as a .gltf text file with a data: URI buffer
  const dv = new DataView(glb);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, jsonLen)));
  const binLen = dv.getUint32(20 + jsonLen, true);
  const bin = new Uint8Array(glb, 28 + jsonLen, binLen);
  let s = '';
  for (const b of bin) s += String.fromCharCode(b);
  json.buffers[0].uri = `data:application/octet-stream;base64,${btoa(s)}`;
  const m = parseGLTFText(JSON.stringify(json));
  assert.equal(m.tris.length / 9, 12);
  assert.equal(m.groups[0].color, '#ff0000');
});

test('broken or unsupported files say what is wrong instead of failing silently', () => {
  assert.throws(() => parseGLB(new ArrayBuffer(8)), (e: ModelImportError) => /bad header/.test(e.message));
  const glb = makeGlb();
  new DataView(glb).setUint32(4, 1, true);              // claim glTF 1.0
  assert.throws(() => parseGLB(glb), (e: ModelImportError) => /glTF 2\.0/.test(e.message));
  const external = JSON.stringify({ asset: { version: '2.0' }, buffers: [{ byteLength: 4, uri: 'scene.bin' }], scenes: [{ nodes: [] }], nodes: [] });
  assert.throws(() => parseGLTFText(external), (e: ModelImportError) => /separate file/.test(e.message));
  assert.throws(() => parseGLTFText('{nope'), (e: ModelImportError) => /valid JSON/.test(e.message));
  assert.throws(() => parseModelFile('x.fbx', new ArrayBuffer(4)), (e: ModelImportError) => /\.glb/.test(e.message));
});

test('an imported glTF becomes a placeable object that keeps its materials in 3D', () => {
  const parsed = parseModelFile('chair.glb', makeGlb({ twoMaterials: true, scale: [0.5, 0.9, 0.5] }));
  assert.equal(parsed.format, 'glb');
  const asset = buildModelAsset('a1', 'Chair', parsed.format, parsed.tris, { unit: guessUnit(parsed.tris), up: 'y', color: parsed.groups[0].color, groups: parsed.groups });
  assert.equal(asset.groups?.length, 2);
  assert.ok(asset.hull.length >= 3);
  assert.ok(asset.size.y > 0.5 && asset.size.y < 1.2);  // a 0.9 m tall model stays 0.9 m

  const r = addFurniture(createFloor('F'), {
    catalogId: 'custom', name: 'Chair', category: 'custom', x: 1, y: 1, rotation: 0,
    width: asset.size.x, depth: asset.size.z, height: asset.size.y, elevation: 0,
    mirrored: false, layer: 'furniture', color: asset.color, meta: { shape: 'model', modelId: asset.id },
  });
  const parts = buildFloorMesh(r.floor, { assets: { a1: asset } }).filter((p) => p.id === r.id);
  assert.equal(parts.length, 2, 'one part per material');
  assert.ok(parts.every((p) => p.positions.length > 0 && p.indices.length === p.positions.length / 3));

  // once the colour is overridden the whole model takes it
  const painted = { ...r.floor, furniture: { [r.id]: { ...r.floor.furniture[r.id], color: '#123456' } } };
  assert.equal(buildFloorMesh(painted, { assets: { a1: asset } }).filter((p) => p.id === r.id).length, 1);
});
