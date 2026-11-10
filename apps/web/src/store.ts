/**
 * Application store (tiny external store + useSyncExternalStore). Every model change goes through
 * `editFloor` / `editProject`, which record an undoable history entry (label + before/after project)
 * and trigger debounced IndexedDB autosave. Geometry errors never mutate state; they surface as toasts.
 */
import { useSyncExternalStore } from 'react';
import type { Floor, ID, Project } from '../../../packages/shared-types/src/index';
import { GeometryError } from '../../../packages/shared-types/src/index';
import { createProject, addFloor, replaceFloor } from '../../../packages/geometry/src/index';
import { dbApi } from './db';
import type { Lang } from './i18n';

export type Tool = 'select' | 'pan' | 'room' | 'wall' | 'corner' | 'door' | 'window' | 'opening' | 'dimension' | 'furniture' | 'annotation' | 'eraser' | 'calibrate';
export type View = '2d' | '3d' | 'split';
export type Route = { page: 'dashboard' } | { page: 'editor'; projectId: ID } | { page: 'library' } | { page: 'reports' } | { page: 'settings' };
export type LayerKey = 'rooms' | 'walls' | 'openings' | 'furniture' | 'dimensions' | 'text' | 'annotations' | 'reference';

interface HistoryEntry { label: string; project: Project; floorId: ID | null }

export interface State {
  route: Route;
  projects: Project[];
  loaded: boolean;
  project: Project | null;
  floorId: ID | null;
  selection: ID[];
  tool: Tool;
  view: View;
  pendingCatalogId: string | null;
  past: HistoryEntry[];
  future: HistoryEntry[];
  save: 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
  toast: { kind: 'error' | 'info'; text: string; id: number } | null;
  lang: Lang;
  theme: 'light' | 'dark';
  layers: Record<LayerKey, boolean>;
  openingDefaults: { door: number; window: number; opening: number };
  cursor: { x: number; y: number } | null;
  zoom: number;
}

const prefs = (() => { try { return JSON.parse(localStorage.getItem('planforge.prefs') ?? '{}'); } catch { return {}; } })();

let state: State = {
  route: { page: 'dashboard' }, projects: [], loaded: false, project: null, floorId: null, selection: [], tool: 'select', view: '2d',
  pendingCatalogId: null, past: [], future: [], save: 'idle', toast: null,
  lang: prefs.lang === 'he' ? 'he' : 'en', theme: prefs.theme === 'dark' ? 'dark' : 'light',
  layers: { rooms: true, walls: true, openings: true, furniture: true, dimensions: true, text: true, annotations: true, reference: true },
  openingDefaults: { door: 0.8, window: 1.2, opening: 0.9 }, cursor: null, zoom: 60,
};

const listeners = new Set<() => void>();
export const getState = () => state;
export function setState(patch: Partial<State> | ((s: State) => Partial<State>)) {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  if ('lang' in p || 'theme' in p) try { localStorage.setItem('planforge.prefs', JSON.stringify({ lang: state.lang, theme: state.theme })); } catch { /* storage unavailable */ }
  listeners.forEach((l) => l());
}
export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => sel(state), () => sel(state));
}

let toastId = 0;
export function toast(text: string, kind: 'error' | 'info' = 'info') {
  const id = ++toastId;
  setState({ toast: { kind, text, id } });
  setTimeout(() => { if (state.toast?.id === id) setState({ toast: null }); }, kind === 'error' ? 5000 : 2500);
}

// ---------------------------------------------------------------- persistence
let saveTimer: ReturnType<typeof setTimeout> | null = null;
async function flushSave() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  const p = state.project;
  if (!p) return;
  setState({ save: 'saving' });
  try {
    await dbApi.putProject(p);
    setState((s) => ({ save: s.project === p ? 'saved' : s.save, projects: upsert(s.projects, p) }));
  } catch (e) {
    setState({ save: 'error' });
    toast(`Save failed: ${(e as Error).message}`, 'error');
  }
}
export const saveNow = flushSave;
function scheduleSave() {
  setState({ save: 'dirty' });
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 400);
}
const upsert = (list: Project[], p: Project) => (list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p]);

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => { if (state.save === 'dirty') void flushSave(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && state.save === 'dirty') void flushSave(); });
}

export async function loadProjects() {
  const projects = await dbApi.listProjects();
  setState({ projects, loaded: true });
}

export async function persistProject(p: Project) {
  await dbApi.putProject(p);
  setState((s) => ({ projects: upsert(s.projects, p), project: s.project?.id === p.id ? p : s.project }));
}

export async function removeProjectForever(id: ID) {
  await dbApi.deleteProject(id);
  setState((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
}

// ---------------------------------------------------------------- navigation
export function go(route: Route) {
  if (state.save === 'dirty') void flushSave();
  if (route.page === 'editor') {
    const p = state.projects.find((x) => x.id === route.projectId);
    if (!p) { toast('Project not found', 'error'); return; }
    setState({ route, project: p, floorId: p.floors[0]?.id ?? null, selection: [], past: [], future: [], tool: 'select', save: 'saved' });
    try { location.hash = `#/project/${p.id}`; } catch { /* ignore */ }
    return;
  }
  setState({ route, ...(route.page === 'dashboard' ? { project: null } : {}) });
  try { location.hash = route.page === 'dashboard' ? '#/' : `#/${route.page}`; } catch { /* ignore */ }
}

export async function newProject(name: string, address = '', description = ''): Promise<Project> {
  let p = createProject(name || 'Untitled project', { address, description });
  p = addFloor(p, 'Floor 1').project;
  await persistProject(p);
  return p;
}

// ---------------------------------------------------------------- editing
function commit(label: string, next: Project, floorId = state.floorId) {
  const cur = state.project!;
  const stamped: Project = { ...next, updatedAt: Date.now(), rev: cur.rev + 1 };
  setState((s) => ({ project: stamped, past: [...s.past.slice(-199), { label, project: cur, floorId: s.floorId }], future: [], floorId }));
  scheduleSave();
}

export function currentFloor(s: State = state): Floor | null {
  return s.project?.floors.find((f) => f.id === s.floorId) ?? s.project?.floors[0] ?? null;
}

/** Apply a floor command. Returns true on success. Errors leave the model untouched. */
export function editFloor(label: string, fn: (f: Floor) => Floor): boolean {
  const f = currentFloor();
  if (!state.project || !f) return false;
  try {
    const next = fn(f);
    if (next === f) return true;
    commit(label, replaceFloor(state.project, next));
    return true;
  } catch (e) {
    if (e instanceof GeometryError) { toast(e.message, 'error'); return false; }
    throw e;
  }
}

export function editProject(label: string, fn: (p: Project) => Project | { project: Project; floorId: ID }): boolean {
  if (!state.project) return false;
  try {
    const r = fn(state.project);
    if ('project' in r && 'floorId' in r && !('floors' in r)) commit(label, r.project, r.floorId);
    else commit(label, r as Project);
    return true;
  } catch (e) {
    if (e instanceof GeometryError) { toast(e.message, 'error'); return false; }
    throw e;
  }
}

export function undo() {
  const last = state.past[state.past.length - 1];
  if (!last || !state.project) return;
  setState((s) => ({ project: last.project, floorId: last.floorId, past: s.past.slice(0, -1), future: [{ label: last.label, project: s.project!, floorId: s.floorId }, ...s.future], selection: [] }));
  scheduleSave();
}
export function redo() {
  const nxt = state.future[0];
  if (!nxt || !state.project) return;
  setState((s) => ({ project: nxt.project, floorId: nxt.floorId, future: s.future.slice(1), past: [...s.past, { label: nxt.label, project: s.project!, floorId: s.floorId }], selection: [] }));
  scheduleSave();
}

export const select = (ids: ID[]) => setState({ selection: ids });
export const setTool = (tool: Tool) => setState({ tool, ...(tool !== 'furniture' ? { pendingCatalogId: null } : {}) });

// expose a read-only handle for automated end-to-end verification
if (typeof window !== 'undefined') (window as unknown as { __planforge: unknown }).__planforge = { getState };
