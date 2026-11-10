export * from './drawing';
export * from './svg';
export * from './dxf';
export * from './pdf';
export * from './model3d';
export * from './tables';
export * from './model-import';

/** Formats the export engine knows about, with honest support status. */
export const EXPORT_FORMATS = [
  { id: 'pdf', label: 'PDF (vector, to scale)', group: '2D', supported: true },
  { id: 'png', label: 'PNG', group: '2D', supported: true },
  { id: 'jpeg', label: 'JPEG', group: '2D', supported: true },
  { id: 'svg', label: 'SVG', group: '2D', supported: true },
  { id: 'dxf', label: 'DXF (R12)', group: '2D', supported: true },
  { id: 'glb', label: 'GLB (glTF 2.0)', group: '3D', supported: true },
  { id: 'obj', label: 'OBJ + MTL', group: '3D', supported: true },
  { id: 'usdz', label: 'USDZ', group: '3D', supported: false },
  { id: 'ifc', label: 'IFC', group: '3D', supported: false },
  { id: 'json', label: 'Project JSON', group: 'Data', supported: true },
  { id: 'csv', label: 'Room schedule CSV', group: 'Data', supported: true },
  { id: 'xlsx', label: 'XLSX', group: 'Data', supported: false },
] as const;
