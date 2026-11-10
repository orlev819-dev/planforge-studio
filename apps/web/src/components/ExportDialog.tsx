import { useState } from 'react';
import { EXPORT_FORMATS, buildDrawing, drawingBounds, planToPdf, toDXF, toSVG, toGLB, toOBJ, roomsCSV, projectJSON, type PdfOptions } from '../../../../packages/cad-io/src/index';
import { buildProjectMesh } from '../../../../packages/renderer-3d/src/mesh';
import { useStore, currentFloor, toast } from '../store';
import { useT, dicts } from '../i18n';
import { Modal, Check, SelectField, TextField, download, safeName } from './fields';
import { paintPrims } from '../editor/paint';

/** Canvas-based rasterizer so Hebrew/RTL text in PDFs is shaped by the browser's text engine. */
export async function rasterizeText(text: string, o: { bold: boolean; color: string }) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  const font = `${o.bold ? '700 ' : ''}64px system-ui, "Segoe UI", Arial, "Noto Sans Hebrew", sans-serif`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 8, h = 86;
  c.width = w; c.height = h;
  ctx.font = font; ctx.fillStyle = o.color; ctx.textBaseline = 'middle'; ctx.direction = /[֐-׿؀-ۿ]/.test(text) ? 'rtl' : 'ltr';
  ctx.textAlign = ctx.direction === 'rtl' ? 'right' : 'left';
  ctx.fillText(text, ctx.direction === 'rtl' ? w - 4 : 4, h / 2);
  const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
  return { png: new Uint8Array(await blob.arrayBuffer()), width: w, height: h };
}

export function rasterPlan(floor: Parameters<typeof buildDrawing>[0], unit: Parameters<typeof buildDrawing>[1]['unit'], precision: number, dpi: number, type: 'image/png' | 'image/jpeg', opts: { furniture: boolean; dimensions: boolean; annotations: boolean; assets?: Parameters<typeof buildDrawing>[1]['assets'] }): Promise<Blob> {
  const prims = buildDrawing(floor, { unit, precision, ...opts });
  const b = drawingBounds(prims);
  const pxPerM = (dpi / 25.4) * (1000 / 50); // 1:50 at the requested DPI
  const m = 0.6;
  const W = Math.min(8000, Math.ceil((b.maxX - b.minX + 2 * m) * pxPerM)), H = Math.min(8000, Math.ceil((b.maxY - b.minY + 2 * m) * pxPerM));
  const s = Math.min(pxPerM, 8000 / (b.maxX - b.minX + 2 * m), 8000 / (b.maxY - b.minY + 2 * m));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  paintPrims(ctx, prims, { scale: s, ox: (m - b.minX) * s, oy: (m - b.minY) * s });
  return new Promise((r) => c.toBlob((bl) => r(bl!), type, 0.92));
}

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const { t, lang } = useT();
  const project = useStore((s) => s.project)!;
  const floor = useStore((s) => currentFloor(s))!;
  const [format, setFormat] = useState<string>('pdf');
  const [paper, setPaper] = useState<PdfOptions['paper']>('A4');
  const [orientation, setOrientation] = useState<PdfOptions['orientation']>('landscape');
  const [scale, setScale] = useState<string>('fit');
  const [custom, setCustom] = useState({ w: 594, h: 420 });
  const [header, setHeader] = useState('');
  const [footer, setFooter] = useState('');
  const [furniture, setFurniture] = useState(true);
  const [dimensions, setDimensions] = useState(true);
  const [annotations, setAnnotations] = useState(true);
  const [legend, setLegend] = useState(true);
  const [schedule, setSchedule] = useState(true);
  const [allFloors, setAllFloors] = useState(true);
  const [dpi, setDpi] = useState(150);
  const [logo, setLogo] = useState<Uint8Array | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const base = safeName(project.name);
  const unit = project.settings.unit, precision = project.settings.precision;

  async function run() {
    setBusy(true);
    try {
      const floors = allFloors ? project.floors.map((f) => f.id) : [floor.id];
      const d = dicts[lang];
      switch (format) {
        case 'pdf': {
          const bytes = await planToPdf(project, {
            paper, orientation, customMm: custom, scale: scale === 'fit' ? 'fit' : Number(scale), floors, furniture, dimensions, annotations, legend, schedule,
            header: header || undefined, footer: footer || undefined, logoPng: logo, rasterize: rasterizeText,
            labels: { scale: d.scale, floor: d.floor, date: 'Date', area: d.area, rooms: d.roomsList, room: d.room, net: d.netArea, perimeter: d.perimeter, height: d.height, volume: d.volume, walls: d.walls, doors: d.doors, windows: d.windows, dimensions: d.dimension },
          });
          download(`${base}.pdf`, bytes as BlobPart, 'application/pdf');
          break;
        }
        case 'svg': download(`${base}_${safeName(floor.name)}.svg`, toSVG(buildDrawing(floor, { assets: project.assets, unit, precision, furniture, dimensions, annotations }), { title: project.name }), 'image/svg+xml'); break;
        case 'dxf': download(`${base}_${safeName(floor.name)}.dxf`, toDXF(buildDrawing(floor, { assets: project.assets, unit, precision, furniture, dimensions, annotations })), 'application/dxf'); break;
        case 'png': case 'jpeg': {
          const blob = await rasterPlan(floor, unit, precision, dpi, format === 'png' ? 'image/png' : 'image/jpeg', { furniture, dimensions, annotations, assets: project.assets });
          download(`${base}_${safeName(floor.name)}.${format === 'png' ? 'png' : 'jpg'}`, blob, blob.type);
          break;
        }
        case 'glb': download(`${base}.glb`, toGLB(buildProjectMesh(project, { floors, furniture })) as BlobPart, 'model/gltf-binary'); break;
        case 'obj': { const { obj, mtl } = toOBJ(buildProjectMesh(project, { floors, furniture }), base); download(`${base}.obj`, obj, 'text/plain'); download(`${base}.mtl`, mtl, 'text/plain'); break; }
        case 'json': download(`${base}.planforge.json`, projectJSON(project), 'application/json'); break;
        case 'csv': download(`${base}_rooms.csv`, roomsCSV(project), 'text/csv'); break;
      }
      toast(`${format.toUpperCase()} ✓`);
      onClose();
    } catch (e) { toast(`Export failed: ${(e as Error).message}`, 'error'); }
    finally { setBusy(false); }
  }

  const is2D = ['pdf', 'svg', 'dxf', 'png', 'jpeg'].includes(format);
  return (
    <Modal title={t('exportTitle')} onClose={onClose} testId="export-dialog" footer={<><button className="btn" onClick={onClose}>{t('cancel')}</button><button className="btn primary" data-testid="export-download" disabled={busy} onClick={run}>{busy ? '…' : t('download')}</button></>}>
      <div className="formats" role="radiogroup">
        {EXPORT_FORMATS.map((f) => (
          <label key={f.id} className={`format ${f.supported ? '' : 'disabled'}`} title={f.supported ? '' : t('unsupported')}>
            <input type="radio" name="fmt" value={f.id} data-testid={`fmt-${f.id}`} disabled={!f.supported} checked={format === f.id} onChange={() => setFormat(f.id)} />
            <span>{f.label}</span><small>{f.group}{!f.supported && ` · ${t('unsupported')}`}</small>
          </label>
        ))}
      </div>
      {format === 'pdf' && (
        <div className="grid2">
          <SelectField label={t('paper')} value={paper} options={[{ value: 'A4', label: 'A4' }, { value: 'A3', label: 'A3' }, { value: 'custom', label: 'Custom (mm)' }]} onChange={setPaper} />
          <SelectField label={t('orientation')} value={orientation} options={[{ value: 'landscape', label: t('landscape') }, { value: 'portrait', label: t('portrait') }]} onChange={setOrientation} />
          {paper === 'custom' && <>
            <label className="field"><span>W (mm)</span><input type="number" value={custom.w} onChange={(e) => setCustom({ ...custom, w: Number(e.target.value) })} /></label>
            <label className="field"><span>H (mm)</span><input type="number" value={custom.h} onChange={(e) => setCustom({ ...custom, h: Number(e.target.value) })} /></label>
          </>}
          <SelectField label={t('scale')} value={scale} options={[{ value: 'fit', label: t('fit') }, ...['20', '25', '50', '75', '100', '200'].map((s) => ({ value: s, label: `1:${s}` }))]} onChange={setScale} />
          <label className="field"><span>{t('logo')}</span><input type="file" accept="image/png" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setLogo(new Uint8Array(await f.arrayBuffer())); }} /></label>
          <TextField label={t('header')} value={header} onCommit={setHeader} />
          <TextField label={t('footer')} value={footer} onCommit={setFooter} />
          <Check label={t('legend')} checked={legend} onChange={setLegend} />
          <Check label={t('schedule')} checked={schedule} onChange={setSchedule} />
        </div>
      )}
      {(format === 'png' || format === 'jpeg') && <SelectField label={t('dpi')} value={String(dpi)} options={['72', '150', '300'].map((v) => ({ value: v, label: v }))} onChange={(v) => setDpi(Number(v))} />}
      <div className="row wrap">
        {(is2D || format === 'glb' || format === 'obj') && <Check label={t('includeFurniture')} checked={furniture} onChange={setFurniture} />}
        {is2D && <Check label={t('includeDims')} checked={dimensions} onChange={setDimensions} />}
        {is2D && <Check label={t('includeNotes')} checked={annotations} onChange={setAnnotations} />}
        {['pdf', 'glb', 'obj'].includes(format) && <Check label={t('allFloors')} checked={allFloors} onChange={setAllFloors} />}
      </div>
    </Modal>
  );
}
