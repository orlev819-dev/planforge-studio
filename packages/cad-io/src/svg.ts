import type { Prim } from './drawing';
import { arcPoints, dimGeometry, drawingBounds } from './drawing';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (x: number) => +x.toFixed(4);
const path = (pts: { x: number; y: number }[], closed: boolean) => pts.map((p, i) => `${i ? 'L' : 'M'}${n(p.x)} ${n(p.y)}`).join(' ') + (closed ? ' Z' : '');

/** SVG in real-world meters (1 user unit = 1 m). width/height attributes in mm at the given scale (default 1:50). */
export function toSVG(prims: Prim[], opts: { scaleDenominator?: number; title?: string; background?: string } = {}): string {
  const b = drawingBounds(prims);
  const m = 0.6;
  const x0 = b.minX - m, y0 = b.minY - m, w = b.maxX - b.minX + 2 * m, h = b.maxY - b.minY + 2 * m;
  const k = 1000 / (opts.scaleDenominator ?? 50);
  const parts: string[] = [];
  const layers = new Map<string, string[]>();
  const push = (layer: string, s: string) => { if (!layers.has(layer)) layers.set(layer, []); layers.get(layer)!.push(s); };
  for (const p of prims) {
    if (p.t === 'poly') push(p.layer, `<path d="${path(p.pts, p.closed)}" fill="${p.closed && p.fill ? p.fill : 'none'}" stroke="${p.stroke ?? 'none'}" stroke-width="${n(p.width ?? 0.01)}"${p.dash ? ' stroke-dasharray="0.1 0.06"' : ''} stroke-linejoin="round"/>`);
    else if (p.t === 'arc') push(p.layer, `<path d="${path(arcPoints(p.c, p.r, p.a0, p.a1), false)}" fill="none" stroke="${p.stroke}" stroke-width="${n(p.width ?? 0.01)}" stroke-dasharray="0.06 0.04"/>`);
    else if (p.t === 'text') push(p.layer, `<text x="${n(p.p.x)}" y="${n(p.p.y)}" font-size="${n(p.size)}" fill="${p.color}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, 'Noto Sans Hebrew', sans-serif"${p.bold ? ' font-weight="bold"' : ''}${p.angle ? ` transform="rotate(${n(p.angle)} ${n(p.p.x)} ${n(p.p.y)})"` : ''}>${esc(p.text)}</text>`);
    else {
      const g = dimGeometry(p);
      const st = `stroke="${p.color}" stroke-width="0.01" fill="none"`;
      push(p.layer, `<g><path d="${path(g.ext1, false)}" ${st}/><path d="${path(g.ext2, false)}" ${st}/><path d="${path(g.line, false)}" ${st}/>` +
        g.ticks.map((t) => `<path d="${path(t, false)}" stroke="${p.color}" stroke-width="0.02"/>`).join('') +
        `<text x="${n(g.textAt.x)}" y="${n(g.textAt.y)}" font-size="${n(p.size)}" fill="${p.color}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" transform="rotate(${n(g.angle)} ${n(g.textAt.x)} ${n(g.textAt.y)})">${esc(p.text)}</text></g>`);
    }
  }
  const order = ['rooms', 'walls', 'windows', 'doors', 'furniture', 'ceilings', 'dimensions', 'text', 'annotations'];
  for (const l of order) if (layers.has(l)) parts.push(`<g id="layer-${l}">${layers.get(l)!.join('')}</g>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${n(w * k)}mm" height="${n(h * k)}mm" viewBox="${n(x0)} ${n(y0)} ${n(w)} ${n(h)}">` +
    (opts.title ? `<title>${esc(opts.title)}</title>` : '') +
    `<rect x="${n(x0)}" y="${n(y0)}" width="${n(w)}" height="${n(h)}" fill="${opts.background ?? '#ffffff'}"/>${parts.join('')}</svg>\n`;
}
