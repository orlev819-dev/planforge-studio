/**
 * Import of user-owned 3D models (STL ASCII/binary, Wavefront OBJ) as furniture/objects.
 * Output is a ModelAsset: a Y-up triangle soup in meters, centred on x/z, resting on y = 0,
 * plus its 2D footprint (convex hull) for plan drawings.
 */
import type { ModelAsset, ModelFormat, Vec2 } from '../../shared-types/src/index';

export const MAX_TRIANGLES = 200_000;
export type ModelUnit = 'mm' | 'cm' | 'm' | 'in';
export const UNIT_SCALE: Record<ModelUnit, number> = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254 };

export class ModelImportError extends Error {}

/** Raw triangles (x,y,z × 3 per triangle) in file units, file axes. */
export function parseSTL(buf: ArrayBuffer): Float32Array {
  const bytes = new Uint8Array(buf);
  if (bytes.length >= 84) {
    const n = new DataView(buf).getUint32(80, true);
    if (84 + n * 50 === bytes.length) {
      if (n > MAX_TRIANGLES) throw new ModelImportError(`Model has ${n.toLocaleString()} triangles (limit ${MAX_TRIANGLES.toLocaleString()}). Simplify it first.`);
      const dv = new DataView(buf), out = new Float32Array(n * 9);
      for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) out[i * 9 + k] = dv.getFloat32(84 + i * 50 + 12 + k * 4, true);
      return out;
    }
  }
  const text = new TextDecoder().decode(bytes);
  if (!/^\s*solid/i.test(text) || !/facet/i.test(text)) throw new ModelImportError('Not a valid STL file.');
  const re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g;
  const v: number[] = [];
  for (let m; (m = re.exec(text));) v.push(+m[1], +m[2], +m[3]);
  if (!v.length || v.length % 9) throw new ModelImportError('STL file contains no complete triangles.');
  if (v.length / 9 > MAX_TRIANGLES) throw new ModelImportError(`Model has too many triangles (limit ${MAX_TRIANGLES.toLocaleString()}).`);
  return new Float32Array(v);
}

export function parseOBJ(text: string): Float32Array {
  const verts: number[][] = [];
  const out: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('v ')) { const p = line.split(/\s+/); verts.push([+p[1], +p[2], +p[3]]); }
    else if (line.startsWith('f ')) {
      const idx = line.split(/\s+/).slice(1).map((t) => { const i = parseInt(t.split('/')[0], 10); return i < 0 ? verts.length + i : i - 1; });
      for (let k = 1; k + 1 < idx.length; k++) for (const i of [idx[0], idx[k], idx[k + 1]]) {
        const p = verts[i];
        if (!p || p.some((x) => !Number.isFinite(x))) throw new ModelImportError('OBJ face references a missing vertex.');
        out.push(p[0], p[1], p[2]);
      }
      if (out.length / 9 > MAX_TRIANGLES) throw new ModelImportError(`Model has too many triangles (limit ${MAX_TRIANGLES.toLocaleString()}).`);
    }
  }
  if (!out.length) throw new ModelImportError('OBJ file contains no faces.');
  return new Float32Array(out);
}


// ---------------------------------------------------------------------------------------------
// glTF 2.0 / GLB
// ---------------------------------------------------------------------------------------------

/** triangles plus the material groups they came from, so a model keeps its own colours */
export interface ParsedModel { tris: Float32Array; groups: ModelGroup[] }
export interface ModelGroup { color: string; start: number; count: number }

type Gltf = {
  scenes?: { nodes?: number[] }[]; scene?: number;
  nodes?: { mesh?: number; children?: number[]; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }[];
  meshes?: { primitives: { attributes: Record<string, number>; indices?: number; material?: number; mode?: number }[] }[];
  accessors?: { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string }[];
  bufferViews?: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[];
  buffers?: { byteLength: number; uri?: string }[];
  materials?: { pbrMetallicRoughness?: { baseColorFactor?: number[] }; extensions?: Record<string, { diffuseFactor?: number[] }> }[];
};

const COMPONENT_BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COUNT: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

const toHex = (c: number[] | undefined): string => {
  if (!c) return '#c9c6c0';
  // glTF colours are linear; sRGB is what a screen shows
  const f = (v: number) => Math.round(Math.max(0, Math.min(1, v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)) * 255).toString(16).padStart(2, '0');
  return `#${f(c[0] ?? 1)}${f(c[1] ?? 1)}${f(c[2] ?? 1)}`;
};

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 4x4 column-major multiply, as glTF stores them */
const mul4 = (a: number[], b: number[]): number[] => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let v = 0; for (let k = 0; k < 4; k++) v += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = v; }
  return o;
};
const nodeMatrix = (n: { matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }): number[] => {
  if (n.matrix?.length === 16) return n.matrix;
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
};

/**
 * Read a glTF 2.0 document (already split into its JSON and its binary buffer) into triangles.
 * Node transforms are applied, each primitive keeps its material's base colour, and anything that
 * is not a triangle mesh is skipped. Sparse accessors and external .bin files are not supported —
 * both are reported rather than silently dropped.
 */
export function readGltf(json: Gltf, bin: Uint8Array | null): ParsedModel {
  const buffers: (Uint8Array | null)[] = (json.buffers ?? []).map((b, i) => {
    if (!b.uri) return i === 0 ? bin : null;
    const m = /^data:[^;]*;base64,(.*)$/.exec(b.uri);
    if (m) return base64ToBytes(m[1]);
    throw new ModelImportError(`This model keeps its data in a separate file (${b.uri}). Export it as a single .glb and import that.`);
  });
  const view = (i: number) => {
    const v = json.bufferViews?.[i];
    if (!v) throw new ModelImportError('Model is missing a buffer view.');
    const buf = buffers[v.buffer];
    if (!buf) throw new ModelImportError('Model is missing its binary data.');
    return { buf, offset: v.byteOffset ?? 0, stride: v.byteStride ?? 0, length: v.byteLength };
  };
  const read = (ai: number): Float64Array => {
    const a = json.accessors?.[ai];
    if (!a) throw new ModelImportError('Model is missing an accessor.');
    const comps = TYPE_COUNT[a.type] ?? 1, bytes = COMPONENT_BYTES[a.componentType];
    if (!bytes) throw new ModelImportError(`Unsupported data type in the model (${a.componentType}).`);
    const out = new Float64Array(a.count * comps);
    if (a.bufferView === undefined) return out; // all zeros, per spec
    const { buf, offset, stride } = view(a.bufferView);
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const elemSize = comps * bytes, step = stride || elemSize;
    let at = offset + (a.byteOffset ?? 0);
    for (let i = 0; i < a.count; i++) {
      for (let c = 0; c < comps; c++) {
        const o = at + c * bytes;
        out[i * comps + c] = a.componentType === 5126 ? dv.getFloat32(o, true)
          : a.componentType === 5125 ? dv.getUint32(o, true)
          : a.componentType === 5123 ? dv.getUint16(o, true)
          : a.componentType === 5121 ? dv.getUint8(o)
          : a.componentType === 5122 ? dv.getInt16(o, true)
          : dv.getInt8(o);
      }
      at += step;
    }
    return out;
  };

  const tris: number[] = [];
  const groups: ModelGroup[] = [];
  const nodes = json.nodes ?? [];
  const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? nodes.map((_, i) => i);
  const seen = new Set<number>();
  const walk = (index: number, parent: number[]) => {
    const n = nodes[index];
    if (!n || seen.has(index)) return;
    seen.add(index);
    const m = mul4(parent, nodeMatrix(n));
    if (n.mesh !== undefined) {
      for (const prim of json.meshes?.[n.mesh]?.primitives ?? []) {
        if (prim.mode !== undefined && prim.mode !== 4) continue; // triangles only
        const posIndex = prim.attributes?.POSITION;
        if (posIndex === undefined) continue;
        const pos = read(posIndex);
        const idx = prim.indices !== undefined ? read(prim.indices) : null;
        const count = idx ? idx.length : pos.length / 3;
        const start = tris.length / 9;
        for (let i = 0; i + 2 < count; i += 3) {
          for (let k = 0; k < 3; k++) {
            const vi = idx ? idx[i + k] : i + k;
            const x = pos[vi * 3], y = pos[vi * 3 + 1], z = pos[vi * 3 + 2];
            tris.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
          }
        }
        const added = tris.length / 9 - start;
        if (added > 0) {
          const mat = prim.material !== undefined ? json.materials?.[prim.material] : undefined;
          const color = toHex(mat?.pbrMetallicRoughness?.baseColorFactor ?? mat?.extensions?.KHR_materials_pbrSpecularGlossiness?.diffuseFactor);
          const last = groups[groups.length - 1];
          if (last && last.color === color && last.start + last.count === start) last.count += added;
          else groups.push({ color, start, count: added });
        }
      }
    }
    for (const c of n.children ?? []) walk(c, m);
  };
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const r of roots) walk(r, identity);
  if (!tris.length) throw new ModelImportError('This glTF model has no triangle meshes.');
  return { tris: new Float32Array(tris), groups };
}

/** Binary glTF container: a JSON chunk and (usually) a binary chunk. */
export function parseGLB(buf: ArrayBuffer): ParsedModel {
  const dv = new DataView(buf);
  if (buf.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67) throw new ModelImportError('Not a .glb file (bad header).');
  const version = dv.getUint32(4, true);
  if (version !== 2) throw new ModelImportError(`Unsupported glTF version ${version}; this reads glTF 2.0.`);
  let at = 12, json: Gltf | null = null, bin: Uint8Array | null = null;
  const total = Math.min(dv.getUint32(8, true) || buf.byteLength, buf.byteLength);
  while (at + 8 <= total) {
    const len = dv.getUint32(at, true), type = dv.getUint32(at + 4, true);
    const body = new Uint8Array(buf, at + 8, Math.min(len, buf.byteLength - at - 8));
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(body)) as Gltf;
    else if (type === 0x004e4942) bin = body;
    at += 8 + len + ((4 - (len % 4)) % 4);
  }
  if (!json) throw new ModelImportError('The .glb file has no glTF data in it.');
  return readGltf(json, bin);
}

/** .gltf text file; its buffers must be embedded (data: URIs), not sitting next to it. */
export function parseGLTFText(text: string): ParsedModel {
  let json: Gltf;
  try { json = JSON.parse(text) as Gltf; } catch { throw new ModelImportError('This .gltf file is not valid JSON.'); }
  return readGltf(json, null);
}

export function parseModelFile(name: string, buf: ArrayBuffer): ParsedModel & { format: ModelFormat } {
  const plain = (tris: Float32Array, format: ModelFormat) => ({ tris, groups: [] as ModelGroup[], format });
  if (/\.stl$/i.test(name)) return plain(parseSTL(buf), 'stl');
  if (/\.obj$/i.test(name)) return plain(parseOBJ(new TextDecoder().decode(buf)), 'obj');
  if (/\.glb$/i.test(name)) return { ...parseGLB(buf), format: 'glb' };
  if (/\.gltf$/i.test(name)) return { ...parseGLTFText(new TextDecoder().decode(buf)), format: 'glb' };
  throw new ModelImportError('Supported model formats: .glb, .gltf, .obj, .stl');
}

/** raw bounding box in file units (for unit auto-detection / preview) */
export function rawSize(tris: Float32Array) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tris.length; i += 3) for (let k = 0; k < 3; k++) { const v = tris[i + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
  return { x: max[0] - min[0], y: max[1] - min[1], z: max[2] - min[2] };
}

/** Furniture-sized objects: guess the file unit from the largest dimension. */
export function guessUnit(tris: Float32Array): ModelUnit {
  const s = rawSize(tris), m = Math.max(s.x, s.y, s.z);
  // pick the unit that makes the largest dimension a plausible object size (0.2–5 m)
  for (const u of ['m', 'cm', 'mm'] as const) { const v = m * UNIT_SCALE[u]; if (v >= 0.2 && v <= 5) return u; }
  return m > 100 ? 'mm' : m > 12 ? 'cm' : 'm';
}

function convexHull(pts: Vec2[]): Vec2[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cr = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Vec2[] = [], upper: Vec2[] = [];
  for (const q of p) { while (lower.length >= 2 && cr(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cr(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export function encodeFloats(a: Float32Array): string {
  const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
export function decodeFloats(s: string): Float32Array {
  const bin = atob(s), b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return new Float32Array(b.buffer);
}

/** Convert raw triangles to a ModelAsset (meters, Y-up, centred, on the floor). */
export function buildModelAsset(id: string, name: string, format: ModelFormat, raw: Float32Array, o: { unit: ModelUnit; up: 'y' | 'z'; color: string; groups?: ModelGroup[] }): ModelAsset {
  const s = UNIT_SCALE[o.unit];
  const t = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i += 3) {
    const x = raw[i] * s, y = raw[i + 1] * s, z = raw[i + 2] * s;
    // Z-up (typical for STL/CAD) -> Y-up: (x, y, z) -> (x, z, -y)
    if (o.up === 'z') { t[i] = x; t[i + 1] = z; t[i + 2] = -y; } else { t[i] = x; t[i + 1] = y; t[i + 2] = z; }
  }
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < t.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], t[i + k]); max[k] = Math.max(max[k], t[i + k]); }
  const cx = (min[0] + max[0]) / 2, cz = (min[2] + max[2]) / 2;
  const pts: Vec2[] = [];
  for (let i = 0; i < t.length; i += 3) { t[i] -= cx; t[i + 1] -= min[1]; t[i + 2] -= cz; pts.push({ x: t[i], y: t[i + 2] }); }
  const size = { x: max[0] - min[0], y: max[1] - min[1], z: max[2] - min[2] };
  if (!(size.x > 1e-4 && size.z > 1e-4 && size.y > 1e-4)) throw new ModelImportError('Model is flat or empty after conversion.');
  const hull = convexHull(pts).map((p) => ({ x: +p.x.toFixed(4), y: +p.y.toFixed(4) }));
  const groups = o.groups?.length ? o.groups.filter((g) => g.count > 0) : undefined;
  return { id, name, format, triangles: t.length / 9, size, hull, color: o.color, data: encodeFloats(t), groups };
}
