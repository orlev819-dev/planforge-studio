/**
 * Laser measure integration. A reading is applied to the first target that accepts it:
 *  1. a focused length input (wall length, room dialog, opening width …)
 *  2. the ARMED length field — the last one the user tapped, which stays armed after it loses focus
 *     (tapping the laser panel, or the device's own button, takes focus away on a tablet). Measuring
 *     a room's walls therefore works hands-free: the armed field moves on to the next wall after
 *     every reading, so Wall 1, Wall 2 … fill in the order they are measured.
 *  3. the 2D canvas while drawing a wall / room (places the next corner at that distance toward the cursor)
 *  4. the selected wall (sets its length)
 * Otherwise it is only shown as "last reading".
 */
import { useSyncExternalStore } from 'react';
import { BoschGlmConnection, type BtApi, type LaserStatus } from '../../../packages/scanning/src/bosch-glm';
import { setWallLength, toUnit, formatLength } from '../../../packages/geometry/src/index';
import { currentFloor, editFloor, getState, toast } from './store';

interface LaserState {
  status: LaserStatus; detail: string; device: string | null; last: { m: number; at: number; target: string } | null; log: string[];
  /** test-id of the length field the next reading goes to, and its label, for the panel */
  armed: string | null; armedLabel: string;
  /** move the aim to the next wall of the room after each reading */
  advance: boolean;
  /** heartbeats received: the meter talks to us even when no measurement arrives */
  beats: number;
}
const storedAdvance = () => { try { return localStorage.getItem('pf-laser-advance') !== '0'; } catch { return true; } };
let st: LaserState = {
  log: [], status: typeof navigator !== 'undefined' && 'bluetooth' in navigator ? 'idle' : 'unsupported', detail: '', device: null, last: null,
  armed: null, armedLabel: '', advance: typeof localStorage !== 'undefined' ? storedAdvance() : true, beats: 0,
};
const subs = new Set<() => void>();
const set = (p: Partial<LaserState>) => { st = { ...st, ...p }; subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const useLaser = () => useSyncExternalStore(subscribe, () => st, () => st);
/** test-id of the field the next reading will go to (drives the highlight on that field) */
export const useArmedField = () => useSyncExternalStore(subscribe, () => st.armed, () => null);

// ------------------------------------------------------------------ length fields that can receive a reading
export interface LaserField { label: () => string; commit: (m: number) => void }
const fields = new Map<string, LaserField>();

/** every LengthField with a test id registers itself here; returns the un-register callback */
export function registerLaserField(id: string, field: LaserField): () => void {
  fields.set(id, field);
  return () => {
    if (fields.get(id) !== field) return; // a newer instance took the id over
    fields.delete(id);
    if (st.armed === id) set({ armed: null, armedLabel: '' });
  };
}

/** aim the next reading at this field (called when the user taps it), or clear with null */
export function armLaserField(id: string | null) {
  const label = (id && fields.get(id)?.label()) || '';
  if (st.armed !== id || st.armedLabel !== label) set({ armed: id, armedLabel: label });
}

/** after a reading lands on a room's wall, move on to the next wall of that room */
function nextField(id: string): string {
  const m = /^room-wall-(\d+)$/.exec(id);
  if (!m || !st.advance) return id;
  const n = Number(m[1]);
  return fields.has(`room-wall-${n + 1}`) ? `room-wall-${n + 1}` : fields.has('room-wall-0') ? 'room-wall-0' : id;
}

/** walk the walls of a room reading by reading, or keep every reading on the same field */
export function setLaserAdvance(on: boolean) {
  set({ advance: on });
  try { localStorage.setItem('pf-laser-advance', on ? '1' : '0'); } catch { /* private mode */ }
}

/** the field a reading should go to when the user has not tapped one: follows the selection */
function defaultField(): string | null {
  const s = getState();
  const f = currentFloor(s);
  const id = s.selection.length === 1 ? s.selection[0] : null;
  if (!id || !f) return null;
  if (f.rooms[id]) return fields.has('room-wall-0') ? 'room-wall-0' : null;
  if (f.walls[id]) {
    const interior = s.project?.settings.measure === 'interior';
    if (interior && fields.has('wall-interior-length')) return 'wall-interior-length';
    return fields.has('wall-length') ? 'wall-length' : null;
  }
  return null;
}

/** label of the field the next reading will land in — the aimed one, or the selection's default */
export function aimLabel(): string {
  const id = st.armed && fields.has(st.armed) ? st.armed : defaultField();
  return (id && fields.get(id)?.label()) || '';
}

/** canvas drawing tools register here; return true if the reading was consumed */
let canvasHandler: ((m: number) => boolean) | null = null;
export const setCanvasLaserHandler = (h: ((m: number) => boolean) | null) => { canvasHandler = h; };

function fillInput(el: HTMLInputElement, m: number): boolean {
  const unit = getState().project?.settings.unit ?? 'm';
  const text = String(+toUnit(m, unit).toFixed(unit === 'mm' ? 1 : unit === 'cm' ? 2 : 4));
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(el, text);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  // LengthFields commit on blur; plain dialog inputs keep focus so the user can review and press Enter
  if (el.dataset.laserCommit) { el.blur(); requestAnimationFrame(() => el.focus()); }
  return true;
}

/** apply through the field's own commit, so the project's measure mode and validation apply */
function commitVia(id: string, m: number): string | null {
  const field = fields.get(id);
  if (!field) return null;
  const label = field.label();
  field.commit(m);
  armLaserField(nextField(id));
  return label;
}

export function applyReading(m: number): { target: string; label: string } {
  const active = document.activeElement as HTMLInputElement | null;
  if (active && active.tagName === 'INPUT' && (active.dataset.laserCommit || active.inputMode === 'decimal')) {
    const id = active.dataset.testid;
    const label = id ? commitVia(id, m) : null;
    if (label != null) return { target: 'field', label };
    fillInput(active, m);
    return { target: 'field', label: '' };
  }
  const armed = st.armed && fields.has(st.armed) ? st.armed : defaultField();
  if (armed) {
    const label = commitVia(armed, m);
    if (label != null) return { target: 'field', label };
  }
  if (canvasHandler?.(m)) return { target: 'drawing', label: '' };
  const s = getState();
  const f = currentFloor(s);
  const wallId = s.selection.length === 1 && f?.walls[s.selection[0]] ? s.selection[0] : null;
  if (wallId && editFloor('Laser: wall length', (fl) => setWallLength(fl, wallId, m))) return { target: 'wall', label: '' };
  return { target: 'none', label: '' };
}

let conn: BoschGlmConnection | null = null;
export async function connectLaser() {
  const bt = (navigator as unknown as { bluetooth?: BtApi }).bluetooth;
  if (!bt) { set({ status: 'unsupported' }); return; }
  conn?.disconnect();
  set({ log: [], beats: 0 });
  conn = new BoschGlmConnection(bt, {
    onLog: (msg) => set({ log: [...st.log.slice(-20), `${new Date().toLocaleTimeString()} ${msg}`] }),
    onHeartbeat: (n) => set({ beats: n }),
    onStatus: (status, detail) => set({ status, detail: detail ?? '', device: status === 'connected' ? detail ?? 'GLM' : status === 'idle' ? null : st.device }),
    onReading: (m) => {
      const { target, label } = applyReading(m);
      set({ last: { m, at: Date.now(), target } });
      const unit = getState().project?.settings.unit ?? 'm';
      const where = label ? ` → ${label}` : target === 'none' ? ' — tap a length field, or select a room or wall, to apply' : '';
      toast(`📏 ${formatLength(m, unit, 3)}${where}`);
    },
  });
  await conn.connect();
}
export function disconnectLaser() { conn?.disconnect(); conn = null; set({ beats: 0 }); }

/** take a measurement from the app, as if the meter's own button had been pressed */
export async function measureNow() {
  if (!conn) { toast('Connect the laser first', 'error'); return; }
  try { await conn.measure(); } catch (e) { toast(`Measure failed: ${(e as Error).message || e}`, 'error'); }
}
