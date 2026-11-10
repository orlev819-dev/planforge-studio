/**
 * Vector PDF plan export (pdf-lib). Drawings are placed at a true architectural scale (1:N), so a
 * printed 1 m equals 1000/N mm on paper. Text that the standard PDF fonts cannot encode (e.g. Hebrew)
 * is drawn through an injected rasterizer (the browser uses canvas) to keep correct RTL shaping.
 */
import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import type { Floor, Project } from '../../shared-types/src/index';
import { floorMetrics, formatArea, formatLength, formatVolume } from '../../geometry/src/index';
import { buildDrawing, arcPoints, dimGeometry, drawingBounds, type Prim } from './drawing';

export type PaperSize = 'A4' | 'A3' | 'custom';
export interface PdfOptions {
  paper: PaperSize; orientation: 'landscape' | 'portrait'; customMm?: { w: number; h: number };
  /** fixed scale denominator, or 'fit' to pick the largest standard scale that fits */
  scale: number | 'fit';
  floors?: string[];
  furniture?: boolean; dimensions?: boolean; annotations?: boolean;
  header?: string; footer?: string; logoPng?: Uint8Array; legend?: boolean; schedule?: boolean;
  date?: Date;
  /** optional rasterizer for text not encodable in WinAnsi (Hebrew etc.) — returns PNG and its pixel size */
  rasterize?: (text: string, opts: { bold: boolean; color: string }) => Promise<{ png: Uint8Array; width: number; height: number }>;
  labels?: { scale: string; floor: string; date: string; area: string; rooms: string; room: string; net: string; perimeter: string; height: string; volume: string; walls: string; doors: string; windows: string; dimensions: string };
}

const MM = 72 / 25.4;
const STANDARD_SCALES = [10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 1000];

const hex = (h: string): RGB => {
  const m = h.replace('#', '');
  const v = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  return rgb(parseInt(v.slice(0, 2), 16) / 255, parseInt(v.slice(2, 4), 16) / 255, parseInt(v.slice(4, 6), 16) / 255);
};

export function pageSizePt(o: Pick<PdfOptions, 'paper' | 'orientation' | 'customMm'>): [number, number] {
  let [w, h] = o.paper === 'A3' ? [297, 420] : o.paper === 'custom' && o.customMm ? [o.customMm.w, o.customMm.h] : [210, 297];
  if (o.orientation === 'landscape' ? w < h : w > h) [w, h] = [h, w];
  return [w * MM, h * MM];
}

export function chooseScale(widthM: number, heightM: number, availWpt: number, availHpt: number): number {
  for (const s of STANDARD_SCALES) if ((widthM * 1000 / s) * MM <= availWpt && (heightM * 1000 / s) * MM <= availHpt) return s;
  return STANDARD_SCALES[STANDARD_SCALES.length - 1];
}

class TextWriter {
  private cache = new Map<string, Awaited<ReturnType<PDFDocument['embedPng']>>>();
  constructor(private doc: PDFDocument, private font: PDFFont, private bold: PDFFont, private opts: PdfOptions) {}
  encodable(font: PDFFont, s: string) { try { font.encodeText(s); return true; } catch { return false; } }
  /** draw text centred (or left-aligned) at pdf point (x,y) with rotation in pdf degrees (ccw) */
  async draw(page: PDFPage, s: string, x: number, y: number, size: number, o: { bold?: boolean; color?: string; rot?: number; align?: 'center' | 'left' | 'right' } = {}) {
    if (!s) return;
    const font = o.bold ? this.bold : this.font;
    const th = ((o.rot ?? 0) * Math.PI) / 180, c = Math.cos(th), sn = Math.sin(th);
    const align = o.align ?? 'center';
    if (this.encodable(font, s)) {
      const w = font.widthOfTextAtSize(s, size);
      const ox = align === 'center' ? w / 2 : align === 'right' ? w : 0, oy = size * 0.35;
      page.drawText(s, { x: x - (c * ox - sn * oy), y: y - (sn * ox + c * oy), size, font, color: hex(o.color ?? '#000000'), rotate: degrees(o.rot ?? 0) });
      return;
    }
    if (this.opts.rasterize) {
      const key = `${s}|${o.bold}|${o.color}`;
      let entry = this.cache.get(key);
      let dims: { width: number; height: number };
      if (!entry) {
        const r = await this.opts.rasterize(s, { bold: !!o.bold, color: o.color ?? '#000000' });
        entry = await this.doc.embedPng(r.png);
        this.cache.set(key, entry);
      }
      dims = { width: entry.width, height: entry.height };
      const h = size * 1.35, w = (dims.width / dims.height) * h;
      const ox = align === 'center' ? w / 2 : align === 'right' ? w : 0, oy = h / 2;
      page.drawImage(entry, { x: x - (c * ox - sn * oy), y: y - (sn * ox + c * oy), width: w, height: h, rotate: degrees(o.rot ?? 0) });
      return;
    }
    // no rasterizer (e.g. headless tests): keep encodable characters only, never throw
    const safe = Array.from(s).map((ch) => (this.encodable(font, ch) ? ch : '?')).join('');
    await this.draw(page, safe, x, y, size, o);
  }
}

export async function planToPdf(project: Project, opts: PdfOptions): Promise<Uint8Array> {
  const L = opts.labels ?? { scale: 'Scale', floor: 'Floor', date: 'Date', area: 'Total area', rooms: 'Room schedule', room: 'Room', net: 'Net area', perimeter: 'Perimeter', height: 'Height', volume: 'Volume', walls: 'Walls', doors: 'Doors', windows: 'Windows', dimensions: 'Dimensions' };
  const doc = await PDFDocument.create();
  doc.setTitle(project.name); doc.setProducer('PlanForge Studio'); doc.setCreator('PlanForge Studio');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const tw = new TextWriter(doc, font, bold, opts);
  const logo = opts.logoPng ? await doc.embedPng(opts.logoPng) : null;
  const [PW, PH] = pageSizePt(opts);
  const margin = 12 * MM, titleH = 24 * MM, headerH = opts.header ? 8 * MM : 0;
  const date = (opts.date ?? new Date()).toISOString().slice(0, 10);
  const floors = project.floors.filter((f) => !opts.floors || opts.floors.includes(f.id));
  const unit = project.settings.unit, prec = project.settings.precision;

  for (const floor of floors) {
    const page = doc.addPage([PW, PH]);
    const prims = buildDrawing(floor, { assets: project.assets, unit, precision: prec, furniture: opts.furniture, dimensions: opts.dimensions, annotations: opts.annotations });
    const b = drawingBounds(prims);
    const availW = PW - 2 * margin, availH = PH - 2 * margin - titleH - headerH;
    const wM = b.maxX - b.minX, hM = b.maxY - b.minY;
    const s = opts.scale === 'fit' ? chooseScale(wM, hM, availW, availH) : opts.scale;
    const k = (1000 / s) * MM; // pt per meter
    const ox = margin + (availW - wM * k) / 2, oyTop = PH - margin - headerH - (availH - hM * k) / 2;
    const X = (x: number) => ox + (x - b.minX) * k;
    const Y = (y: number) => oyTop - (y - b.minY) * k;
    const pathOf = (pts: { x: number; y: number }[], closed: boolean) =>
      pts.map((p, i) => `${i ? 'L' : 'M'}${((p.x - b.minX) * k).toFixed(3)} ${((p.y - b.minY) * k).toFixed(3)}`).join(' ') + (closed ? ' Z' : '');
    const svg = (d: string, o: { fill?: string; stroke?: string; w?: number; dash?: number[] }) =>
      page.drawSvgPath(d, { x: ox, y: oyTop, color: o.fill ? hex(o.fill) : undefined, borderColor: o.stroke ? hex(o.stroke) : undefined, borderWidth: o.stroke ? Math.max(0.25, (o.w ?? 0.01) * k) : 0, borderDashArray: o.dash });

    if (opts.header) await tw.draw(page, opts.header, margin, PH - margin - 3 * MM, 10, { align: 'left', bold: true });
    const texts: Prim[] = [];
    for (const p of prims) {
      if (p.t === 'poly') svg(pathOf(p.pts, p.closed), { fill: p.closed ? p.fill : undefined, stroke: p.stroke, w: p.width, dash: p.dash ? [3, 2] : undefined });
      else if (p.t === 'arc') svg(pathOf(arcPoints(p.c, p.r, p.a0, p.a1), false), { stroke: p.stroke, w: p.width, dash: [2, 1.5] });
      else if (p.t === 'dim') {
        const g = dimGeometry(p);
        for (const seg of [g.ext1, g.ext2, g.line, ...g.ticks]) svg(pathOf(seg, false), { stroke: p.color, w: 0.008 });
        texts.push(p);
      } else texts.push(p);
    }
    for (const p of texts) {
      if (p.t === 'text') await tw.draw(page, p.text, X(p.p.x), Y(p.p.y), Math.max(5, p.size * k * 0.9), { bold: p.bold, color: p.color, rot: -(p.angle ?? 0) });
      else if (p.t === 'dim') { const g = dimGeometry(p); await tw.draw(page, p.text, X(g.textAt.x), Y(g.textAt.y), Math.max(4.5, p.size * k * 0.85), { color: p.color, rot: -g.angle }); }
    }

    // title block
    const ty = margin, tx = margin, tw2 = PW - 2 * margin;
    page.drawRectangle({ x: tx, y: ty, width: tw2, height: titleH, borderColor: hex('#333333'), borderWidth: 0.8 });
    const col = tw2 / 4;
    for (let i = 1; i < 4; i++) page.drawLine({ start: { x: tx + col * i, y: ty }, end: { x: tx + col * i, y: ty + titleH }, thickness: 0.5, color: hex('#999999') });
    await tw.draw(page, project.name, tx + 4, ty + titleH - 8 * MM, 13, { bold: true, align: 'left' });
    if (project.address) await tw.draw(page, project.address, tx + 4, ty + titleH - 14 * MM, 8, { align: 'left' });
    await tw.draw(page, `${L.floor}: ${floor.name}`, tx + col + 4, ty + titleH - 8 * MM, 9, { align: 'left' });
    await tw.draw(page, `${L.scale}: 1:${s}`, tx + col + 4, ty + titleH - 14 * MM, 9, { align: 'left' });
    await tw.draw(page, `${L.date}: ${date}`, tx + col + 4, ty + titleH - 20 * MM, 9, { align: 'left' });
    const fm = floorMetrics(floor);
    await tw.draw(page, `${L.area}: ${formatArea(fm.grossArea, unit, prec)}`, tx + 2 * col + 4, ty + titleH - 8 * MM, 9, { align: 'left', bold: true });
    await tw.draw(page, `${L.net}: ${formatArea(fm.netArea, unit, prec)}`, tx + 2 * col + 4, ty + titleH - 14 * MM, 9, { align: 'left' });
    if (opts.legend !== false) {
      const items: [string, string][] = [[L.walls, '#2b2d31'], [L.doors, '#3a6ea5'], [L.windows, '#2a9d8f'], [L.dimensions, '#c0392b']];
      items.forEach(([label, c], i) => {
        const lx = tx + 3 * col + 4 + (i % 2) * (col / 2), ly = ty + titleH - (8 + Math.floor(i / 2) * 6) * MM;
        page.drawRectangle({ x: lx, y: ly - 2, width: 10, height: 4, color: hex(c) });
      });
      for (let i = 0; i < items.length; i++) {
        const lx = tx + 3 * col + 4 + (i % 2) * (col / 2), ly = ty + titleH - (8 + Math.floor(i / 2) * 6) * MM;
        await tw.draw(page, items[i][0], lx + 13, ly, 7, { align: 'left' });
      }
    }
    if (logo) { const h = 10 * MM, w = (logo.width / logo.height) * h; page.drawImage(logo, { x: tx + tw2 - w - 4, y: ty + 3, width: w, height: h }); }
    else await tw.draw(page, 'PlanForge Studio', tx + tw2 - 4, ty + 4, 7, { align: 'right', color: '#777777' });
    // graphic scale bar: 0..5 m (or 1 m when very large scale)
    const barM = s <= 25 ? 1 : 5;
    const bx = margin, by = margin + titleH + 4 * MM;
    page.drawRectangle({ x: bx, y: by, width: barM * k, height: 2, color: hex('#222222') });
    await tw.draw(page, `0`, bx, by + 7, 6);
    await tw.draw(page, formatLength(barM, unit, 0), bx + barM * k, by + 7, 6);
    if (opts.footer) await tw.draw(page, opts.footer, PW / 2, margin / 2, 7, { color: '#555555' });
  }

  if (opts.schedule !== false) {
    const page = doc.addPage([PW, PH]);
    let y = PH - margin - 6 * MM;
    await tw.draw(page, `${project.name} — ${L.rooms}`, margin, y, 14, { bold: true, align: 'left' });
    y -= 10 * MM;
    const cols = [L.floor, L.room, L.area, L.net, L.perimeter, L.height, L.volume];
    const cw = (PW - 2 * margin) / cols.length;
    for (let i = 0; i < cols.length; i++) await tw.draw(page, cols[i], margin + i * cw + 2, y, 8, { bold: true, align: 'left' });
    page.drawLine({ start: { x: margin, y: y - 3 * MM }, end: { x: PW - margin, y: y - 3 * MM }, thickness: 0.6 });
    y -= 7 * MM;
    for (const floor of floors) for (const r of floorMetrics(floor).rooms) {
      if (y < margin + 10 * MM) break;
      const cells = [floor.name, r.name, formatArea(r.grossArea, unit, prec), formatArea(r.netArea, unit, prec), formatLength(r.perimeter, unit, prec), formatLength(r.height, unit, prec), formatVolume(r.volume, unit, prec)];
      for (let i = 0; i < cells.length; i++) await tw.draw(page, cells[i], margin + i * cw + 2, y, 8, { align: 'left' });
      y -= 6 * MM;
    }
  }
  return doc.save();
}

export function floorsWithContent(p: Project): Floor[] { return p.floors.filter((f) => Object.keys(f.rooms).length || Object.keys(f.walls).length); }
