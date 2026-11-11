/**
 * Interactive CAD canvas. All geometry is in meters; the view transform only maps meters <-> pixels.
 * Drags compute a candidate floor through the validated command layer on every move (live preview)
 * and commit a single undoable command on release.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Floor, ID, Opening, Vec2, Wall } from '../../../../packages/shared-types/src/index';
import { GeometryError } from '../../../../packages/shared-types/src/index';
import {
  addAnnotation, addDimension, addFurniture, addOpening, addPartitionWall, addRoom, deleteEntity, dist, formatLength, furnitureCorners, insertCorner,
  moveRoom, moveVertex, moveWall, norm, openingGeometry, perp, pointInPolygon, projectOnSegment, roomPoints, sub, updateFurniture, updateOpening, updateWall,
  wallEnds, rotateRoom, objectToWallDistance, addCeilingDrop, updateCeilingDrop, ceilingAbove, deleteCorner, mergeWallsAt, signedArea, polygonArea, formatArea, bbox, parseLength,
  closeWallLoop, wallLoopAt, openingOffsets, addPhoto, add, scale,
} from '../../../../packages/geometry/src/index';
import { buildDrawing, drawingBounds, type Layer } from '../../../../packages/cad-io/src/drawing';
import { catalogById } from '../../../../packages/shared-types/src/catalog';
import { editFloor, getState, redo, select, setState, setTool, toast, undo, useStore, type LayerKey } from '../store';
import { useT } from '../i18n';
import { paintPrims, toScreen, toWorld, type ViewXf } from './paint';
import { setCanvasLaserHandler } from '../laser';
import { CameraDialog } from '../components/CameraDialog';

type Hit =
  | { type: 'vertex'; id: ID }
  | { type: 'opening'; id: ID }
  | { type: 'furniture'; id: ID }
  | { type: 'rotate-handle'; id: ID }
  | { type: 'resize-handle'; id: ID }
  | { type: 'wall'; id: ID; t: number }
  | { type: 'dimension'; id: ID }
  | { type: 'annotation'; id: ID }
  | { type: 'photo'; id: ID }
  | { type: 'ceiling'; id: ID }
  | { type: 'room'; id: ID };

interface Snap { p: Vec2; kind: 'none' | 'grid' | 'vertex' | 'midpoint' | 'wall' | 'angle'; guides: [Vec2, Vec2][] }

type Interaction =
  | { kind: 'pan'; sx: number; sy: number; ox: number; oy: number }
  | { kind: 'drag'; hit: Hit; start: Vec2; base: Floor; moved: boolean; label: string; extra?: Record<string, number> }
  | { kind: 'rect-room'; start: Vec2; sx: number; sy: number; moved: boolean; ceiling?: boolean }
  | { kind: 'marquee'; start: Vec2; sx: number; sy: number; additive: boolean };

const LAYER_MAP: Record<LayerKey, Layer[]> = { rooms: ['rooms'], walls: ['walls'], openings: ['doors', 'windows'], furniture: ['furniture'], ceilings: ['ceilings'], dimensions: ['dimensions'], text: ['text'], annotations: ['annotations'], reference: [] };

let clipboard: { kind: 'furniture'; items: Floor['furniture'][string][] } | { kind: 'room'; pts: Vec2[]; name: string; height: number } | null = null;

const imgCache = new Map<string, HTMLImageElement>();

export function Canvas2D({ floor, onCalibrate }: { floor: Floor; onCalibrate: (a: Vec2, b: Vec2) => void }) {
  const { t } = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tool = useStore((s) => s.tool);
  const selection = useStore((s) => s.selection);
  const settings = useStore((s) => s.project!.settings);
  const layers = useStore((s) => s.layers);
  const theme = useStore((s) => s.theme);
  const pendingCatalogId = useStore((s) => s.pendingCatalogId);
  const lang = useStore((s) => s.lang);

  const view = useRef<ViewXf>({ scale: 60, ox: 200, oy: 150 });
  const inter = useRef<Interaction | null>(null);
  const [preview, setPreview] = useState<Floor | null>(null);
  const [poly, setPoly] = useState<Vec2[]>([]);
  const [wallStart, setWallStart] = useState<Vec2 | null>(null);
  const [dimStart, setDimStart] = useState<Vec2 | null>(null);
  const [calib, setCalib] = useState<Vec2[]>([]);
  const [hover, setHover] = useState<{ world: Vec2; snap: Snap; hit: Hit | null } | null>(null);
  const [marquee, setMarquee] = useState<{ a: Vec2; b: Vec2 } | null>(null);
  const [typed, setTyped] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number; hit: Hit | null; world: Vec2 } | null>(null);
  const [camera, setCamera] = useState<Vec2 | null>(null);   // where a photo about to be taken will be pinned
  const [dragError, setDragError] = useState<string | null>(null);
  const [, force] = useState(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; cx: number; cy: number } | null>(null);
  const space = useRef(false);
  const fitted = useRef<string | null>(null);
  // touch / Apple Pencil support
  const ptype = useRef<string>('mouse');
  const longPress = useRef<{ timer: ReturnType<typeof setTimeout> | null; sx: number; sy: number; fired: boolean }>({ timer: null, sx: 0, sy: 0, fired: false });
  const [barLen, setBarLen] = useState('');
  const coarse = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
  const touchK = () => (ptype.current === 'touch' ? 2.2 : 1);
  /** options for addPartitionWall based on the active tool (wall vs balcony railing) */
  const partOpts = () => (getState().tool === 'railing' ? { kind: 'railing' as const } : {});

  const shown = preview ?? floor;
  const assets = useStore((s) => s.project!.assets);
  const prims = useMemo(() => buildDrawing(shown, { unit: settings.unit, precision: settings.precision, assets, measure: settings.measure }), [shown, settings.unit, settings.precision, settings.measure, assets]);
  const hidden = useMemo(() => {
    const h = new Set<Layer>();
    (Object.keys(layers) as LayerKey[]).forEach((k) => { if (!layers[k]) LAYER_MAP[k].forEach((l) => h.add(l)); });
    return h;
  }, [layers]);

  // ------------------------------------------------------------------ view helpers
  const fit = () => {
    const c = canvasRef.current; if (!c) return;
    const b = Object.keys(shown.rooms).length || Object.keys(shown.walls).length ? drawingBounds(prims) : { minX: -1, minY: -1, maxX: 8, maxY: 6 };
    const w = c.clientWidth, h = c.clientHeight;
    const s = Math.min((w - 80) / Math.max(1, b.maxX - b.minX), (h - 80) / Math.max(1, b.maxY - b.minY));
    const scale = Math.max(5, Math.min(400, s));
    view.current = { scale, ox: w / 2 - ((b.minX + b.maxX) / 2) * scale, oy: h / 2 - ((b.minY + b.maxY) / 2) * scale };
    setState({ zoom: scale });
    force((n) => n + 1);
  };
  const fitRef = useRef(fit);
  fitRef.current = fit;
  useEffect(() => { if (fitted.current !== floor.id) { fitted.current = floor.id; requestAnimationFrame(() => fitRef.current()); } }, [floor.id]); // eslint-disable-line
  useEffect(() => {
    // deferred so the fit uses the geometry of the render that follows the triggering edit
    const onFit = () => requestAnimationFrame(() => fitRef.current());
    const onZoom = (e: Event) => { const k = (e as CustomEvent<number>).detail; const c = canvasRef.current!; zoomAt(c.clientWidth / 2, c.clientHeight / 2, k); };
    window.addEventListener('planforge:fit', onFit);
    window.addEventListener('planforge:zoom', onZoom);
    return () => { window.removeEventListener('planforge:fit', onFit); window.removeEventListener('planforge:zoom', onZoom); };
  });
  const zoomAt = (sx: number, sy: number, k: number) => {
    const v = view.current;
    const ns = Math.max(3, Math.min(800, v.scale * k));
    const w = toWorld(v, sx, sy);
    view.current = { scale: ns, ox: sx - w.x * ns, oy: sy - w.y * ns };
    setState({ zoom: ns });
    force((n) => n + 1);
  };

  // ------------------------------------------------------------------ snapping & hit-testing
  const px = (n: number) => n / view.current.scale;
  function snap(w: Vec2, o: { exclude?: ID; anchor?: Vec2 | null; alt?: boolean } = {}): Snap {
    const s = getState().project!.settings;
    if (!s.snap || o.alt) return { p: w, kind: 'none', guides: [] };
    const tol = px(10 * touchK());
    let best: { p: Vec2; d: number; kind: Snap['kind'] } | null = null;
    for (const v of Object.values(shown.vertices)) {
      if (v.id === o.exclude) continue;
      const d = dist(v, w);
      if (d < tol && (!best || d < best.d)) best = { p: { x: v.x, y: v.y }, d, kind: 'vertex' };
    }
    if (best) return { p: best.p, kind: best.kind, guides: [] };
    for (const wl of Object.values(shown.walls)) {
      if (o.exclude && (wl.a === o.exclude || wl.b === o.exclude)) continue;
      const { a, b } = wallEnds(shown, wl);
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (dist(m, w) < tol) return { p: m, kind: 'midpoint', guides: [] };
    }
    // alignment guides with existing corners
    const guides: [Vec2, Vec2][] = [];
    let p = { ...w };
    let ax = false, ay = false;
    const gtol = px(7);
    for (const v of Object.values(shown.vertices)) {
      if (v.id === o.exclude) continue;
      if (!ax && Math.abs(v.x - w.x) < gtol) { p.x = v.x; ax = true; guides.push([{ x: v.x, y: v.y }, { x: v.x, y: w.y }]); }
      if (!ay && Math.abs(v.y - w.y) < gtol) { p.y = v.y; ay = true; guides.push([{ x: v.x, y: v.y }, { x: w.x, y: v.y }]); }
    }
    if (o.anchor && !ax && !ay) {
      // angle snap to multiples of 45° relative to the previous point
      const d = sub(w, o.anchor), L = Math.hypot(d.x, d.y);
      const ang = Math.atan2(d.y, d.x), q = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
      if (L > 0 && Math.abs(ang - q) < (5 * Math.PI) / 180) {
        const g = view.current.scale >= 60 ? 0.01 : 0.05;
        const LL = Math.round(L / g) * g;
        return { p: { x: o.anchor.x + Math.cos(q) * LL, y: o.anchor.y + Math.sin(q) * LL }, kind: 'angle', guides: [[o.anchor, { x: o.anchor.x + Math.cos(q) * LL, y: o.anchor.y + Math.sin(q) * LL }]] };
      }
    }
    for (const wl of Object.values(shown.walls)) {
      if (o.exclude && (wl.a === o.exclude || wl.b === o.exclude)) continue;
      const { a, b } = wallEnds(shown, wl);
      const pr = projectOnSegment(w, a, b);
      if (pr.distance < px(6) && !ax && !ay) return { p: pr.point, kind: 'wall', guides: [] };
    }
    const g = view.current.scale >= 120 ? 0.01 : view.current.scale >= 40 ? 0.05 : 0.1;
    if (!ax) p.x = Math.round(p.x / g) * g;
    if (!ay) p.y = Math.round(p.y / g) * g;
    p = { x: +p.x.toFixed(6), y: +p.y.toFixed(6) };
    return { p, kind: ax || ay ? 'vertex' : 'grid', guides };
  }

  function hitTest(w: Vec2, f: Floor = shown, opts: { wallsOnly?: boolean; vertices?: boolean } = {}): Hit | null {
    const tol = px(7 * touchK());
    if (opts.wallsOnly) {
      let best: { id: ID; t: number; d: number } | null = null;
      for (const wl of Object.values(f.walls)) {
        const { a, b } = wallEnds(f, wl);
        const pr = projectOnSegment(w, a, b);
        const d = pr.distance - wl.thickness / 2;
        if (d < tol * 2 && (!best || d < best.d)) best = { id: wl.id, t: pr.t * dist(a, b), d };
      }
      return best ? { type: 'wall', id: best.id, t: best.t } : null;
    }
    const sel = getState().selection;
    if (sel.length === 1 && f.furniture[sel[0]]) {
      const fu = f.furniture[sel[0]];
      const { rot, res } = furnitureHandles(fu);
      if (dist(rot, w) < tol * 1.4) return { type: 'rotate-handle', id: fu.id };
      if (dist(res, w) < tol * 1.4) return { type: 'resize-handle', id: fu.id };
    }
    if (opts.vertices !== false) for (const v of Object.values(f.vertices)) if (dist(v, w) < tol) return { type: 'vertex', id: v.id };
    for (const o of Object.values(f.openings)) {
      const g = openingGeometry(f, o);
      if (projectOnSegment(w, g.start, g.end).distance < g.wall.thickness / 2 + tol) return { type: 'opening', id: o.id };
    }
    const furn = Object.values(f.furniture);
    for (let i = furn.length - 1; i >= 0; i--) if (pointInPolygon(w, furnitureCorners(furn[i]))) return { type: 'furniture', id: furn[i].id };
    for (const ph of Object.values(f.photos ?? {})) if (dist(ph, w) < Math.max(0.3, tol)) return { type: 'photo', id: ph.id };
    for (const a of Object.values(f.annotations)) if (dist(a, w) < Math.max(0.3, tol)) return { type: 'annotation', id: a.id };
    if (getState().layers.ceilings) for (const c of Object.values(f.ceilingDrops ?? {})) if (pointInPolygon(w, furnitureCorners(c))) return { type: 'ceiling', id: c.id };
    for (const d of Object.values(f.dimensions)) {
      const n = perp(norm(sub(d.b, d.a)));
      const a = { x: d.a.x + n.x * d.offset, y: d.a.y + n.y * d.offset }, b = { x: d.b.x + n.x * d.offset, y: d.b.y + n.y * d.offset };
      if (projectOnSegment(w, a, b).distance < tol) return { type: 'dimension', id: d.id };
    }
    for (const wl of Object.values(f.walls)) {
      const { a, b } = wallEnds(f, wl);
      const pr = projectOnSegment(w, a, b);
      if (pr.distance < wl.thickness / 2 + tol * 0.6) return { type: 'wall', id: wl.id, t: pr.t * dist(a, b) };
    }
    const rooms = Object.values(f.rooms).sort((x, y) => polygonArea(roomPoints(f, x)) - polygonArea(roomPoints(f, y)));
    for (const r of rooms) if (pointInPolygon(w, roomPoints(f, r))) return { type: 'room', id: r.id };
    return null;
  }

  function furnitureHandles(fu: Floor['furniture'][string]) {
    const r = (fu.rotation * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
    const L = (x: number, y: number) => ({ x: fu.x + x * c - y * s, y: fu.y + x * s + y * c });
    return { rot: L(0, -fu.depth / 2 - px(22)), res: L(fu.width / 2, fu.depth / 2) };
  }

  // ------------------------------------------------------------------ commands
  const tryCmd = (fn: () => Floor): Floor | null => {
    try { const f = fn(); setDragError(null); return f; }
    catch (e) { if (e instanceof GeometryError) { setDragError(e.message); return null; } throw e; }
  };

  function placeOpening(kind: Opening['kind'], w: Vec2) {
    const h = hitTest(w, floor, { wallsOnly: true });
    if (!h || h.type !== 'wall') { toast(t('hintOpening'), 'error'); return; }
    const width = getState().openingDefaults[kind];
    let newId: ID | null = null;
    const ok = editFloor(`Add ${kind}`, (f) => { const r = addOpening(f, h.id, kind, h.t, { width }); newId = r.openingId; return r.floor; });
    if (ok && newId) { select([newId]); setTool('select'); }
  }

  function finishPolygon(pts: Vec2[]) {
    if (pts.length < 3) return;
    let id: ID | null = null;
    const ok = editFloor('Draw room', (f) => { const r = addRoom(f, pts, { name: `${lang === 'he' ? 'חדר' : 'Room'} ${Object.keys(f.rooms).length + 1}` }); id = r.roomId; return r.floor; });
    setPoly([]);
    if (ok && id) select([id]);
  }

  const roomName = (f: Floor) => `${lang === 'he' ? 'חדר' : 'Room'} ${Object.keys(f.rooms).length + 1}`;

  /**
   * Draw the next wall of the chain. When that wall closes a ring of drawn walls the enclosed area
   * becomes a room right away (and the chain ends); the walls are kept, so their thickness and
   * railing settings carry into the room. Used by the pointer, the keyboard, the length bar and the
   * laser, so closing works the same way however the corner was placed.
   */
  function drawWallTo(p: Vec2, suffix = '') {
    const start = wallStart;
    if (!start) { setWallStart(p); return; }
    if (dist(start, p) < 0.05) return;
    let roomId: ID | null = null;
    const ok = editFloor((getState().tool === 'railing' ? 'Draw railing' : 'Draw wall') + suffix, (f) => {
      const r = addPartitionWall(f, start, p, undefined, partOpts());
      const closed = closeWallLoop(r.floor, r.wallId, { name: roomName(r.floor) });
      if (!closed) return r.floor;
      roomId = closed.roomId;
      return closed.floor;
    });
    if (!ok) return;
    if (roomId) { setWallStart(null); setTyped(''); setBarLen(''); select([roomId]); toast(t('roomClosed')); }
    else setWallStart(p);
  }

  /** Make a room out of the ring of drawn walls this wall belongs to (context menu). */
  function closeLoopAt(wallId: ID) {
    let id: ID | null = null;
    let noLoop = false;
    const ok = editFloor('Close room', (f) => {
      const r = closeWallLoop(f, wallId, { name: roomName(f) });
      if (!r) { noLoop = true; return f; }
      id = r.roomId;
      return r.floor;
    });
    if (noLoop) { toast(t('noLoop'), 'error'); return; }
    if (ok && id) { select([id]); toast(t('roomClosed')); }
  }

  function deleteSelection() {
    const ids = getState().selection;
    if (!ids.length) return;
    editFloor('Delete', (f) => ids.reduce((acc, id) => (acc.rooms[id] || acc.furniture[id] || acc.openings[id] || acc.walls[id] || acc.vertices[id] || acc.dimensions[id] || acc.annotations[id] ? deleteEntity(acc, id) : acc), f));
    select([]);
  }

  function duplicateSelection(offset = 0.5) {
    const ids = getState().selection;
    const created: ID[] = [];
    editFloor('Duplicate', (f) => {
      let g = f;
      for (const id of ids) {
        if (g.furniture[id]) { const { id: _old, ...rest } = g.furniture[id]; void _old; const r = addFurniture(g, { ...rest, x: rest.x + offset, y: rest.y + offset }); g = r.floor; created.push(r.id); }
        else if (g.rooms[id]) {
          const pts = roomPoints(g, g.rooms[id]); const bb = bbox(pts); const dx = bb.maxX - bb.minX + offset;
          const r = addRoom(g, pts.map((p) => ({ x: p.x + dx, y: p.y })), { name: `${g.rooms[id].name} (2)`, height: g.rooms[id].height }); g = r.floor; created.push(r.roomId);
        }
      }
      return g;
    });
    if (created.length) select(created);
  }

  function rotateSelection(deg: number) {
    const ids = getState().selection;
    editFloor('Rotate', (f) => ids.reduce((g, id) => (g.furniture[id] ? updateFurniture(g, id, { rotation: (g.furniture[id].rotation + deg + 360) % 360 }) : g.rooms[id] ? rotateRoom(g, id, deg) : g), f));
  }

  function nudge(dx: number, dy: number) {
    const ids = getState().selection;
    editFloor('Nudge', (f) => ids.reduce((g, id) => (g.furniture[id] ? updateFurniture(g, id, { x: g.furniture[id].x + dx, y: g.furniture[id].y + dy }) : g.rooms[id] ? moveRoom(g, id, dx, dy) : g), f));
  }

  // ------------------------------------------------------------------ keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (e.type === 'keyup') { if (e.key === ' ') space.current = false; return; }
      if (e.key === ' ') { space.current = true; e.preventDefault(); return; }
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); redo(); return; }
      if (mod && k === 'c') {
        const ids = getState().selection; const f = floor;
        const fs = ids.filter((id) => f.furniture[id]).map((id) => f.furniture[id]);
        if (fs.length) clipboard = { kind: 'furniture', items: fs };
        else if (ids.length === 1 && f.rooms[ids[0]]) clipboard = { kind: 'room', pts: roomPoints(f, f.rooms[ids[0]]), name: f.rooms[ids[0]].name, height: f.rooms[ids[0]].height };
        return;
      }
      if (mod && k === 'v' && clipboard) {
        e.preventDefault();
        const cb = clipboard; const created: ID[] = [];
        editFloor('Paste', (f) => {
          let g = f;
          if (cb.kind === 'furniture') for (const it of cb.items) { const { id: _i, ...rest } = it; void _i; const r = addFurniture(g, { ...rest, x: rest.x + 0.5, y: rest.y + 0.5 }); g = r.floor; created.push(r.id); }
          else { const bb = bbox(cb.pts); const dx = bb.maxX - bb.minX + 0.5; const r = addRoom(g, cb.pts.map((p) => ({ x: p.x + dx, y: p.y })), { name: `${cb.name} (copy)`, height: cb.height }); g = r.floor; created.push(r.roomId); }
          return g;
        });
        if (created.length) select(created);
        return;
      }
      if (mod && k === 'd') { e.preventDefault(); duplicateSelection(); return; }
      if (mod) return;
      if ((wallStart || poly.length) && (/^[0-9.,'"]$/.test(e.key) || (typed && (e.key === 'Backspace' || /^[cm ]$/.test(e.key))))) {
        setTyped((s) => (e.key === 'Backspace' ? s.slice(0, -1) : s + e.key)); e.preventDefault(); return;
      }
      if (e.key === 'Enter') {
        if (typed && (wallStart || poly.length) && hover) {
          const anchor = wallStart ?? poly[poly.length - 1];
          const L = parseLength(typed, getState().project!.settings.unit === 'ft-in' ? 'ft-in' : 'm');
          setTyped('');
          if (L && L > 0) {
            const d = norm(sub(hover.snap.p, anchor));
            const p = { x: +(anchor.x + d.x * L).toFixed(6), y: +(anchor.y + d.y * L).toFixed(6) };
            if (wallStart) drawWallTo(p);
            else setPoly((ps) => [...ps, p]);
          }
          return;
        }
        if (poly.length >= 3) finishPolygon(poly);
        return;
      }
      if (e.key === 'Escape') { setPoly([]); setWallStart(null); setDimStart(null); setCalib([]); setTyped(''); setMenu(null); inter.current = null; setPreview(null); if (getState().tool !== 'select') setTool('select'); else select([]); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); return; }
      if (k === 'r' && getState().selection.length) { rotateSelection(e.shiftKey ? -90 : 90); return; }
      if (e.key.startsWith('Arrow') && getState().selection.length) {
        e.preventDefault(); const s = e.shiftKey ? 0.1 : 0.01;
        nudge(e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0, e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0);
        return;
      }
      const map: Record<string, Parameters<typeof setTool>[0]> = { v: 'select', h: 'pan', r: 'room', w: 'wall', b: 'railing', d: 'door', n: 'window', m: 'dimension', e: 'eraser', c: 'ceiling' };
      if (map[k]) setTool(map[k]);
      if (k === 'g') setState((s) => ({ project: s.project && { ...s.project, settings: { ...s.project.settings, showGrid: !s.project.settings.showGrid } } }));
      if (k === 's') setState((s) => ({ project: s.project && { ...s.project, settings: { ...s.project.settings, snap: !s.project.settings.snap } } }));
      if (k === 'f') fit();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); };
  });

  // laser readings while drawing: next corner at the measured distance toward the cursor
  useEffect(() => {
    setCanvasLaserHandler((L) => {
      const anchor = wallStart ?? (poly.length ? poly[poly.length - 1] : null);
      if (!anchor) return false;
      if (!hover || ptype.current !== 'mouse') { setBarLen(String(+L.toFixed(4))); return true; }
      const d = norm(sub(hover.snap.p, anchor));
      if (!d.x && !d.y) { setBarLen(String(+L.toFixed(4))); return true; }
      const p = { x: +(anchor.x + d.x * L).toFixed(6), y: +(anchor.y + d.y * L).toFixed(6) };
      if (wallStart) drawWallTo(p, ' (laser)');
      else setPoly((ps) => [...ps, p]);
      return true;
    });
    return () => setCanvasLaserHandler(null);
  });

  /** place the next wall/room corner at the typed (or laser) length in a fixed direction — for touch, no keyboard */
  function placeDir(dx: number, dy: number) {
    const anchor = wallStart ?? (poly.length ? poly[poly.length - 1] : null);
    if (!anchor) return;
    const L = parseLength(barLen, getState().project!.settings.unit === 'ft-in' ? 'ft-in' : getState().project!.settings.unit);
    if (!L || L <= 0) { toast(t('enterLength'), 'error'); return; }
    const p = { x: +(anchor.x + dx * L).toFixed(6), y: +(anchor.y + dy * L).toFixed(6) };
    if (wallStart) drawWallTo(p);
    else if (poly.length >= 3 && dist(p, poly[0]) < 1e-3) finishPolygon(poly);
    else setPoly((ps) => [...ps, p]);
    setBarLen('');
  }

  // Safari: stop page-level pinch zoom / magnifier gestures over the plan
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const stop = (e: Event) => e.preventDefault();
    el.addEventListener('gesturestart', stop); el.addEventListener('gesturechange', stop);
    return () => { el.removeEventListener('gesturestart', stop); el.removeEventListener('gesturechange', stop); };
  }, []);

  // ------------------------------------------------------------------ pointer events
  const local = (e: { clientX: number; clientY: number }) => { const r = canvasRef.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  function onPointerDown(e: React.PointerEvent) {
    setMenu(null);
    const c = canvasRef.current!;
    try { c.setPointerCapture(e.pointerId); } catch { /* synthetic / already released pointer */ }
    const s = local(e);
    ptype.current = e.pointerType || 'mouse';
    pointers.current.set(e.pointerId, s);
    if (longPress.current.timer) clearTimeout(longPress.current.timer);
    longPress.current = { timer: null, sx: s.x, sy: s.y, fired: false };
    if (e.pointerType !== 'mouse' && pointers.current.size === 1) {
      // long-press = context menu (no right-click on iPad)
      longPress.current.timer = setTimeout(() => {
        longPress.current.timer = null;
        if (pointers.current.size !== 1) return;
        longPress.current.fired = true;
        inter.current = null; setPreview(null); setDragError(null);
        const w0 = toWorld(view.current, s.x, s.y);
        const hit = hitTest(w0);
        if (hit && !getState().selection.includes(hit.id)) select([hit.id]);
        setMenu({ x: s.x, y: s.y, hit, world: w0 });
        try { navigator.vibrate?.(15); } catch { /* not supported */ }
      }, 550);
    }
    if (pointers.current.size === 2) {
      if (longPress.current.timer) { clearTimeout(longPress.current.timer); longPress.current.timer = null; }
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      inter.current = { kind: 'pan', sx: pinch.current.cx, sy: pinch.current.cy, ox: view.current.ox, oy: view.current.oy };
      setPreview(null);
      return;
    }
    if (e.button === 2) return;
    const w = toWorld(view.current, s.x, s.y);
    if (e.button === 1 || tool === 'pan' || space.current) { inter.current = { kind: 'pan', sx: s.x, sy: s.y, ox: view.current.ox, oy: view.current.oy }; return; }
    const sn = snap(w, { anchor: (tool === 'wall' || tool === 'railing') ? wallStart : tool === 'room' ? poly[poly.length - 1] ?? null : null, alt: e.altKey });
    switch (tool) {
      case 'select': {
        const hit = hitTest(w);
        if (!hit) {
          if (e.pointerType === 'touch') { inter.current = { kind: 'pan', sx: s.x, sy: s.y, ox: view.current.ox, oy: view.current.oy }; select([]); return; }
          inter.current = { kind: 'marquee', start: w, sx: s.x, sy: s.y, additive: e.shiftKey }; if (!e.shiftKey) select([]); return;
        }
        const id = hit.id;
        if (hit.type !== 'vertex' && hit.type !== 'rotate-handle' && hit.type !== 'resize-handle') {
          const cur = getState().selection;
          if (e.shiftKey) select(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
          else if (!cur.includes(id)) select([id]);
        } else if (hit.type === 'vertex') select([id]);
        const labels: Record<Hit['type'], string> = { photo: 'Move photo', vertex: 'Move corner', opening: 'Move opening', furniture: 'Move object', 'rotate-handle': 'Rotate object', 'resize-handle': 'Resize object', wall: 'Move wall', dimension: 'Select', annotation: 'Move note', room: 'Move room', ceiling: 'Move lowered ceiling' };
        const extra: Record<string, number> = {};
        if (hit.type === 'furniture' || hit.type === 'resize-handle' || hit.type === 'rotate-handle') { const fu = floor.furniture[id]; Object.assign(extra, { x: fu.x, y: fu.y, w: fu.width, d: fu.depth, r: fu.rotation }); }
        if (hit.type === 'annotation') { const a = floor.annotations[id]; Object.assign(extra, { x: a.x, y: a.y }); }
        if (hit.type === 'photo') { const ph = floor.photos[id]; Object.assign(extra, { x: ph.x, y: ph.y }); }
        if (hit.type === 'ceiling') { const c = floor.ceilingDrops[id]; Object.assign(extra, { x: c.x, y: c.y }); }
        const room = getState().selection.length > 1 && hit.type === 'room';
        if (room) { /* multi-room drags are not supported; only select */ return; }
        inter.current = { kind: 'drag', hit, start: w, base: floor, moved: false, label: labels[hit.type], extra };
        return;
      }
      case 'room': inter.current = { kind: 'rect-room', start: sn.p, sx: s.x, sy: s.y, moved: false }; return;
      case 'ceiling': inter.current = { kind: 'rect-room', start: sn.p, sx: s.x, sy: s.y, moved: false, ceiling: true }; return;
      case 'railing':
      case 'wall': {
        if (!wallStart) { setWallStart(sn.p); return; }
        if (dist(wallStart, sn.p) < 0.05) { setWallStart(null); return; }
        drawWallTo(sn.p);
        return;
      }
      case 'door': case 'window': case 'opening': placeOpening(tool, w); return;
      case 'corner': {
        const h = hitTest(w, floor, { wallsOnly: true });
        if (h && h.type === 'wall') { let vid: ID | null = null; editFloor('Insert corner', (f) => { const r = insertCorner(f, h.id, h.t); vid = r.vertexId; return r.floor; }); if (vid) select([vid]); }
        return;
      }
      case 'dimension': {
        if (!dimStart) { setDimStart(sn.p); return; }
        let id: ID | null = null;
        editFloor('Add dimension', (f) => { const r = addDimension(f, dimStart, sn.p); id = r.id; return r.floor; });
        setDimStart(null); if (id) select([id]);
        return;
      }
      case 'furniture': {
        if (!pendingCatalogId || (!catalogById(pendingCatalogId) && !pendingCatalogId.startsWith('asset:'))) { toast(t('hintFurniture'), 'error'); return; }
        placeCatalog(pendingCatalogId, sn.p);
        return;
      }
      case 'annotation': {
        let id: ID | null = null;
        editFloor('Add note', (f) => { const r = addAnnotation(f, sn.p, lang === 'he' ? 'הערה' : 'Note'); id = r.id; return r.floor; });
        if (id) { select([id]); setTool('select'); }
        return;
      }
      case 'photo': { setCamera(sn.p); return; }
      case 'eraser': { const h = hitTest(w); if (h && h.type !== 'rotate-handle' && h.type !== 'resize-handle') editFloor('Erase', (f) => deleteEntity(f, h.id)); return; }
      case 'calibrate': {
        const pts = [...calib, w];
        if (pts.length === 2) { setCalib([]); onCalibrate(pts[0], pts[1]); setTool('select'); } else setCalib(pts);
        return;
      }
    }
  }

  function placeCatalog(catalogId: string, p: Vec2) {
    if (catalogId.startsWith('asset:')) {
      const a = getState().project!.assets?.[catalogId.slice(6)];
      if (!a) return;
      let nid: ID | null = null;
      const ok = editFloor(`Add ${a.name}`, (f) => {
        const r = addFurniture(f, { catalogId: 'custom', name: a.name, category: 'custom', x: p.x, y: p.y, rotation: 0, width: a.size.x, depth: a.size.z, height: a.size.y, elevation: 0, mirrored: false, layer: 'furniture', color: a.color, meta: { shape: 'model', modelId: a.id } });
        nid = r.id; return r.floor;
      });
      if (ok && nid) { select([nid]); setTool('select'); }
      return;
    }
    const item = catalogById(catalogId);
    if (!item) return;
    // objects that stand against a wall turn their back to the nearest one and sit on its face
    let at = p, rotation = 0;
    if (item.wall) {
      let best: { d: number; q: Vec2; n: Vec2 } | null = null;
      for (const wl of Object.values(floor.walls)) {
        const { a: wa, b: wb } = wallEnds(floor, wl);
        const pr = projectOnSegment(p, wa, wb);
        const face = pr.distance - wl.thickness / 2;
        if (face > 1.0 || (best && pr.distance >= best.d)) continue;
        const n = norm(sub(p, pr.point));
        if (!n.x && !n.y) continue;
        best = { d: pr.distance, q: add(pr.point, scale(n, wl.thickness / 2)), n };
      }
      if (best) {
        at = add(best.q, scale(best.n, item.depth / 2));
        rotation = (Math.atan2(best.n.x, -best.n.y) * 180) / Math.PI;
      }
    }
    let id: ID | null = null;
    const ok = editFloor(`Add ${item.name.en}`, (f) => {
      const r = addFurniture(f, { catalogId: item.id, name: item.name[lang], category: item.category, x: at.x, y: at.y, rotation: +rotation.toFixed(2), width: item.width, depth: item.depth, height: item.height, elevation: item.elevation ?? 0, mirrored: false, layer: 'furniture', color: item.color, meta: { shape: item.shape } });
      id = r.id; return r.floor;
    });
    if (ok && id) { select([id]); setTool('select'); }
  }

  function onPointerMove(e: React.PointerEvent) {
    const s = local(e);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, s);
    if (longPress.current.timer && Math.hypot(s.x - longPress.current.sx, s.y - longPress.current.sy) > 8) { clearTimeout(longPress.current.timer); longPress.current.timer = null; }
    if (longPress.current.fired) return;
    const it = inter.current;
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      view.current = { ...view.current, ox: view.current.ox + (cx - pinch.current.cx), oy: view.current.oy + (cy - pinch.current.cy) };
      zoomAt(cx, cy, d / pinch.current.d);
      pinch.current = { d, cx, cy };
      return;
    }
    const w = toWorld(view.current, s.x, s.y);
    const anchor = (tool === 'wall' || tool === 'railing') ? wallStart : tool === 'room' ? poly[poly.length - 1] ?? null : tool === 'dimension' ? dimStart : null;
    const exclude = it?.kind === 'drag' && it.hit.type === 'vertex' ? it.hit.id : undefined;
    const sn = snap(w, { exclude, anchor, alt: e.altKey });
    setHover({ world: w, snap: sn, hit: it ? null : (tool === 'select' || tool === 'eraser' ? hitTest(w) : ['door', 'window', 'opening', 'corner'].includes(tool) ? hitTest(w, floor, { wallsOnly: true }) : null) });
    setState({ cursor: sn.p });
    if (!it) return;
    if (it.kind === 'pan') { view.current = { ...view.current, ox: it.ox + (s.x - it.sx), oy: it.oy + (s.y - it.sy) }; force((n) => n + 1); return; }
    if (it.kind === 'rect-room') { if (Math.hypot(s.x - it.sx, s.y - it.sy) > 6) it.moved = true; force((n) => n + 1); return; }
    if (it.kind === 'marquee') { setMarquee({ a: it.start, b: w }); return; }
    if (it.kind !== 'drag') return;
    const base = it.base, h = it.hit, snapOn = getState().project!.settings.snap && !e.altKey;
    const q = (n: number) => (snapOn ? Math.round(n / 0.05) * 0.05 : Math.round(n * 1000) / 1000);
    const dx = w.x - it.start.x, dy = w.y - it.start.y;
    if (!it.moved && Math.hypot(dx, dy) * view.current.scale < 3) return;
    it.moved = true;
    let next: Floor | null = null;
    switch (h.type) {
      case 'vertex': next = tryCmd(() => moveVertex(base, h.id, sn.p)); break;
      case 'wall': {
        const wl = base.walls[h.id]; const { a, b } = wallEnds(base, wl); const n = perp(norm(sub(b, a)));
        next = tryCmd(() => moveWall(base, h.id, q(dx * n.x + dy * n.y)));
        break;
      }
      case 'room': next = tryCmd(() => moveRoom(base, h.id, q(dx), q(dy))); break;
      case 'furniture': next = tryCmd(() => updateFurniture(base, h.id, { x: +(it.extra!.x + q(dx)).toFixed(4), y: +(it.extra!.y + q(dy)).toFixed(4) })); break;
      case 'rotate-handle': {
        const fu = base.furniture[h.id];
        let ang = (Math.atan2(w.y - fu.y, w.x - fu.x) * 180) / Math.PI + 90;
        if (snapOn) ang = Math.round(ang / 15) * 15;
        next = tryCmd(() => updateFurniture(base, h.id, { rotation: ((ang % 360) + 360) % 360 }));
        break;
      }
      case 'resize-handle': {
        const fu = base.furniture[h.id]; const r = (-fu.rotation * Math.PI) / 180;
        const lx = (w.x - fu.x) * Math.cos(r) - (w.y - fu.y) * Math.sin(r), ly = (w.x - fu.x) * Math.sin(r) + (w.y - fu.y) * Math.cos(r);
        next = tryCmd(() => updateFurniture(base, h.id, { width: Math.max(0.05, q(Math.abs(lx) * 2)), depth: Math.max(0.05, q(Math.abs(ly) * 2)) }));
        break;
      }
      case 'opening': {
        const o = base.openings[h.id]; const wl = base.walls[o.wallId]; const { a, b } = wallEnds(base, wl);
        const pr = projectOnSegment(w, a, b); const L = dist(a, b);
        const tt = Math.min(L - o.width / 2, Math.max(o.width / 2, snapOn ? Math.round(pr.t * L / 0.01) * 0.01 : pr.t * L));
        next = tryCmd(() => updateOpening(base, h.id, { t: tt }));
        break;
      }
      case 'ceiling': next = tryCmd(() => updateCeilingDrop(base, h.id, { x: +(it.extra!.x + q(dx)).toFixed(4), y: +(it.extra!.y + q(dy)).toFixed(4) })); break;
      case 'annotation': next = tryCmd(() => ({ ...base, annotations: { ...base.annotations, [h.id]: { ...base.annotations[h.id], x: it.extra!.x + q(dx), y: it.extra!.y + q(dy) } } })); break;
      case 'photo': next = tryCmd(() => ({ ...base, photos: { ...base.photos, [h.id]: { ...base.photos[h.id], x: it.extra!.x + q(dx), y: it.extra!.y + q(dy) } } })); break;
      default: break;
    }
    if (next) setPreview(next);
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (longPress.current.timer) { clearTimeout(longPress.current.timer); longPress.current.timer = null; }
    if (longPress.current.fired) { if (!pointers.current.size) longPress.current.fired = false; inter.current = null; return; }
    const it = inter.current;
    inter.current = null;
    if (!it) return;
    const s = local(e);
    const w = toWorld(view.current, s.x, s.y);
    if (it.kind === 'drag') {
      if (it.moved && preview) { const p = preview; editFloor(it.label, () => p); }
      setPreview(null); setDragError(null);
      return;
    }
    if (it.kind === 'rect-room' && it.ceiling) {
      const b = snap(w, { alt: e.altKey }).p, a = it.start;
      if (!it.moved || Math.abs(b.x - a.x) < 0.05 || Math.abs(b.y - a.y) < 0.05) { toast(t('hintCeiling'), 'error'); return; }
      const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const top = ceilingAbove(floor, c);
      let id: ID | null = null;
      const ok = editFloor('Add lowered ceiling', (f) => { const r = addCeilingDrop(f, { ...c, width: Math.abs(b.x - a.x), depth: Math.abs(b.y - a.y), height: +Math.max(0.6, top - 0.3).toFixed(2), name: t('ceiling') }); id = r.id; return r.floor; });
      if (ok && id) { select([id]); setTool('select'); }
      return;
    }
    if (it.kind === 'rect-room') {
      const sn = snap(w, { alt: e.altKey });
      if (it.moved) {
        const a = it.start, b = sn.p;
        if (Math.abs(b.x - a.x) < 0.1 || Math.abs(b.y - a.y) < 0.1) { toast('Room is too small.', 'error'); return; }
        finishPolygon([{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }]);
      } else {
        const p = it.start;
        if (poly.length >= 3 && dist(p, poly[0]) < px(10)) { finishPolygon(poly); return; }
        setPoly((ps) => [...ps, p]);
      }
      return;
    }
    if (it.kind === 'marquee') {
      setMarquee(null);
      if (Math.hypot(s.x - it.sx, s.y - it.sy) < 4) return;
      const x0 = Math.min(it.start.x, w.x), x1 = Math.max(it.start.x, w.x), y0 = Math.min(it.start.y, w.y), y1 = Math.max(it.start.y, w.y);
      const inside = (p: Vec2) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
      const ids = [
        ...Object.values(floor.furniture).filter((f) => inside(f)).map((f) => f.id),
        ...Object.values(floor.rooms).filter((r) => roomPoints(floor, r).every(inside)).map((r) => r.id),
      ];
      select(it.additive ? [...new Set([...getState().selection, ...ids])] : ids);
    }
  }

  function onDoubleClick() { if (tool === 'room' && poly.length >= 3) finishPolygon(poly); }

  function onWheel(e: React.WheelEvent) {
    const s = local(e);
    zoomAt(s.x, s.y, Math.exp(-e.deltaY * 0.0015));
  }

  function onContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    const s = local(e);
    const w = toWorld(view.current, s.x, s.y);
    const hit = hitTest(w);
    if (hit && !getState().selection.includes(hit.id)) select([hit.id]);
    setMenu({ x: s.x, y: s.y, hit, world: w });
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/planforge-catalog');
    if (!id) return;
    const s = local(e);
    const sn = snap(toWorld(view.current, s.x, s.y));
    placeCatalog(id, sn.p);
  }

  // ------------------------------------------------------------------ rendering
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    let prev = { w: c.clientWidth, h: c.clientHeight };
    const ro = new ResizeObserver(() => {
      const w = c.clientWidth, h = c.clientHeight;
      // keep the world point at the centre of the canvas fixed when the stage is resized (e.g. 2D -> split)
      view.current = { ...view.current, ox: view.current.ox + (w - prev.w) / 2, oy: view.current.oy + (h - prev.h) / 2 };
      prev = { w, h };
      force((n) => n + 1);
    });
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth, H = c.clientHeight;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const dark = theme === 'dark';
    ctx.fillStyle = dark ? '#16181d' : '#fbfbfa';
    ctx.fillRect(0, 0, W, H);
    const v = view.current;
    c.dataset.view = JSON.stringify(v);
    // reference image
    const ref = shown.reference;
    if (ref && ref.visible && layers.reference) {
      let img = imgCache.get(ref.dataUrl);
      if (!img) { img = new Image(); img.onload = () => force((n) => n + 1); img.src = ref.dataUrl; imgCache.set(ref.dataUrl, img); }
      if (img.complete && img.naturalWidth) {
        ctx.save(); ctx.globalAlpha = ref.opacity;
        const o = toScreen(v, { x: ref.x, y: ref.y });
        ctx.translate(o.x, o.y); ctx.rotate((ref.rotation * Math.PI) / 180);
        ctx.drawImage(img, 0, 0, ref.pxWidth * ref.scale * v.scale, ref.pxHeight * ref.scale * v.scale);
        ctx.restore();
      }
    }
    // grid
    if (settings.showGrid) {
      const tl = toWorld(v, 0, 0), br = toWorld(v, W, H);
      const minor = v.scale >= 80 ? 0.1 : v.scale >= 25 ? 0.5 : 1;
      const line = (step: number, color: string) => {
        if (step * v.scale < 6) return;
        ctx.beginPath();
        for (let x = Math.floor(tl.x / step) * step; x <= br.x; x += step) { const sx = Math.round(x * v.scale + v.ox) + 0.5; ctx.moveTo(sx, 0); ctx.lineTo(sx, H); }
        for (let y = Math.floor(tl.y / step) * step; y <= br.y; y += step) { const sy = Math.round(y * v.scale + v.oy) + 0.5; ctx.moveTo(0, sy); ctx.lineTo(W, sy); }
        ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
      };
      line(minor, dark ? '#1f2228' : '#eeeeec');
      line(1, dark ? '#2a2e36' : '#dedcd7');
      const o = toScreen(v, { x: 0, y: 0 });
      ctx.strokeStyle = dark ? '#3c4250' : '#c9c5bd'; ctx.beginPath(); ctx.moveTo(o.x, 0); ctx.lineTo(o.x, H); ctx.moveTo(0, o.y); ctx.lineTo(W, o.y); ctx.stroke();
    }
    paintPrims(ctx, prims, v, { hidden, highlight: new Set(selection), dark });

    const S = (p: Vec2) => toScreen(v, p);
    // site photos: a camera pin where each was taken
    if (!hidden.has('text')) for (const ph of Object.values(shown.photos ?? {})) {
      const p = S(ph);
      const on = selection.includes(ph.id);
      ctx.save();
      ctx.beginPath(); ctx.arc(p.x, p.y, on ? 13 : 11, 0, Math.PI * 2);
      ctx.fillStyle = on ? '#1d7cf2' : dark ? '#1f2329' : '#fff';
      ctx.strokeStyle = '#1d7cf2'; ctx.lineWidth = 1.6; ctx.fill(); ctx.stroke();
      ctx.strokeStyle = on ? '#fff' : '#1d7cf2'; ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.rect(p.x - 5.5, p.y - 3.5, 11, 8);
      ctx.moveTo(p.x - 2, p.y - 3.5); ctx.lineTo(p.x - 1, p.y - 5.5); ctx.lineTo(p.x + 1.6, p.y - 5.5); ctx.lineTo(p.x + 2.6, p.y - 3.5);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x, p.y + 0.6, 2.2, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    // the selected opening shows the two distances you measure on site: corner to its near side,
    // and its far side to the next corner (screen only — never in an export)
    for (const id of selection) {
      const op = shown.openings[id];
      if (!op) continue;
      const g = openingGeometry(shown, op);
      const off = openingOffsets(shown, op, settings.measure);
      const at = (d: number) => ({ x: g.a.x + g.dir.x * d, y: g.a.y + g.dir.y * d });
      const n = perp(g.dir);
      const pairs: [Vec2, Vec2, number][] = [
        [at(off.from), g.start, off.start],
        [g.end, at(off.to), off.end],
      ];
      ctx.save();
      ctx.strokeStyle = '#1d7cf2'; ctx.fillStyle = '#1d7cf2'; ctx.lineWidth = 1; ctx.font = '11px system-ui'; ctx.textAlign = 'center';
      for (const [p0, p1, value] of pairs) {
        if (!(value > 0.001)) continue;
        const o0 = S({ x: p0.x + n.x * 0.35, y: p0.y + n.y * 0.35 }), o1 = S({ x: p1.x + n.x * 0.35, y: p1.y + n.y * 0.35 });
        ctx.beginPath(); ctx.moveTo(o0.x, o0.y); ctx.lineTo(o1.x, o1.y);
        const t0 = S(p0), t1 = S(p1);
        ctx.moveTo(t0.x, t0.y); ctx.lineTo(o0.x, o0.y); ctx.moveTo(t1.x, t1.y); ctx.lineTo(o1.x, o1.y);
        ctx.stroke();
        const mid = { x: (o0.x + o1.x) / 2, y: (o0.y + o1.y) / 2 };
        const label = formatLength(value, settings.unit, settings.precision);
        const w = ctx.measureText(label).width;
        ctx.fillStyle = dark ? '#15171c' : '#fff'; ctx.fillRect(mid.x - w / 2 - 3, mid.y - 8, w + 6, 14);
        ctx.fillStyle = '#1d7cf2'; ctx.fillText(label, mid.x, mid.y + 3);
      }
      ctx.restore();
    }
    // measured walls carry a small padlock at their midpoint (screen only — never in an export)
    if (!hidden.has('walls')) for (const w of Object.values(shown.walls)) {
      if (!w.locked) continue;
      const { a, b } = wallEnds(shown, w);
      const c = S({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      const n = perp(norm(sub(b, a)));
      const x = c.x + n.x * 13, y = c.y + n.y * 13;
      ctx.strokeStyle = '#e8590c'; ctx.fillStyle = dark ? '#15171c' : '#fff'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.rect(x - 4, y - 1, 8, 7); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y - 1, 2.6, Math.PI, 0); ctx.stroke();
    }
    // selection handles
    const handle = (p: Vec2, color = '#1d7cf2', size = coarse ? 13 : 7) => { const s = S(p); ctx.fillStyle = '#fff'; ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.fillRect(s.x - size / 2, s.y - size / 2, size, size); ctx.strokeRect(s.x - size / 2, s.y - size / 2, size, size); };
    for (const id of selection) {
      const r = shown.rooms[id]; if (r) roomPoints(shown, r).forEach((p) => handle(p));
      const vv = shown.vertices[id]; if (vv) handle(vv, '#e8590c', 9);
      const fu = shown.furniture[id];
      if (fu && selection.length === 1) {
        const { rot, res } = furnitureHandles(fu);
        const top = S({ x: (furnitureCorners(fu)[0].x + furnitureCorners(fu)[1].x) / 2, y: (furnitureCorners(fu)[0].y + furnitureCorners(fu)[1].y) / 2 });
        const rs = S(rot);
        ctx.strokeStyle = '#1d7cf2'; ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(rs.x, rs.y); ctx.stroke();
        ctx.beginPath(); ctx.arc(rs.x, rs.y, 5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
        handle(res);
        const dw = objectToWallDistance(shown, fu.id);
        if (isFinite(dw.distance)) { const s = S(fu); ctx.fillStyle = '#1d7cf2'; ctx.font = '11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`↔ ${formatLength(dw.distance, settings.unit, settings.precision)}`, s.x, s.y + 4); }
      }
      const w = shown.walls[id];
      if (w) { const { a, b } = wallEnds(shown, w); handle(a); handle(b); }
    }
    // hover
    if (hover?.hit && !inter.current) {
      const h = hover.hit;
      ctx.strokeStyle = 'rgba(29,124,242,0.6)'; ctx.lineWidth = 2;
      if (h.type === 'vertex') { const s = S(shown.vertices[h.id]); ctx.beginPath(); ctx.arc(s.x, s.y, 7, 0, Math.PI * 2); ctx.stroke(); }
      else if (h.type === 'wall' && shown.walls[h.id]) {
        const wl = shown.walls[h.id] as Wall; const { a, b } = wallEnds(shown, wl); const p0 = S(a), p1 = S(b);
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
        if (['door', 'window', 'opening'].includes(tool)) {
          const width = getState().openingDefaults[tool as 'door'];
          const d = norm(sub(b, a)), t0 = Math.min(dist(a, b) - width / 2, Math.max(width / 2, h.t));
          const g0 = S({ x: a.x + d.x * (t0 - width / 2), y: a.y + d.y * (t0 - width / 2) }), g1 = S({ x: a.x + d.x * (t0 + width / 2), y: a.y + d.y * (t0 + width / 2) });
          ctx.strokeStyle = tool === 'window' ? '#2a9d8f' : '#3a6ea5'; ctx.lineWidth = Math.max(4, wl.thickness * v.scale); ctx.beginPath(); ctx.moveTo(g0.x, g0.y); ctx.lineTo(g1.x, g1.y); ctx.stroke();
        }
        if (tool === 'corner') { const d = norm(sub(b, a)); handle({ x: a.x + d.x * h.t, y: a.y + d.y * h.t }, '#e8590c'); }
      }
    }
    // snapping indicator + guides
    if (hover && hover.snap.kind !== 'none' && tool !== 'select' && tool !== 'pan') {
      ctx.setLineDash([4, 4]); ctx.strokeStyle = '#e8590c'; ctx.lineWidth = 1;
      for (const [a, b] of hover.snap.guides) { const p0 = S(a), p1 = S(b); ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); }
      ctx.setLineDash([]);
      const s = S(hover.snap.p);
      ctx.strokeStyle = '#e8590c'; ctx.beginPath();
      if (hover.snap.kind === 'vertex') ctx.rect(s.x - 5, s.y - 5, 10, 10); else if (hover.snap.kind === 'midpoint') { ctx.moveTo(s.x, s.y - 6); ctx.lineTo(s.x + 6, s.y + 5); ctx.lineTo(s.x - 6, s.y + 5); ctx.closePath(); } else { ctx.moveTo(s.x - 5, s.y); ctx.lineTo(s.x + 5, s.y); ctx.moveTo(s.x, s.y - 5); ctx.lineTo(s.x, s.y + 5); }
      ctx.stroke();
    }
    // in-progress tools
    const label = (p: Vec2, text: string) => { const s = S(p); ctx.font = '12px system-ui'; const w = ctx.measureText(text).width; ctx.fillStyle = 'rgba(29,124,242,0.95)'; ctx.fillRect(s.x + 10, s.y - 22, w + 10, 18); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, s.x + 15, s.y - 13); };
    const fmt = (m: number) => formatLength(m, settings.unit, settings.precision);
    const it = inter.current;
    if (it?.kind === 'rect-room' && it.moved && hover) {
      const a = it.start, b = hover.snap.p, p0 = S(a), p1 = S(b);
      ctx.fillStyle = it.ceiling ? 'rgba(156,54,181,0.12)' : 'rgba(29,124,242,0.12)'; ctx.strokeStyle = it.ceiling ? '#9c36b5' : '#1d7cf2'; ctx.lineWidth = 2;
      ctx.fillRect(Math.min(p0.x, p1.x), Math.min(p0.y, p1.y), Math.abs(p1.x - p0.x), Math.abs(p1.y - p0.y));
      ctx.strokeRect(Math.min(p0.x, p1.x), Math.min(p0.y, p1.y), Math.abs(p1.x - p0.x), Math.abs(p1.y - p0.y));
      label(b, `${fmt(Math.abs(b.x - a.x))} × ${fmt(Math.abs(b.y - a.y))} = ${formatArea(Math.abs((b.x - a.x) * (b.y - a.y)), settings.unit, settings.precision)}`);
    }
    if (poly.length) {
      const pts = hover ? [...poly, hover.snap.p] : poly;
      ctx.strokeStyle = '#1d7cf2'; ctx.lineWidth = 2; ctx.beginPath();
      pts.forEach((p, i) => { const s = S(p); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); }); ctx.stroke();
      poly.forEach((p) => handle(p));
      if (hover) label(hover.snap.p, `${typed ? `⌨ ${typed}` : fmt(dist(poly[poly.length - 1], hover.snap.p))}${pts.length >= 3 ? ` · ${formatArea(Math.abs(signedArea(pts)), settings.unit, settings.precision)}` : ''}`);
    }
    if (wallStart && hover) {
      const p0 = S(wallStart), p1 = S(hover.snap.p);
      ctx.strokeStyle = tool === 'railing' ? '#1864ab' : '#2b2d31'; ctx.lineWidth = Math.max(2, (tool === 'railing' ? 0.05 : 0.1) * v.scale); ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
      label(hover.snap.p, typed ? `⌨ ${typed}` : fmt(dist(wallStart, hover.snap.p)));
    }
    if (dimStart && hover) {
      const p0 = S(dimStart), p1 = S(hover.snap.p);
      ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
      label(hover.snap.p, fmt(dist(dimStart, hover.snap.p)));
    }
    if (calib.length && hover) {
      const p0 = S(calib[0]), p1 = S(hover.world);
      ctx.strokeStyle = '#d6336c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); handle(calib[0], '#d6336c');
    }
    if (marquee) {
      const p0 = S(marquee.a), p1 = S(marquee.b);
      ctx.fillStyle = 'rgba(29,124,242,0.08)'; ctx.strokeStyle = '#1d7cf2'; ctx.setLineDash([5, 3]); ctx.lineWidth = 1;
      ctx.fillRect(Math.min(p0.x, p1.x), Math.min(p0.y, p1.y), Math.abs(p1.x - p0.x), Math.abs(p1.y - p0.y));
      ctx.strokeRect(Math.min(p0.x, p1.x), Math.min(p0.y, p1.y), Math.abs(p1.x - p0.x), Math.abs(p1.y - p0.y)); ctx.setLineDash([]);
    }
    // rulers
    const R = 18;
    ctx.fillStyle = dark ? 'rgba(30,33,40,0.95)' : 'rgba(245,244,241,0.95)';
    ctx.fillRect(0, 0, W, R); ctx.fillRect(0, 0, R, H);
    ctx.fillStyle = dark ? '#9aa0aa' : '#6b6f76'; ctx.strokeStyle = ctx.fillStyle; ctx.font = '9px system-ui'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    const step = [0.1, 0.5, 1, 2, 5, 10, 20, 50].find((s2) => s2 * v.scale >= 50) ?? 50;
    const tl = toWorld(v, 0, 0), br = toWorld(v, W, H);
    ctx.beginPath();
    for (let x = Math.floor(tl.x / step) * step; x <= br.x; x += step) { const sx = x * v.scale + v.ox; ctx.moveTo(sx, R - 6); ctx.lineTo(sx, R); ctx.fillText(`${+x.toFixed(2)}`, sx + 2, 2); }
    for (let y = Math.floor(tl.y / step) * step; y <= br.y; y += step) { const sy = y * v.scale + v.oy; ctx.moveTo(R - 6, sy); ctx.lineTo(R, sy); ctx.save(); ctx.translate(2, sy + 2); ctx.fillText(`${+y.toFixed(2)}`, 0, 0); ctx.restore(); }
    ctx.stroke();
    if (hover) { const s = S(hover.snap.p); ctx.strokeStyle = '#e8590c'; ctx.beginPath(); ctx.moveTo(s.x, 0); ctx.lineTo(s.x, R); ctx.moveTo(0, s.y); ctx.lineTo(R, s.y); ctx.stroke(); }
  });

  const hint = tool === 'photo' ? t('photoHint') : tool === 'railing' ? t('hintRailing') : tool === 'ceiling' ? t('hintCeiling') : tool === 'room' ? t(coarse ? 'hintRoomTouch' : 'hintRoom') : tool === 'wall' ? t(coarse ? 'hintWallTouch' : 'hintWall') : ['door', 'window', 'opening'].includes(tool) ? t('hintOpening') : tool === 'furniture' ? t('hintFurniture') : tool === 'dimension' ? t('hintDimension') : tool === 'corner' ? t('hintCorner') : tool === 'calibrate' ? t('calibrateHint') : null;
  const cursor = tool === 'pan' || inter.current?.kind === 'pan' ? 'grab' : tool === 'select' ? (hover?.hit ? (hover.hit.type === 'room' || hover.hit.type === 'furniture' || hover.hit.type === 'wall' ? 'move' : 'pointer') : 'default') : 'crosshair';

  const menuItems = (() => {
    if (!menu) return [];
    const h = menu.hit;
    const items: { label: string; run: () => void }[] = [];
    if (!h) { items.push({ label: t('room'), run: () => setTool('room') }); return items; }
    if (h.type === 'wall') {
      items.push({ label: t('door'), run: () => editFloor('Add door', (f) => addOpening(f, h.id, 'door', h.t, { width: getState().openingDefaults.door }).floor) });
      items.push({ label: t('window'), run: () => editFloor('Add window', (f) => addOpening(f, h.id, 'window', h.t, { width: getState().openingDefaults.window }).floor) });
      items.push({ label: t('corner'), run: () => editFloor('Insert corner', (f) => insertCorner(f, h.id, h.t).floor) });
      if (floor.walls[h.id]?.standalone && wallLoopAt(floor, h.id)) items.push({ label: t('makeRoom'), run: () => closeLoopAt(h.id) });
      if (floor.walls[h.id] && !floor.walls[h.id].standalone && floor.walls[h.id].kind !== 'open')
        items.push({ label: t('openSpace'), run: () => { if (editFloor('Open passage', (f) => updateWall(f, h.id, { kind: 'open' }))) toast(t('wallToOpen')); } });
    }
    if (h.type === 'vertex') { items.push({ label: t('deleteCorner'), run: () => editFloor('Delete corner', (f) => deleteCorner(f, h.id)) }); items.push({ label: t('mergeWalls'), run: () => editFloor('Merge walls', (f) => mergeWallsAt(f, h.id)) }); }
    if (h.type === 'room' || h.type === 'furniture') { items.push({ label: t('rotate90'), run: () => rotateSelection(90) }); items.push({ label: t('duplicate'), run: () => duplicateSelection() }); }
    if (h.type === 'opening') items.push({ label: t('flip'), run: () => editFloor('Flip', (f) => updateOpening(f, h.id, { side: f.openings[h.id].side === 1 ? -1 : 1 })) });
    if (h.type !== 'rotate-handle' && h.type !== 'resize-handle') items.push({ label: t('delete'), run: () => editFloor('Delete', (f) => deleteEntity(f, h.id)) });
    return items;
  })();

  return (
    <div ref={wrapRef} className="canvas-wrap" dir="ltr">
      <canvas
        ref={canvasRef} className="plan-canvas" data-testid="plan-canvas" style={{ cursor }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') { setHover(null); setState({ cursor: null }); } }}
        onDoubleClick={onDoubleClick} onWheel={onWheel} onContextMenu={onContextMenu}
        onDragOver={(e) => e.preventDefault()} onDrop={onDrop}
      />
      {hint && <div className="canvas-hint">{hint}{typed && <b> ⌨ {typed}</b>}</div>}
      {(poly.length > 0 || wallStart || dimStart || calib.length > 0) && (
        <div className="draw-bar" data-testid="draw-bar" onPointerDown={(e) => e.stopPropagation()}>
          {(poly.length > 0 || wallStart) && <>
            <input className="bar-len" data-testid="bar-length" inputMode="decimal" placeholder={t('length')} value={barLen} onChange={(e) => setBarLen(e.target.value)} />
            {([['→', 1, 0], ['↓', 0, 1], ['←', -1, 0], ['↑', 0, -1]] as const).map(([lbl, dx, dy]) => (
              <button key={lbl} className="btn" data-testid={`bar-dir-${dx}${dy}`} title={t('placeNext')} onClick={() => placeDir(dx, dy)}>{lbl}</button>
            ))}
          </>}
          {poly.length > 0 && <button className="btn" data-testid="bar-undo-point" onClick={() => setPoly((ps) => ps.slice(0, -1))}>↶ {t('undoPoint')}</button>}
          {poly.length >= 3 && <button className="btn primary" data-testid="bar-finish" onClick={() => finishPolygon(poly)}>✓ {t('finish')}</button>}
          {wallStart && <button className="btn primary" data-testid="bar-done" onClick={() => setWallStart(null)}>✓ {t('finish')}</button>}
          <button className="btn" data-testid="bar-cancel" onClick={() => { setPoly([]); setWallStart(null); setDimStart(null); setCalib([]); setTyped(''); setBarLen(''); }}>✕ {t('cancel')}</button>
        </div>
      )}
      {dragError && <div className="canvas-error" role="alert">{dragError}</div>}
      {camera && (
        <CameraDialog onClose={() => { setCamera(null); setTool('select'); }} onPhoto={(dataUrl) => {
          let id: ID | null = null;
          editFloor('Add photo', (f) => { const r = addPhoto(f, { name: '', dataUrl, x: camera.x, y: camera.y, subjectId: null, note: '' }); id = r.id; return r.floor; });
          if (id) select([id]);
        }} />
      )}
      {menu && menuItems.length > 0 && (
        <div className="ctx-menu" style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()}>
          {menuItems.map((m) => <button key={m.label} onClick={() => { setMenu(null); m.run(); }}>{m.label}</button>)}
        </div>
      )}
    </div>
  );
}

