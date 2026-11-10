/** Canvas 2D painter for the shared drawing list (used by the editor and PNG/JPEG export). */
import type { Prim, Layer } from '../../../../packages/cad-io/src/drawing';
import { arcPoints, dimGeometry } from '../../../../packages/cad-io/src/drawing';
import type { Vec2 } from '../../../../packages/shared-types/src/index';

export interface ViewXf { scale: number; ox: number; oy: number } // screen = world * scale + o

export const toScreen = (v: ViewXf, p: Vec2) => ({ x: p.x * v.scale + v.ox, y: p.y * v.scale + v.oy });
export const toWorld = (v: ViewXf, x: number, y: number) => ({ x: (x - v.ox) / v.scale, y: (y - v.oy) / v.scale });

export function paintPrims(ctx: CanvasRenderingContext2D, prims: Prim[], v: ViewXf, opts: { hidden?: Set<Layer>; highlight?: Set<string>; dark?: boolean } = {}) {
  const S = (p: Vec2) => toScreen(v, p);
  const hl = opts.highlight ?? new Set<string>();
  const invert = (c: string | undefined) => {
    if (!opts.dark || !c) return c;
    const map: Record<string, string> = { '#2b2d31': '#d7dae0', '#f4efe6': '#2c2f36', '#b9b0a2': '#4b4f58', '#1f2328': '#e6e8eb', '#ffffff': '#1d2026' };
    return map[c] ?? c;
  };
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const texts: Prim[] = [];
  for (const p of prims) {
    if (opts.hidden?.has(p.layer)) continue;
    const isHl = p.id ? hl.has(p.id) : false;
    if (p.t === 'poly') {
      ctx.beginPath();
      p.pts.forEach((q, i) => { const s = S(q); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); });
      if (p.closed) ctx.closePath();
      if (p.closed && p.fill) { ctx.fillStyle = isHl && p.layer === 'rooms' ? (opts.dark ? '#24405f' : '#dbeafe') : invert(p.fill)!; ctx.fill(); }
      if (p.stroke) { ctx.strokeStyle = isHl ? '#1d7cf2' : invert(p.stroke)!; ctx.lineWidth = Math.max(1, (p.width ?? 0.01) * v.scale) + (isHl ? 1.5 : 0); ctx.setLineDash(p.dash ? [6, 4] : []); ctx.stroke(); ctx.setLineDash([]); }
    } else if (p.t === 'arc') {
      ctx.beginPath();
      arcPoints(p.c, p.r, p.a0, p.a1).forEach((q, i) => { const s = S(q); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); });
      ctx.strokeStyle = isHl ? '#1d7cf2' : p.stroke; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
    } else if (p.t === 'dim') {
      const g = dimGeometry(p);
      ctx.strokeStyle = isHl ? '#1d7cf2' : p.color; ctx.lineWidth = 1;
      for (const seg of [g.ext1, g.ext2, g.line]) { const a = S(seg[0]), b = S(seg[1]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      ctx.lineWidth = 2;
      for (const seg of g.ticks) { const a = S(seg[0]), b = S(seg[1]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      texts.push(p);
    } else texts.push(p);
  }
  // text last, with a halo so it stays legible over geometry
  for (const p of texts) {
    if (p.t === 'text') drawText(ctx, S(p.p), p.text, Math.max(9, p.size * v.scale), invert(p.color)!, p.angle ?? 0, p.bold, opts.dark);
    else if (p.t === 'dim') { const g = dimGeometry(p); const px = Math.max(8, p.size * v.scale); if (px >= 7) drawText(ctx, S(g.textAt), p.text, px, p.color, g.angle, false, opts.dark); }
  }
}

function drawText(ctx: CanvasRenderingContext2D, s: Vec2, text: string, px: number, color: string, angleDeg: number, bold?: boolean, dark?: boolean) {
  ctx.save();
  ctx.translate(s.x, s.y);
  if (angleDeg) ctx.rotate((angleDeg * Math.PI) / 180);
  ctx.font = `${bold ? '600 ' : ''}${px.toFixed(1)}px system-ui, "Segoe UI", Arial, "Noto Sans Hebrew", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.direction = 'inherit';
  ctx.lineWidth = 3; ctx.strokeStyle = dark ? 'rgba(20,22,26,0.85)' : 'rgba(255,255,255,0.85)';
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = color; ctx.fillText(text, 0, 0);
  ctx.restore();
}
