import { z } from 'zod';
import type { Project } from '../../shared-types/src/index';
import { validateFloor } from './commands';

const vec = z.object({ x: z.number().finite(), y: z.number().finite() });
const id = z.string().min(1);

export const FloorSchema = z.object({
  id, name: z.string(), elevation: z.number().finite(), defaultHeight: z.number().positive(), defaultWallThickness: z.number().positive(),
  vertices: z.record(z.string(), z.object({ id, x: z.number().finite(), y: z.number().finite() })),
  walls: z.record(z.string(), z.object({
    id, a: id, b: id, thickness: z.number().positive(), height: z.number().positive().nullable(), exterior: z.boolean(),
    exteriorManual: z.boolean(), material: z.string(), standalone: z.boolean(),
  })),
  rooms: z.record(z.string(), z.object({
    id, name: z.string(), vertexIds: z.array(id).min(3), height: z.number().positive(),
    floorMaterial: z.string(), wallMaterial: z.string(), ceilingMaterial: z.string(),
  })),
  openings: z.record(z.string(), z.object({
    id, wallId: id, kind: z.enum(['door', 'window', 'opening']), subtype: z.string(), t: z.number().finite(),
    width: z.number().positive(), height: z.number().positive(), sill: z.number().min(0), hinge: z.enum(['start', 'end']),
    side: z.union([z.literal(1), z.literal(-1)]), frameDepth: z.number().min(0), material: z.string(),
  })),
  furniture: z.record(z.string(), z.object({
    id, catalogId: z.string(), name: z.string(), category: z.string(), x: z.number().finite(), y: z.number().finite(), rotation: z.number().finite(),
    width: z.number().positive(), depth: z.number().positive(), height: z.number().positive(), elevation: z.number().finite(),
    mirrored: z.boolean(), layer: z.string(), color: z.string(), meta: z.record(z.string(), z.string()),
  })),
  dimensions: z.record(z.string(), z.object({ id, a: vec, b: vec, offset: z.number().finite() })),
  annotations: z.record(z.string(), z.object({ id, x: z.number().finite(), y: z.number().finite(), text: z.string() })),
  reference: z.object({
    dataUrl: z.string(), pxWidth: z.number().positive(), pxHeight: z.number().positive(), scale: z.number().positive(),
    x: z.number(), y: z.number(), rotation: z.number(), opacity: z.number().min(0).max(1), locked: z.boolean(), visible: z.boolean(), calibrated: z.boolean(),
  }).nullable(),
});

export const ProjectSchema = z.object({
  schemaVersion: z.literal(1), id, name: z.string(), address: z.string(), description: z.string(),
  status: z.enum(['active', 'archived', 'deleted']), isDemo: z.boolean(), createdAt: z.number(), updatedAt: z.number(), rev: z.number().int(),
  settings: z.object({ unit: z.enum(['mm', 'cm', 'm', 'ft-in']), precision: z.number().int().min(0).max(4), showGrid: z.boolean(), snap: z.boolean() }),
  floors: z.array(FloorSchema).min(1),
});

/** Parse + structurally validate + geometrically validate a project (e.g. JSON import). */
export function parseProject(data: unknown): Project {
  const p = ProjectSchema.parse(data) as Project;
  for (const f of p.floors) validateFloor(f);
  return p;
}
