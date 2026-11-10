import type { Floor, ID, Project } from '../../shared-types/src/index';
import { GeometryError } from '../../shared-types/src/index';
import { createFloor, uid } from './model';

/** Deep copy a floor assigning fresh UUIDs to every entity while preserving references. */
export function reidFloor(f: Floor, name?: string): Floor {
  const map = new Map<ID, ID>();
  const nid = (old: ID) => { let n = map.get(old); if (!n) { n = uid(); map.set(old, n); } return n; };
  const out: Floor = { ...structuredClone(f), id: uid(), name: name ?? f.name, vertices: {}, walls: {}, rooms: {}, openings: {}, furniture: {}, dimensions: {}, annotations: {}, ceilingDrops: {} };
  for (const v of Object.values(f.vertices)) out.vertices[nid(v.id)] = { ...v, id: nid(v.id) };
  for (const w of Object.values(f.walls)) out.walls[nid(w.id)] = { ...w, id: nid(w.id), a: nid(w.a), b: nid(w.b) };
  for (const r of Object.values(f.rooms)) out.rooms[nid(r.id)] = { ...r, id: nid(r.id), vertexIds: r.vertexIds.map(nid) };
  for (const o of Object.values(f.openings)) out.openings[nid(o.id)] = { ...o, id: nid(o.id), wallId: nid(o.wallId) };
  for (const x of Object.values(f.furniture)) out.furniture[nid(x.id)] = { ...structuredClone(x), id: nid(x.id) };
  for (const d of Object.values(f.dimensions)) out.dimensions[nid(d.id)] = { ...structuredClone(d), id: nid(d.id) };
  for (const a of Object.values(f.annotations)) out.annotations[nid(a.id)] = { ...a, id: nid(a.id) };
  for (const c of Object.values(f.ceilingDrops ?? {})) out.ceilingDrops[nid(c.id)] = { ...c, id: nid(c.id) };
  return out;
}

export function addFloor(p: Project, name?: string): { project: Project; floorId: ID } {
  const top = p.floors.reduce((m, f) => Math.max(m, f.elevation + f.defaultHeight), 0);
  const f = createFloor(name ?? `Floor ${p.floors.length + 1}`, p.floors.length ? top : 0);
  return { project: { ...p, floors: [...p.floors, f] }, floorId: f.id };
}

export function duplicateFloor(p: Project, floorId: ID): { project: Project; floorId: ID } {
  const src = p.floors.find((f) => f.id === floorId);
  if (!src) throw new GeometryError('missing', 'Floor not found');
  const top = p.floors.reduce((m, f) => Math.max(m, f.elevation + f.defaultHeight), 0);
  const copy = { ...reidFloor(src, `${src.name} (copy)`), elevation: top };
  return { project: { ...p, floors: [...p.floors, copy] }, floorId: copy.id };
}

export function removeFloor(p: Project, floorId: ID): Project {
  if (p.floors.length <= 1) throw new GeometryError('floor', 'A project needs at least one floor.');
  return { ...p, floors: p.floors.filter((f) => f.id !== floorId) };
}

export function updateFloorProps(p: Project, floorId: ID, patch: Partial<Pick<Floor, 'name' | 'elevation' | 'defaultHeight' | 'defaultWallThickness' | 'reference'>>): Project {
  if (patch.defaultHeight != null && !(patch.defaultHeight > 0)) throw new GeometryError('height', 'Height must be positive.');
  return { ...p, floors: p.floors.map((f) => (f.id === floorId ? { ...f, ...patch } : f)) };
}

export function replaceFloor(p: Project, floor: Floor): Project {
  return { ...p, floors: p.floors.map((f) => (f.id === floor.id ? floor : f)) };
}

export function duplicateProject(p: Project, name?: string): Project {
  const now = Date.now();
  return { ...structuredClone(p), id: uid(), name: name ?? `${p.name} (copy)`, createdAt: now, updatedAt: now, rev: 0, status: 'active', floors: p.floors.map((f) => reidFloor(f)) };
}
