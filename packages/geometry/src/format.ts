import type { LengthUnit } from '../../shared-types/src/index';

const M_PER_FT = 0.3048;
const M_PER_IN = 0.0254;

export function formatLength(m: number, unit: LengthUnit = 'm', precision = 2): string {
  switch (unit) {
    case 'mm': return `${(m * 1000).toFixed(Math.max(0, precision - 2))} mm`;
    case 'cm': return `${(m * 100).toFixed(Math.max(0, precision - 1))} cm`;
    case 'ft-in': {
      const totalIn = m / M_PER_IN;
      const denom = precision >= 3 ? 16 : precision === 2 ? 8 : 1;
      let ft = Math.floor(totalIn / 12);
      let inch = Math.round((totalIn - ft * 12) * denom) / denom;
      if (inch >= 12) { ft += 1; inch -= 12; }
      return `${ft}' ${inch}"`;
    }
    default: return `${m.toFixed(precision)} m`;
  }
}

export function formatArea(m2: number, unit: LengthUnit = 'm', precision = 2): string {
  if (unit === 'ft-in') return `${(m2 / (M_PER_FT * M_PER_FT)).toFixed(precision)} ft²`;
  return `${m2.toFixed(precision)} m²`;
}

export function formatVolume(m3: number, unit: LengthUnit = 'm', precision = 2): string {
  if (unit === 'ft-in') return `${(m3 / M_PER_FT ** 3).toFixed(precision)} ft³`;
  return `${m3.toFixed(precision)} m³`;
}

/** value of `m` meters expressed in the numeric input unit */
export function toUnit(m: number, unit: LengthUnit): number {
  switch (unit) { case 'mm': return m * 1000; case 'cm': return m * 100; case 'ft-in': return m / M_PER_FT; default: return m; }
}

/**
 * Parse a user-typed length. Accepts plain numbers in the default unit, explicit suffixes
 * (mm, cm, m, ft, in, ', "), and combined feet/inches like 12' 6" or 12ft 6in. Returns meters or null.
 */
export function parseLength(input: string, defaultUnit: LengthUnit = 'm'): number | null {
  const s = input.trim().toLowerCase().replace(',', '.');
  if (!s) return null;
  const ftIn = s.match(/^(-?\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)?)?$/);
  if (ftIn) return Number(ftIn[1]) * M_PER_FT + (ftIn[2] ? Number(ftIn[2]) * M_PER_IN : 0);
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*(mm|cm|m|in|"|ft|')?$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const u = m[2];
  if (u === 'mm') return n / 1000;
  if (u === 'cm') return n / 100;
  if (u === 'm') return n;
  if (u === 'in' || u === '"') return n * M_PER_IN;
  if (u === 'ft' || u === "'") return n * M_PER_FT;
  switch (defaultUnit) { case 'mm': return n / 1000; case 'cm': return n / 100; case 'ft-in': return n * M_PER_FT; default: return n; }
}
