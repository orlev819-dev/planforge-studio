/**
 * PlanForge core document model.
 * All lengths are METERS in a right-handed plan coordinate system:
 *   +x = east (right on screen), +y = south (down on screen). Angles in degrees.
 * 3D (Y-up) maps plan (x, y) at elevation e -> world (x, e, y).
 * The model is renderer-independent: 2D editor, 3D viewer and exporters all read it.
 */
export type ID = string;

export interface Vec2 { x: number; y: number }

export type LengthUnit = 'mm' | 'cm' | 'm' | 'ft-in';
export type Lang = 'en' | 'he';

export interface Vertex { id: ID; x: number; y: number }

export interface Wall {
  id: ID;
  a: ID;
  b: ID;
  thickness: number;
  /** null = use the max height of the rooms on either side (or floor default) */
  height: number | null;
  exterior: boolean;
  /** true when the user explicitly set exterior/interior (otherwise auto-classified) */
  exteriorManual: boolean;
  material: string;
  /** standalone partition wall not bound to a room edge */
  standalone: boolean;
}

export interface Room {
  id: ID;
  name: string;
  vertexIds: ID[];
  height: number;
  floorMaterial: string;
  wallMaterial: string;
  ceilingMaterial: string;
}

export type OpeningKind = 'door' | 'window' | 'opening';
export type DoorType = 'single' | 'double' | 'sliding' | 'pocket' | 'folding' | 'double-sliding' | 'custom';
export type WindowType = 'fixed' | 'sliding' | 'casement' | 'double' | 'floor-to-ceiling' | 'custom';

export interface Opening {
  id: ID;
  wallId: ID;
  kind: OpeningKind;
  subtype: DoorType | WindowType | 'opening';
  /** distance from wall vertex `a` to the opening CENTER, meters */
  t: number;
  width: number;
  height: number;
  sill: number;
  hinge: 'start' | 'end';
  /** swing side relative to the wall's left normal (a->b): 1 = left, -1 = right */
  side: 1 | -1;
  frameDepth: number;
  material: string;
}

export interface Furniture {
  id: ID;
  catalogId: string;
  name: string;
  category: string;
  x: number;
  y: number;
  rotation: number;
  width: number;
  depth: number;
  height: number;
  elevation: number;
  mirrored: boolean;
  layer: string;
  color: string;
  meta: Record<string, string>;
}

export interface Dimension { id: ID; a: Vec2; b: Vec2; offset: number }
export interface Annotation { id: ID; x: number; y: number; text: string }

export interface ReferenceImage {
  dataUrl: string;
  /** pixel size of the source image */
  pxWidth: number;
  pxHeight: number;
  /** meters per pixel after calibration */
  scale: number;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  visible: boolean;
  calibrated: boolean;
}

export interface Floor {
  id: ID;
  name: string;
  elevation: number;
  defaultHeight: number;
  defaultWallThickness: number;
  vertices: Record<ID, Vertex>;
  walls: Record<ID, Wall>;
  rooms: Record<ID, Room>;
  openings: Record<ID, Opening>;
  furniture: Record<ID, Furniture>;
  dimensions: Record<ID, Dimension>;
  annotations: Record<ID, Annotation>;
  reference: ReferenceImage | null;
}

export interface ProjectSettings { unit: LengthUnit; precision: number; showGrid: boolean; snap: boolean }

export interface Project {
  schemaVersion: 1;
  id: ID;
  name: string;
  address: string;
  description: string;
  status: 'active' | 'archived' | 'deleted';
  isDemo: boolean;
  createdAt: number;
  updatedAt: number;
  rev: number;
  settings: ProjectSettings;
  floors: Floor[];
}

export class GeometryError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'GeometryError'; }
}
