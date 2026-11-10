/**
 * Laser measure integration. A reading is applied to the first target that accepts it:
 *  1. a focused length input (wall length, room dialog, opening width …)
 *  2. the 2D canvas while drawing a wall / room (places the next corner at that distance toward the cursor)
 *  3. the selected wall (sets its length)
 * Otherwise it is only shown as "last reading".
 */
import { useSyncExternalStore } from 'react';
import { BoschGlmConnection, type BtApi, type LaserStatus } from '../../../packages/scanning/src/bosch-glm';
import { setWallLength, toUnit, formatLength } from '../../../packages/geometry/src/index';
import { currentFloor, editFloor, getState, toast } from './store';

interface LaserState { status: LaserStatus; detail: string; device: string | null; last: { m: number; at: number; target: string } | null; log: string[] }
let st: LaserState = { log: [], status: typeof navigator !== 'undefined' && 'bluetooth' in navigator ? 'idle' : 'unsupported', detail: '', device: null, last: null };
const subs = new Set<() => void>();
const set = (p: Partial<LaserState>) => { st = { ...st, ...p }; subs.forEach((f) => f()); };
export const useLaser = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => st, () => st);

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

export function applyReading(m: number): string {
  const active = document.activeElement as HTMLInputElement | null;
  if (active && active.tagName === 'INPUT' && (active.dataset.laserCommit || active.inputMode === 'decimal')) { fillInput(active, m); return 'field'; }
  if (canvasHandler?.(m)) return 'drawing';
  const s = getState();
  const f = currentFloor(s);
  const wallId = s.selection.length === 1 && f?.walls[s.selection[0]] ? s.selection[0] : null;
  if (wallId && editFloor('Laser: wall length', (fl) => setWallLength(fl, wallId, m))) return 'wall';
  return 'none';
}

let conn: BoschGlmConnection | null = null;
export async function connectLaser() {
  const bt = (navigator as unknown as { bluetooth?: BtApi }).bluetooth;
  if (!bt) { set({ status: 'unsupported' }); return; }
  conn?.disconnect();
  set({ log: [] });
  conn = new BoschGlmConnection(bt, {
    onLog: (msg) => set({ log: [...st.log.slice(-20), `${new Date().toLocaleTimeString()} ${msg}`] }),
    onStatus: (status, detail) => set({ status, detail: detail ?? '', device: status === 'connected' ? detail ?? 'GLM' : status === 'idle' ? null : st.device }),
    onReading: (m) => {
      const target = applyReading(m);
      set({ last: { m, at: Date.now(), target } });
      const unit = getState().project?.settings.unit ?? 'm';
      toast(`📏 ${formatLength(m, unit, 3)}${target === 'none' ? ' — select a wall or click a length field to apply' : ''}`);
    },
  });
  await conn.connect();
}
export function disconnectLaser() { conn?.disconnect(); conn = null; }
