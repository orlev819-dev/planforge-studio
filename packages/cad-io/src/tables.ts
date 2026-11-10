import type { Project } from '../../shared-types/src/index';
import { floorMetrics } from '../../geometry/src/index';

const cell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** Room schedule as CSV (UTF-8 with BOM so Excel opens Hebrew correctly). Values in SI units. */
export function roomsCSV(p: Project): string {
  const rows: (string | number)[][] = [['project', 'floor', 'room', 'gross_area_m2', 'net_area_m2', 'perimeter_m', 'height_m', 'volume_m3', 'wall_area_m2', 'ceiling_area_m2', 'doors', 'windows']];
  for (const f of p.floors) for (const r of floorMetrics(f).rooms)
    rows.push([p.name, f.name, r.name, r.grossArea.toFixed(3), r.netArea.toFixed(3), r.perimeter.toFixed(3), r.height.toFixed(3), r.volume.toFixed(3), r.wallArea.toFixed(3), r.ceilingArea.toFixed(3), r.doors, r.windows]);
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function projectJSON(p: Project): string { return JSON.stringify({ format: 'planforge-project', version: 1, project: p }, null, 2); }

export function readProjectJSON(text: string): unknown {
  const data = JSON.parse(text);
  return data && data.format === 'planforge-project' ? data.project : data;
}
