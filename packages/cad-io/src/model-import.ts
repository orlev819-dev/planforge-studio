/**
 * Import of user-owned 3D models (STL ASCII/binary, Wavefront OBJ) as furniture/objects.
 * Output is a ModelAsset: a Y-up triangle soup in meters, centred on x/z, resting on y = 0,
 * plus its 2D footprint (convex hull) for plan drawings.
 */
import type { ModelAsset, Vec2 } from '../../shared-types/src/index';

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

export function parseModelFile(name: string, buf: ArrayBuffer): { tris: Float32Array; format: 'stl' | 'obj' } {
  if (/\.stl$/i.test(name)) return { tris: parseSTL(buf), format: 'stl' };
  if (/\.obj$/i.test(name)) return { tris: parseOBJ(new TextDecoder().decode(buf)), format: 'obj' };
  throw new ModelImportError('Supported model formats: .obj, .stl');
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
export function buildModelAsset(id: string, name: string, format: 'stl' | 'obj', raw: Float32Array, o: { unit: ModelUnit; up: 'y' | 'z'; color: string }): ModelAsset {
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
  return { id, name, format, triangles: t.length / 9, size, hull, color: o.color, data: encodeFloats(t) };
}
