import { useState } from 'react';
import { updateFloorProps } from '../../../../packages/geometry/src/index';
import { editProject, setTool, useStore, currentFloor, toast } from '../store';
import { useT } from '../i18n';
import { Modal } from './fields';
import { pdfWorkerUrl } from 'virtual:pdf-worker';

type PdfDoc = { numPages: number; getPage: (n: number) => Promise<{ getViewport: (o: { scale: number }) => { width: number; height: number }; render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> } }> };

async function loadPdf(data: ArrayBuffer): Promise<PdfDoc> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl();
  return (await pdfjs.getDocument({ data: new Uint8Array(data) }).promise) as unknown as PdfDoc;
}

async function renderPage(doc: PdfDoc, n: number, scale = 2): Promise<{ url: string; w: number; h: number }> {
  const page = await doc.getPage(n);
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return { url: c.toDataURL('image/png'), w: c.width, h: c.height };
}

const readAsDataUrl = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
const imageSize = (url: string) => new Promise<{ w: number; h: number }>((res, rej) => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth || 1000, h: i.naturalHeight || 1000 }); i.onerror = () => rej(new Error('Unreadable image')); i.src = url; });

/** Import an existing plan as a locked, calibratable reference layer (it is NOT treated as CAD geometry). */
export function ImportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const floor = useStore((s) => currentFloor(s))!;
  const [pdf, setPdf] = useState<PdfDoc | null>(null);
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<{ url: string; w: number; h: number } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(f: File) {
    setBusy(true);
    try {
      if (/\.dxf$/i.test(f.name)) { toast('DXF import is not supported yet. Export the drawing as PDF/PNG and trace it.', 'error'); return; }
      if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
        const doc = await loadPdf(await f.arrayBuffer());
        setPdf(doc); setPage(1); setPreview(await renderPage(doc, 1));
      } else if (/^image\/(png|jpeg|svg\+xml)$/.test(f.type) || /\.(png|jpe?g|svg)$/i.test(f.name)) {
        const url = await readAsDataUrl(f);
        const s = await imageSize(url);
        setPdf(null); setPreview({ url, w: s.w, h: s.h });
      } else toast('Unsupported file type', 'error');
    } catch (e) { toast(`Import failed: ${(e as Error).message}`, 'error'); }
    finally { setBusy(false); }
  }

  async function choosePage(n: number) {
    if (!pdf) return;
    setBusy(true); setPage(n);
    try { setPreview(await renderPage(pdf, n)); } finally { setBusy(false); }
  }

  function place() {
    if (!preview) return;
    // initial guess: 100 px per meter at render resolution; the user must calibrate with two known points
    editProject('Import reference plan', (p) => updateFloorProps(p, floor.id, { reference: { dataUrl: preview.url, pxWidth: preview.w, pxHeight: preview.h, scale: 0.01, x: 0, y: 0, rotation: 0, opacity: 0.5, locked: false, visible: true, calibrated: false } }));
    onClose();
    window.dispatchEvent(new Event('planforge:fit'));
    setTool('calibrate');
    toast(t('calibrateHint'));
  }

  return (
    <Modal title={t('importPlan')} onClose={onClose} testId="import-dialog" footer={<><button className="btn" onClick={onClose}>{t('cancel')}</button><button className="btn primary" disabled={!preview || busy} onClick={place} data-testid="import-place">{t('apply')}</button></>}>
      <input type="file" data-testid="import-file" accept=".pdf,.png,.jpg,.jpeg,.svg,.dxf,application/pdf,image/png,image/jpeg,image/svg+xml" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
      {pdf && pdf.numPages > 1 && (
        <label className="field"><span>{t('page')} (1–{pdf.numPages})</span><input type="number" min={1} max={pdf.numPages} value={page} onChange={(e) => void choosePage(Math.min(pdf.numPages, Math.max(1, Number(e.target.value))))} /></label>
      )}
      {busy && <p className="muted">…</p>}
      {preview && <img className="import-preview" src={preview.url} alt="preview" />}
      <p className="hint-text">{t('calibrateHint')}</p>
    </Modal>
  );
}
