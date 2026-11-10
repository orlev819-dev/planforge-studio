/**
 * AutoCAD R12 ASCII DXF writer. Units: meters ($INSUNITS=6). DXF is Y-up, the plan is Y-down,
 * so every Y is negated (no mirroring of the geometry itself).
 */
import type { Prim } from './drawing';
import { dimGeometry, drawingBounds } from './drawing';

const LAYERS: Record<string, number> = { rooms: 8, walls: 7, doors: 5, windows: 4, furniture: 9, dimensions: 1, text: 7, annotations: 6 };
const f = (x: number) => (Math.abs(x) < 1e-12 ? 0 : +x.toFixed(6)).toString();

/** non-ASCII characters (e.g. Hebrew) as AutoCAD \U+XXXX escapes */
const dxfText = (s: string) => Array.from(s).map((ch) => { const c = ch.codePointAt(0)!; return c < 128 ? ch : `\\U+${c.toString(16).toUpperCase().padStart(4, '0')}`; }).join('');

export function toDXF(prims: Prim[]): string {
  const b = drawingBounds(prims);
  const o: string[] = [];
  const g = (code: number, val: string | number) => { o.push(String(code)); o.push(typeof val === 'number' ? f(val) : val); };
  g(0, 'SECTION'); g(2, 'HEADER');
  g(9, '$ACADVER'); g(1, 'AC1009');
  g(9, '$INSUNITS'); g(70, '6');
  g(9, '$EXTMIN'); g(10, b.minX); g(20, -b.maxY); g(30, 0);
  g(9, '$EXTMAX'); g(10, b.maxX); g(20, -b.minY); g(30, 0);
  g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES');
  g(0, 'TABLE'); g(2, 'LTYPE'); g(70, '1');
  g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, '0'); g(3, 'Solid line'); g(72, '65'); g(73, '0'); g(40, 0);
  g(0, 'ENDTAB');
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, String(Object.keys(LAYERS).length));
  for (const [name, color] of Object.entries(LAYERS)) { g(0, 'LAYER'); g(2, name.toUpperCase()); g(70, '0'); g(62, String(color)); g(6, 'CONTINUOUS'); }
  g(0, 'ENDTAB');
  g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'ENTITIES');
  const line = (layer: string, p: { x: number; y: number }, q: { x: number; y: number }) => {
    g(0, 'LINE'); g(8, layer.toUpperCase()); g(10, p.x); g(20, -p.y); g(30, 0); g(11, q.x); g(21, -q.y); g(31, 0);
  };
  const text = (layer: string, p: { x: number; y: number }, h: number, s: string, ang = 0) => {
    g(0, 'TEXT'); g(8, layer.toUpperCase()); g(10, p.x); g(20, -p.y); g(30, 0); g(40, h); g(1, dxfText(s)); g(50, -ang);
    g(72, '1'); g(73, '2'); g(11, p.x); g(21, -p.y); g(31, 0);
  };
  for (const p of prims) {
    if (p.t === 'poly') {
      g(0, 'POLYLINE'); g(8, p.layer.toUpperCase()); g(66, '1'); g(10, 0); g(20, 0); g(30, 0); g(70, p.closed ? '1' : '0');
      for (const q of p.pts) { g(0, 'VERTEX'); g(8, p.layer.toUpperCase()); g(10, q.x); g(20, -q.y); g(30, 0); }
      g(0, 'SEQEND'); g(8, p.layer.toUpperCase());
    } else if (p.t === 'arc') {
      // Y flip turns angle a into -a; DXF arcs run counter-clockwise from start to end
      let s = (-p.a0 * 180) / Math.PI, e = (-p.a1 * 180) / Math.PI;
      if (e < s) [s, e] = [e, s];
      const norm = (x: number) => ((x % 360) + 360) % 360;
      g(0, 'ARC'); g(8, p.layer.toUpperCase()); g(10, p.c.x); g(20, -p.c.y); g(30, 0); g(40, p.r); g(50, norm(s)); g(51, norm(e));
    } else if (p.t === 'text') text(p.layer, p.p, p.size, p.text, p.angle ?? 0);
    else {
      const d = dimGeometry(p);
      line(p.layer, d.ext1[0], d.ext1[1]); line(p.layer, d.ext2[0], d.ext2[1]); line(p.layer, d.line[0], d.line[1]);
      for (const t of d.ticks) line(p.layer, t[0], t[1]);
      text(p.layer, d.textAt, p.size, p.text, d.angle);
    }
  }
  g(0, 'ENDSEC'); g(0, 'EOF');
  return o.join('\r\n') + '\r\n';
}

/** Minimal DXF reader used for validation tests and for DXF import (LINE/POLYLINE/LWPOLYLINE/ARC/TEXT). */
export function parseDXF(src: string) {
  const lines = src.split(/\r?\n/);
  const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([Number(lines[i].trim()), lines[i + 1].trim()]);
  const entities: { type: string; layer: string; data: Record<number, string[]> }[] = [];
  let inEntities = false, cur: { type: string; layer: string; data: Record<number, string[]> } | null = null;
  for (let i = 0; i < pairs.length; i++) {
    const [c, v] = pairs[i];
    if (Number.isNaN(c)) throw new Error(`Invalid group code at pair ${i}`);
    if (c === 2 && v === 'ENTITIES') { inEntities = true; continue; }
    if (!inEntities) continue;
    if (c === 0) { if (cur) entities.push(cur); if (v === 'ENDSEC') { inEntities = false; cur = null; continue; } cur = { type: v, layer: '', data: {} }; continue; }
    if (cur) { if (c === 8) cur.layer = v; (cur.data[c] ??= []).push(v); }
  }
  if (!pairs.some(([c, v]) => c === 0 && v === 'EOF')) throw new Error('Missing EOF');
  return entities;
}
