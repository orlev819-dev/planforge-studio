/**
 * Parametric furniture geometry. Every catalogue shape is described here as a set of real parts —
 * frame, cushions, doors, handles, glass, shades — in the object's own coordinates: x across its
 * width, y across its depth, z up from its base, all in meters. Nothing is a bare cube: the same
 * description drives the 3D mesh and (through `planSymbol`) the lines drawn on the plan.
 *
 * Sizes stay proportional to the object's own dimensions, so a 1.6 m sofa and a 2.6 m sofa are the
 * same design at different sizes rather than a stretched box.
 */
import type { Shape } from '../../shared-types/src/catalog';

export interface Part {
  /** local rectangle [x0, y0, x1, y1] */
  r: [number, number, number, number];
  /** [bottom, top] above the object's base */
  z: [number, number];
  /** explicit colour; without one the part takes the object's colour, shaded by `tint` */
  color?: string;
  /** 1 = the object's colour, below 1 darker, above 1 lighter */
  tint?: number;
  /** ellipse in plan instead of a rectangle */
  round?: boolean;
  /** scale of the top face against the bottom one (shades, pots, vases) */
  taper?: number;
  alpha?: number;
}

const METAL = '#9aa0a6', DARK = '#2b2f33', WHITE = '#f6f6f4', GLASS = '#cfe3f2', GLOW = '#ffeec2', GREEN = '#4f6b43', SOIL = '#6b5847';

const P = (r: [number, number, number, number], z: [number, number], o: Partial<Part> = {}): Part => ({ r, z, ...o });

/** evenly spaced fronts (doors, drawers, slats) with a gap between them */
function fronts(x0: number, x1: number, n: number, gap: number) {
  const span = (x1 - x0 - gap * (n + 1)) / n;
  return Array.from({ length: n }, (_, i) => [x0 + gap + i * (span + gap), x0 + gap + i * (span + gap) + span] as const);
}

/**
 * The parts of one object, in local coordinates. `w`, `d`, `h` are its real size in meters.
 */
export function furnitureParts(shape: Shape, w: number, d: number, h: number): Part[] {
  const hw = w / 2, hd = d / 2;
  const out: Part[] = [];
  const add = (...p: Part[]) => out.push(...p);
  /** four legs inset from the corners */
  const legs = (inset: number, top: number, t = 0.05, color = DARK) => {
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const)
      add(P([sx * (hw - inset) - t / 2, sy * (hd - inset) - t / 2, sx * (hw - inset) + t / 2, sy * (hd - inset) + t / 2], [0, top], { color }));
  };
  switch (shape) {
    // ---------------------------------------------------------------- seating
    case 'sofa': case 'sofa-module': {
      const arm = shape === 'sofa' ? Math.min(0.18, w * 0.12) : 0.06;
      const seat = h * 0.46, back = h;
      add(P([-hw, -hd, hw, hd], [0.06, seat], { tint: 0.92 }));                      // frame
      add(P([-hw, hd - 0.22, hw, hd], [seat, back], { tint: 0.92 }));                // back frame
      add(P([-hw, -hd, -hw + arm, hd], [0.06, back * 0.72], { tint: 1.06 }));        // arms
      add(P([hw - arm, -hd, hw, hd], [0.06, back * 0.72], { tint: 1.06 }));
      const seats = Math.max(1, Math.round(w / 0.75));
      for (const [a, b] of fronts(-hw + arm, hw - arm, seats, 0.02)) {
        add(P([a, -hd + 0.06, b, hd - 0.2], [seat, seat + 0.14], { tint: 1.12 }));   // seat cushions
        add(P([a, hd - 0.21, b, hd - 0.08], [seat + 0.12, back - 0.02], { tint: 1.02 })); // back cushions
      }
      legs(0.08, 0.06, 0.04);
      return out;
    }
    case 'sofa-l': {
      const arm = 0.18, seat = h * 0.46, legDepth = Math.min(d * 0.62, d - 0.3);
      // long part along x, short return along y on the left
      add(P([-hw, hd - legDepth, hw, hd], [0.06, seat], { tint: 0.92 }));
      add(P([-hw, hd - 0.22, hw, hd], [seat, h], { tint: 0.92 }));
      add(P([-hw, -hd, -hw + legDepth, hd - legDepth], [0.06, seat], { tint: 0.92 }));
      add(P([-hw, -hd, -hw + 0.22, hd - legDepth], [seat, h], { tint: 0.92 }));
      add(P([hw - arm, hd - legDepth, hw, hd], [0.06, h * 0.72], { tint: 1.06 }));
      add(P([-hw, -hd, -hw + legDepth, -hd + arm], [0.06, h * 0.72], { tint: 1.06 }));
      for (const [a, b] of fronts(-hw + 0.24, hw - arm, Math.max(2, Math.round((w - 0.4) / 0.8)), 0.02)) {
        add(P([a, hd - legDepth + 0.06, b, hd - 0.2], [seat, seat + 0.14], { tint: 1.12 }));
        add(P([a, hd - 0.21, b, hd - 0.08], [seat + 0.12, h - 0.02], { tint: 1.02 }));
      }
      for (const [a, b] of fronts(-hd + arm, hd - legDepth, Math.max(1, Math.round((d - 0.5) / 0.8)), 0.02)) {
        add(P([-hw + 0.24, a, -hw + legDepth - 0.06, b], [seat, seat + 0.14], { tint: 1.12 }));
        add(P([-hw + 0.08, a, -hw + 0.21, b], [seat + 0.12, h - 0.02], { tint: 1.02 }));
      }
      return out;
    }
    case 'armchair': {
      const seat = h * 0.46;
      add(P([-hw, -hd, hw, hd], [0.08, seat], { tint: 0.92 }));
      add(P([-hw, hd - 0.2, hw, hd], [seat, h], { tint: 0.92 }));
      add(P([-hw, -hd, -hw + 0.14, hd], [0.08, h * 0.7], { tint: 1.06 }));
      add(P([hw - 0.14, -hd, hw, hd], [0.08, h * 0.7], { tint: 1.06 }));
      add(P([-hw + 0.14, -hd + 0.05, hw - 0.14, hd - 0.18], [seat, seat + 0.13], { tint: 1.12 }));
      legs(0.08, 0.08, 0.04);
      return out;
    }
    case 'pouffe':
      add(P([-hw, -hd, hw, hd], [0.04, h], { round: true, tint: 1.05 }));
      legs(0.06, 0.04, 0.035);
      return out;
    case 'chair': {
      const seat = Math.min(0.46, h * 0.52);
      add(P([-hw, -hd, hw, hd], [seat - 0.05, seat], { tint: 1.05 }));
      add(P([-hw + 0.03, hd - 0.06, hw - 0.03, hd], [seat, h], { tint: 0.95 }));
      legs(0.04, seat - 0.05, 0.035, undefined as unknown as string);
      return out;
    }
    case 'stool': {
      add(P([-hw, -hd, hw, hd], [h - 0.06, h], { round: true, tint: 1.05 }));
      add(P([-hw * 0.3, -hd * 0.3, hw * 0.3, hd * 0.3], [0.04, h - 0.06], { color: METAL }));
      add(P([-hw * 0.9, -hd * 0.9, hw * 0.9, hd * 0.9], [0, 0.04], { round: true, color: METAL }));
      add(P([-hw * 0.7, -hd * 0.7, hw * 0.7, hd * 0.7], [h * 0.3, h * 0.33], { round: true, color: METAL }));
      return out;
    }
    case 'office-chair': {
      const seat = h * 0.45;
      add(P([-hw * 0.8, -hd * 0.8, hw * 0.8, hd * 0.8], [seat - 0.08, seat], { round: true, tint: 1.05 }));
      add(P([-hw * 0.75, hd * 0.45, hw * 0.75, hd * 0.68], [seat, h], { tint: 0.95 }));
      add(P([-0.05, -0.05, 0.05, 0.05], [0.07, seat - 0.08], { color: METAL }));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2, R = Math.min(hw, hd) * 0.95;
        add(P([Math.cos(a) * R - 0.04, Math.sin(a) * R - 0.04, Math.cos(a) * R + 0.04, Math.sin(a) * R + 0.04], [0, 0.07], { round: true, color: DARK }));
      }
      return out;
    }
    case 'bench':
      add(P([-hw, -hd, hw, hd], [h - 0.06, h], { tint: 1.05 }));
      legs(0.06, h - 0.06, 0.06, undefined as unknown as string);
      return out;
    case 'lounger': {
      const seat = h * 0.45;
      add(P([-hw, -hd, hw, hd * 0.5], [seat, seat + 0.1], { tint: 1.08 }));
      for (let i = 0; i < 5; i++) {
        const t = i / 4, y = hd * 0.5 + (hd - hd * 0.5) * t;
        add(P([-hw, y - 0.06, hw, y + 0.02], [seat + 0.08 + t * 0.28, seat + 0.16 + t * 0.3], { tint: 1.08 }));
      }
      add(P([-hw, -hd, hw, hd], [seat - 0.06, seat], { tint: 0.9 }));
      legs(0.06, seat - 0.06, 0.04, METAL);
      return out;
    }

    // ---------------------------------------------------------------- tables
    case 'table':
      add(P([-hw, -hd, hw, hd], [h - 0.04, h], { tint: 1.05 }));
      legs(0.06, h - 0.04, 0.06, undefined as unknown as string);
      return out;
    case 'table-round':
      add(P([-hw, -hd, hw, hd], [h - 0.04, h], { round: true, tint: 1.05 }));
      add(P([-0.06, -0.06, 0.06, 0.06], [0.03, h - 0.04], { tint: 0.9 }));
      add(P([-hw * 0.45, -hd * 0.45, hw * 0.45, hd * 0.45], [0, 0.03], { round: true, tint: 0.9 }));
      return out;
    case 'desk':
      add(P([-hw, -hd, hw, hd], [h - 0.035, h], { tint: 1.05 }));
      add(P([-hw, hd - 0.04, hw, hd], [h - 0.3, h - 0.035], { tint: 0.95 }));
      add(P([-hw, -hd, -hw + 0.04, hd], [0, h - 0.035], { tint: 0.95 }));
      add(P([hw - 0.04, -hd, hw, hd], [0, h - 0.035], { tint: 0.95 }));
      return out;
    case 'counter':
      add(P([-hw, -hd, hw, hd], [0, h], { tint: 1 }));
      return out;

    // ---------------------------------------------------------------- storage
    case 'cabinet': case 'dresser': case 'wardrobe': case 'kitchen-base': case 'kitchen-tall': case 'kitchen-upper': case 'vanity': case 'island': {
      const doors = shape === 'dresser' ? 0 : Math.max(1, Math.round(w / (shape === 'kitchen-upper' ? 0.5 : 0.55)));
      const front = -hd + 0.02;
      add(P([-hw, -hd + 0.02, hw, hd], [0, h], { tint: 0.88 }));                      // carcase
      if (shape === 'kitchen-base' || shape === 'kitchen-tall' || shape === 'island' || shape === 'vanity')
        add(P([-hw, -hd, hw, hd], [0, 0.1], { color: DARK }));                        // plinth
      if (shape === 'dresser') {
        const n = Math.max(2, Math.round(h / 0.26));
        for (const [a, b] of fronts(0.02, h - 0.02, n, 0.012)) {
          add(P([-hw + 0.02, -hd, hw - 0.02, front], [a, b], { tint: 1.06 }));
          add(P([-0.09, -hd - 0.015, 0.09, -hd], [(a + b) / 2 - 0.012, (a + b) / 2 + 0.012], { color: METAL }));
        }
      } else {
        const z0 = shape === 'kitchen-base' || shape === 'kitchen-tall' || shape === 'island' || shape === 'vanity' ? 0.1 : 0.02;
        for (const [a, b] of fronts(-hw, hw, doors, 0.012)) {
          add(P([a, -hd, b, front], [z0, h - 0.02], { tint: 1.06 }));
          const hx = b - 0.05;
          add(P([hx - 0.012, -hd - 0.02, hx + 0.012, -hd], [h * 0.45, h * 0.45 + 0.22], { color: METAL }));
        }
      }
      if (shape === 'kitchen-base' || shape === 'island') add(P([-hw, -hd - 0.02, hw, hd], [h, h + 0.04], { color: '#2b2b2b' })); // worktop
      if (shape === 'vanity') add(P([-hw, -hd - 0.01, hw, hd], [h, h + 0.03], { color: WHITE }));
      return out;
    }
    case 'kitchen-drawers': {
      add(P([-hw, -hd + 0.02, hw, hd], [0, h], { tint: 0.88 }));
      add(P([-hw, -hd, hw, hd], [0, 0.1], { color: DARK }));
      for (const [a, b] of fronts(0.1, h - 0.02, 3, 0.012)) {
        add(P([-hw + 0.01, -hd, hw - 0.01, -hd + 0.02], [a, b], { tint: 1.06 }));
        add(P([-hw * 0.6, -hd - 0.015, hw * 0.6, -hd], [(a + b) / 2 - 0.01, (a + b) / 2 + 0.01], { color: METAL }));
      }
      add(P([-hw, -hd - 0.02, hw, hd], [h, h + 0.04], { color: '#2b2b2b' }));
      return out;
    }
    case 'kitchen-corner': {
      add(P([-hw, -hd + 0.02, hw, hd], [0, h], { tint: 0.88 }));
      add(P([-hw, -hd, hw, hd], [0, 0.1], { color: DARK }));
      add(P([-hw + 0.02, -hd, 0, -hd + 0.02], [0.1, h - 0.02], { tint: 1.06 }));      // one door on the short face
      add(P([0, -hd, hw, -hd + 0.02], [0.1, h - 0.02], { tint: 1.02 }));
      add(P([-hw, -hd - 0.02, hw, hd], [h, h + 0.04], { color: '#2b2b2b' }));
      return out;
    }
    case 'wardrobe-sliding': {
      add(P([-hw, -hd + 0.04, hw, hd], [0, h], { tint: 0.88 }));
      const n = Math.max(2, Math.round(w / 1.0));
      for (let i = 0; i < n; i++) {
        const a = -hw + (w / n) * i, b = a + w / n;
        add(P([a, -hd + (i % 2 ? 0.04 : 0), b, -hd + (i % 2 ? 0.08 : 0.04)], [0.02, h - 0.02], { tint: i % 2 ? 1.1 : 1.0 }));
        add(P([a + 0.02, -hd - 0.005, a + 0.05, -hd + 0.02], [h * 0.4, h * 0.6], { color: METAL }));
      }
      add(P([-hw, -hd + 0.02, hw, hd], [h, h + 0.03], { tint: 0.8 }));
      return out;
    }
    case 'shelf': {
      add(P([-hw, -hd, -hw + 0.025, hd], [0, h], { tint: 0.95 }));
      add(P([hw - 0.025, -hd, hw, hd], [0, h], { tint: 0.95 }));
      add(P([-hw, hd - 0.02, hw, hd], [0, h], { tint: 0.88 }));
      const n = Math.max(2, Math.round(h / 0.36));
      for (let i = 0; i <= n; i++) add(P([-hw + 0.025, -hd, hw - 0.025, hd - 0.02], [(h / n) * i - (i ? 0.025 : 0), (h / n) * i + (i ? 0 : 0.025)], { tint: 1.03 }));
      return out;
    }

    // ---------------------------------------------------------------- beds
    case 'bed': case 'bed-kids': {
      const mat = h, head = shape === 'bed-kids' ? 0.75 : 1.0;
      add(P([-hw, -hd + 0.04, hw, hd], [0.08, mat * 0.55], { tint: 0.85 }));          // frame
      add(P([-hw + 0.02, -hd + 0.06, hw - 0.02, hd - 0.02], [mat * 0.55, mat], { color: WHITE }));  // mattress
      add(P([-hw, hd - 0.06, hw, hd], [0.08, head], { tint: 0.95 }));                  // headboard
      add(P([-hw + 0.03, -hd + 0.08, hw - 0.03, hd * 0.25], [mat, mat + 0.06], { tint: 1.1 }));     // duvet
      for (const [a, b] of fronts(-hw + 0.08, hw - 0.08, w > 1.2 ? 2 : 1, 0.06))
        add(P([a, hd - 0.52, b, hd - 0.12], [mat, mat + 0.1], { color: WHITE }));      // pillows
      legs(0.06, 0.08, 0.06, DARK);
      return out;
    }
    case 'bunk': {
      const low = 0.35, up = h - 0.5;
      for (const z of [low, up]) {
        add(P([-hw, -hd + 0.04, hw, hd], [z, z + 0.12], { tint: 0.9 }));
        add(P([-hw + 0.03, -hd + 0.06, hw - 0.03, hd - 0.02], [z + 0.12, z + 0.3], { color: WHITE }));
      }
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const)
        add(P([sx * hw - (sx > 0 ? 0.06 : 0), sy * hd - (sy > 0 ? 0.06 : 0), sx * hw + (sx < 0 ? 0.06 : 0), sy * hd + (sy < 0 ? 0.06 : 0)], [0, h], { tint: 0.95 }));
      add(P([-hw, -hd, hw, -hd + 0.05], [up + 0.3, up + 0.62], { tint: 0.95 }));       // guard rail
      return out;
    }
    case 'crib': {
      add(P([-hw, -hd + 0.03, hw, hd - 0.03], [0.3, 0.42], { color: WHITE }));
      for (const [x0, x1] of [[-hw, -hw + 0.04], [hw - 0.04, hw]] as const) add(P([x0, -hd, x1, hd], [0, h], { tint: 1 }));
      for (const y of [-hd, hd - 0.04]) add(P([-hw, y, hw, y + 0.04], [0, h], { tint: 1 }));
      const bars = Math.max(6, Math.round(w / 0.1));
      for (const [a, b] of fronts(-hw, hw, bars, 0.03)) add(P([a, -hd, b, -hd + 0.03], [0.42, h], { tint: 1.05 }));
      return out;
    }

    // ---------------------------------------------------------------- appliances
    case 'fridge': case 'fridge-side': {
      add(P([-hw, -hd + 0.03, hw, hd], [0, h], { tint: 0.9 }));
      const split = shape === 'fridge-side' ? 'v' : 'h';
      if (split === 'h') {
        add(P([-hw, -hd, hw, -hd + 0.03], [h * 0.36 + 0.01, h], { tint: 1.08 }));
        add(P([-hw, -hd, hw, -hd + 0.03], [0.02, h * 0.36 - 0.01], { tint: 1.08 }));
        add(P([hw - 0.09, -hd - 0.02, hw - 0.06, -hd], [h * 0.42, h * 0.78], { color: METAL }));
        add(P([hw - 0.09, -hd - 0.02, hw - 0.06, -hd], [h * 0.1, h * 0.3], { color: METAL }));
      } else {
        add(P([-hw, -hd, -0.005, -hd + 0.03], [0.02, h], { tint: 1.08 }));
        add(P([0.005, -hd, hw, -hd + 0.03], [0.02, h], { tint: 1.08 }));
        add(P([-0.1, -hd - 0.02, -0.06, -hd], [h * 0.45, h * 0.85], { color: METAL }));
        add(P([0.06, -hd - 0.02, 0.1, -hd], [h * 0.45, h * 0.85], { color: METAL }));
      }
      return out;
    }
    case 'oven': {
      add(P([-hw, -hd + 0.03, hw, hd], [0, h], { tint: 0.9, color: DARK }));
      add(P([-hw, -hd, hw, -hd + 0.03], [0.02, h - 0.1], { color: '#3a3f44' }));
      add(P([-hw + 0.06, -hd - 0.01, hw - 0.06, -hd], [h * 0.25, h * 0.75], { color: GLASS, alpha: 0.55 }));
      add(P([-hw + 0.04, -hd - 0.02, hw - 0.04, -hd - 0.005], [h - 0.17, h - 0.14], { color: METAL }));
      add(P([-hw, -hd, hw, -hd + 0.03], [h - 0.1, h], { color: '#23272b' }));
      return out;
    }
    case 'cooktop':
      add(P([-hw, -hd, hw, hd], [0, h], { color: DARK }));
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const)
        add(P([sx * hw * 0.5 - hw * 0.26, sy * hd * 0.5 - hd * 0.26, sx * hw * 0.5 + hw * 0.26, sy * hd * 0.5 + hd * 0.26], [h, h + 0.004], { round: true, color: '#4a4f55' }));
      return out;
    case 'hood':
      add(P([-hw, -hd, hw, hd], [0, h * 0.08], { color: METAL }));                    // filter rim
      add(P([-hw * 0.96, -hd * 0.96, hw * 0.96, hd * 0.96], [h * 0.08, h * 0.38], { taper: 0.55, tint: 1 }));
      add(P([-hw * 0.3, -hd * 0.3, hw * 0.3, hd * 0.3], [h * 0.38, h], { tint: 1 }));  // duct
      return out;
    case 'microwave':
      add(P([-hw, -hd, hw, hd], [0, h], { color: DARK }));
      add(P([-hw + 0.03, -hd - 0.01, hw * 0.45, -hd], [0.03, h - 0.03], { color: GLASS, alpha: 0.5 }));
      add(P([hw * 0.55, -hd - 0.01, hw - 0.03, -hd], [0.03, h - 0.03], { color: '#3a3f44' }));
      return out;
    case 'dishwasher': case 'washer': {
      add(P([-hw, -hd + 0.03, hw, hd], [0, h], { tint: 0.92 }));
      add(P([-hw, -hd, hw, -hd + 0.03], [0.02, h - 0.12], { tint: 1.06 }));
      if (shape === 'washer') {
        add(P([-hw * 0.6, -hd - 0.012, hw * 0.6, -hd], [h * 0.3, h * 0.78], { round: true, color: '#8f9499' }));
        add(P([-hw * 0.45, -hd - 0.02, hw * 0.45, -hd - 0.008], [h * 0.36, h * 0.72], { round: true, color: GLASS, alpha: 0.55 }));
      } else {
        add(P([-hw + 0.05, -hd - 0.02, hw - 0.05, -hd], [h - 0.17, h - 0.14], { color: METAL }));
      }
      add(P([-hw, -hd, hw, -hd + 0.03], [h - 0.12, h], { color: '#d8dade' }));
      return out;
    }
    case 'ac':
      add(P([-hw, -hd, hw, hd], [0, h], { color: WHITE }));                              // body
      add(P([-hw + 0.04, -hd - 0.005, hw - 0.04, -hd], [0.03, h * 0.45], { color: '#e4e6e8' })); // louvre
      add(P([-hw + 0.04, -hd - 0.004, hw - 0.04, -hd + 0.002], [h * 0.6, h * 0.92], { color: '#eef0f2' })); // grille
      return out;
    case 'boiler':
      add(P([-hw, -hd, hw, hd], [0.06, h], { round: true, tint: 1 }));                  // tank
      add(P([-hw * 0.9, -hd * 0.9, hw * 0.9, hd * 0.9], [0, 0.06], { round: true, color: DARK })); // foot
      add(P([-hw * 0.2, -hd * 0.2, hw * 0.2, hd * 0.2], [h, h + 0.06], { round: true, color: METAL })); // outlet
      add(P([hw * 0.4, -hd * 0.3, hw * 0.75, hd * 0.3], [h * 0.25, h * 0.45], { color: METAL })); // controls
      return out;
    case 'coffee':
      add(P([-hw, -hd, hw, hd], [0, h * 0.75], { color: DARK }));
      add(P([-hw * 0.6, -hd * 0.3, hw * 0.6, hd], [h * 0.75, h], { color: '#3a3f44' }));
      add(P([-hw * 0.5, -hd, hw * 0.5, -hd + 0.02], [h * 0.12, h * 0.4], { color: METAL }));
      return out;
    case 'tv':
      add(P([-hw, -hd, hw, hd], [0.02, h], { color: '#15171a' }));
      add(P([-hw + 0.02, -hd - 0.004, hw - 0.02, -hd], [0.04, h - 0.02], { color: '#2d3a4a' }));
      add(P([-hw * 0.18, -hd * 0.6, hw * 0.18, hd * 2.5], [0, 0.02], { color: DARK }));
      return out;

    // ---------------------------------------------------------------- bathroom
    case 'toilet':
      add(P([-hw * 0.78, -hd + 0.2, hw * 0.78, hd * 0.75], [0.12, 0.42], { round: true, color: WHITE }));
      add(P([-hw * 0.5, -hd + 0.26, hw * 0.5, hd * 0.5], [0, 0.12], { color: WHITE }));
      add(P([-hw * 0.82, -hd + 0.18, hw * 0.82, hd * 0.78], [0.42, 0.46], { round: true, color: '#e9ecef' }));
      add(P([-hw, hd - 0.2, hw, hd], [0, h], { color: WHITE }));
      add(P([-hw * 0.3, hd - 0.21, hw * 0.3, hd - 0.18], [h - 0.1, h - 0.06], { color: METAL }));
      return out;
    case 'toilet-wall':
      add(P([-hw * 0.8, -hd + 0.06, hw * 0.8, hd], [0.04, h], { round: true, color: WHITE }));
      add(P([-hw * 0.84, -hd + 0.04, hw * 0.84, hd], [h, h + 0.04], { round: true, color: '#e9ecef' }));
      add(P([-hw, hd - 0.04, hw, hd], [-0.3, h + 0.2], { color: WHITE }));
      return out;
    case 'bidet':
      add(P([-hw * 0.8, -hd + 0.06, hw * 0.8, hd], [0.1, h], { round: true, color: WHITE }));   // bowl
      add(P([-hw * 0.5, -hd + 0.14, hw * 0.5, hd * 0.6], [0, 0.1], { color: WHITE }));          // pedestal
      add(P([-hw * 0.6, -hd + 0.14, hw * 0.6, hd * 0.75], [h * 0.55, h], { round: true, color: '#eceff1' })); // inner basin
      add(P([-0.02, hd - 0.08, 0.02, hd - 0.03], [h, h + 0.06], { color: METAL }));             // tap
      return out;
    case 'basin': case 'sink': {
      const bowl = shape === 'sink' ? '#aeb6bf' : WHITE;
      add(P([-hw, -hd, hw, hd], [0, h], { color: bowl }));
      add(P([-hw + 0.05, -hd + 0.05, hw - 0.05, hd - 0.05], [h * 0.35, h], { color: shape === 'sink' ? '#9aa0a6' : '#eceff1' }));
      add(P([-0.025, hd - 0.08, 0.025, hd - 0.03], [h, h + 0.22], { color: METAL }));
      add(P([-0.02, hd - 0.16, 0.02, hd - 0.03], [h + 0.19, h + 0.22], { color: METAL }));
      return out;
    }
    case 'bath':
      add(P([-hw, -hd, hw, hd], [0, h], { color: WHITE }));
      add(P([-hw + 0.07, -hd + 0.07, hw - 0.07, hd - 0.07], [h * 0.25, h], { round: true, color: '#eef1f3' }));
      add(P([hw - 0.16, -0.025, hw - 0.1, 0.025], [h, h + 0.18], { color: METAL }));
      return out;
    case 'shower':
      add(P([-hw, -hd, hw, hd], [0, 0.06], { color: WHITE }));
      add(P([-hw, -hd, hw, -hd + 0.012], [0.06, h], { color: GLASS, alpha: 0.22 }));
      add(P([-hw, -hd, -hw + 0.012, hd], [0.06, h], { color: GLASS, alpha: 0.22 }));
      add(P([-hw, -hd, hw, -hd + 0.02], [h, h + 0.02], { color: METAL }));
      add(P([hw - 0.2, hd - 0.1, hw - 0.14, hd - 0.04], [h * 0.85, h * 0.95], { round: true, color: METAL }));
      return out;
    case 'shower-screen':
      add(P([-hw, -hd, hw, hd], [0, h], { color: GLASS, alpha: 0.25 }));
      add(P([-hw, -hd, -hw + 0.02, hd], [0, h], { color: METAL }));
      return out;
    case 'towel':
      add(P([-hw, -hd, -hw + 0.03, hd], [h - 0.05, h], { color: METAL }));
      add(P([-hw * 0.5, -hd + 0.015, hw * 0.5, -hd + 0.045], [h * 0.1, h - 0.08], { tint: 0.95 }));
      add(P([hw - 0.03, -hd, hw, hd], [h - 0.05, h], { color: METAL }));
      add(P([-hw, -hd, hw, -hd + 0.02], [h - 0.03, h], { color: METAL }));
      add(P([-hw * 0.8, -hd + 0.01, hw * 0.8, -hd + 0.05], [0, h - 0.03], { tint: 1.1 }));
      return out;

    // ---------------------------------------------------------------- curtains and blinds
    case 'curtain': case 'curtain-sheer': {
      const sheer = shape === 'curtain-sheer';
      const folds = Math.max(6, Math.round(w / 0.16));
      add(P([-hw, -hd, hw, -hd + 0.04], [h - 0.04, h], { color: METAL }));             // track
      for (let i = 0; i < folds; i++) {
        const a = -hw + (w / folds) * i, b = a + (w / folds) * 0.92;
        const front = i % 2 === 0;
        add(P([a, front ? -hd + 0.03 : -hd + 0.07, b, front ? -hd + 0.07 : -hd + 0.11], [0, h - 0.05], { tint: front ? 1.08 : 0.9, alpha: sheer ? 0.45 : 1 }));
      }
      return out;
    }
    case 'roller':
      add(P([-hw, -hd, hw, hd], [h - 0.07, h], { round: true, tint: 0.95 }));
      add(P([-hw + 0.01, -hd + 0.02, hw - 0.01, -hd + 0.035], [0, h - 0.07], { tint: 1.05 }));
      add(P([-hw + 0.01, -hd + 0.015, hw - 0.01, -hd + 0.04], [0, 0.025], { tint: 0.85 }));
      return out;
    case 'venetian': {
      const slats = Math.max(8, Math.round(h / 0.06));
      add(P([-hw, -hd, hw, hd], [h - 0.04, h], { tint: 0.9 }));
      for (let i = 0; i < slats; i++) {
        const z = (h - 0.06) * (i / slats);
        add(P([-hw + 0.01, -hd + 0.01, hw - 0.01, hd - 0.01], [z, z + 0.008], { tint: i % 2 ? 1.05 : 0.98 }));
      }
      return out;
    }

    // ---------------------------------------------------------------- lighting
    case 'pendant':
      add(P([-0.008, -0.008, 0.008, 0.008], [h, h + 0.7], { color: DARK }));
      add(P([-hw, -hd, hw, hd], [0, h], { round: true, taper: 0.45, tint: 1 }));
      add(P([-hw * 0.55, -hd * 0.55, hw * 0.55, hd * 0.55], [-0.01, 0.02], { round: true, color: GLOW }));
      return out;
    case 'ceiling-lamp':
      add(P([-hw * 0.35, -hd * 0.35, hw * 0.35, hd * 0.35], [h, h + 0.05], { round: true, color: METAL })); // ceiling plate
      add(P([-hw, -hd, hw, hd], [0.01, h], { round: true, taper: 0.75, color: WHITE }));
      add(P([-hw * 0.85, -hd * 0.85, hw * 0.85, hd * 0.85], [-0.012, 0.012], { round: true, color: GLOW }));
      return out;
    case 'spot':
      add(P([-hw, -hd, hw, hd], [0.004, h], { round: true, color: WHITE }));            // trim
      add(P([-hw * 0.8, -hd * 0.8, hw * 0.8, hd * 0.8], [h * 0.4, h], { round: true, color: '#d8dade' })); // can
      add(P([-hw * 0.7, -hd * 0.7, hw * 0.7, hd * 0.7], [-0.008, 0.006], { round: true, color: GLOW }));
      return out;
    case 'sconce':
      add(P([-hw, hd - 0.02, hw, hd], [0, h], { color: METAL }));
      add(P([-hw, -hd, hw, hd - 0.02], [h * 0.3, h], { round: true, taper: 0.7, tint: 1 }));
      add(P([-hw * 0.6, -hd * 0.6, hw * 0.6, hd * 0.6], [h * 0.28, h * 0.32], { round: true, color: GLOW }));
      return out;
    case 'floor-lamp':
      add(P([-hw * 0.6, -hd * 0.6, hw * 0.6, hd * 0.6], [0, 0.03], { round: true, color: DARK }));
      add(P([-0.015, -0.015, 0.015, 0.015], [0.03, h - 0.26], { color: METAL }));
      add(P([-hw, -hd, hw, hd], [h - 0.26, h], { round: true, taper: 0.75, color: '#efe6d5' }));
      add(P([-hw * 0.7, -hd * 0.7, hw * 0.7, hd * 0.7], [h - 0.27, h - 0.25], { round: true, color: GLOW }));
      return out;
    case 'table-lamp':
      add(P([-hw * 0.5, -hd * 0.5, hw * 0.5, hd * 0.5], [0, 0.025], { round: true, color: DARK }));
      add(P([-0.012, -0.012, 0.012, 0.012], [0.025, h - 0.18], { color: METAL }));
      add(P([-hw, -hd, hw, hd], [h - 0.18, h], { round: true, taper: 0.7, tint: 1 }));
      return out;

    // ---------------------------------------------------------------- outdoor and decor
    case 'parasol':
      add(P([-0.025, -0.025, 0.025, 0.025], [0, h], { color: METAL }));
      add(P([-hw, -hd, hw, hd], [h - 0.35, h], { round: true, taper: 0.12, tint: 1 }));
      add(P([-hw * 0.3, -hd * 0.3, hw * 0.3, hd * 0.3], [0, 0.05], { round: true, color: DARK }));
      return out;
    case 'planter':
      add(P([-hw, -hd, hw, hd], [0, h * 0.75], { taper: 1.12, tint: 1 }));
      add(P([-hw * 0.9, -hd * 0.9, hw * 0.9, hd * 0.9], [h * 0.7, h * 0.78], { color: SOIL }));
      for (const [a, b] of fronts(-hw, hw, Math.max(2, Math.round(w / 0.3)), 0.04))
        add(P([a, -hd * 0.5, b, hd * 0.5], [h * 0.75, h], { round: true, color: GREEN }));
      return out;
    case 'bbq':
      add(P([-hw, -hd, hw, hd], [h * 0.45, h * 0.72], { tint: 1 }));
      add(P([-hw * 0.9, -hd * 0.9, hw * 0.9, hd * 0.9], [h * 0.72, h * 0.78], { color: METAL }));
      add(P([-hw * 0.75, -hd * 0.75, hw * 0.75, hd * 0.75], [h * 0.78, h], { taper: 0.6, color: DARK }));
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const)
        add(P([sx * hw * 0.8 - 0.02, sy * hd * 0.8 - 0.02, sx * hw * 0.8 + 0.02, sy * hd * 0.8 + 0.02], [0, h * 0.45], { color: METAL }));
      return out;
    case 'plant':
      add(P([-hw * 0.45, -hd * 0.45, hw * 0.45, hd * 0.45], [0, h * 0.22], { round: true, taper: 0.8, color: '#b1735a' }));
      add(P([-0.02, -0.02, 0.02, 0.02], [h * 0.2, h * 0.6], { color: '#6b5a3e' }));
      add(P([-hw, -hd, hw, hd], [h * 0.45, h], { round: true, taper: 0.5, color: GREEN }));
      add(P([-hw * 0.7, -hd * 0.7, hw * 0.7, hd * 0.7], [h * 0.3, h * 0.6], { round: true, color: '#5c7a4e' }));
      return out;
    case 'mirror':
      add(P([-hw, -hd, hw, hd], [0, h], { round: w === h, tint: 0.85 }));              // frame
      add(P([-hw + 0.03, -hd - 0.004, hw - 0.03, -hd], [0.03, h - 0.03], { round: w === h, color: GLASS, alpha: 0.7 })); // glass
      add(P([-hw + 0.03, -hd - 0.006, hw - 0.03, -hd - 0.004], [h * 0.55, h - 0.03], { round: w === h, color: '#e8f1f8', alpha: 0.5 })); // reflection highlight
      return out;
    case 'picture':
      add(P([-hw, -hd, hw, hd], [0, h], { tint: 1 }));                                   // frame
      add(P([-hw + 0.04, -hd - 0.004, hw - 0.04, -hd], [0.04, h - 0.04], { color: '#e8e2d6' })); // mount
      add(P([-hw + 0.1, -hd - 0.006, hw - 0.1, -hd - 0.003], [0.1, h - 0.1], { color: '#9bb0c4' })); // print
      return out;
    case 'vase':
      add(P([-hw * 0.7, -hd * 0.7, hw * 0.7, hd * 0.7], [0, h * 0.12], { round: true, taper: 1.25, tint: 0.92 })); // foot
      add(P([-hw, -hd, hw, hd], [h * 0.12, h * 0.7], { round: true, taper: 0.7, tint: 1 }));
      add(P([-hw * 0.5, -hd * 0.5, hw * 0.5, hd * 0.5], [h * 0.7, h], { round: true, taper: 1.3, tint: 1 }));
      return out;
    case 'rug': {
      const t = Math.max(0.008, h);
      add(P([-hw, -hd, hw, hd], [0, t], { tint: 1 }));
      add(P([-hw + 0.08, -hd + 0.08, hw - 0.08, hd - 0.08], [t, t + 0.001], { tint: 1.12 }));   // border
      add(P([-hw + 0.16, -hd + 0.16, hw - 0.16, hd - 0.16], [t + 0.001, t + 0.002], { tint: 0.94 }));
      return out;
    }

    // ---------------------------------------------------------------- technical
    case 'stairs': {
      const steps = Math.max(2, Math.round(h / 0.175));
      return Array.from({ length: steps }, (_, i) => P([-hw, -hd + (d / steps) * i, hw, hd], [(h / steps) * i, (h / steps) * (i + 1)], { tint: i % 2 ? 1 : 0.97 }));
    }
    case 'column': case 'cylinder':
      return [P([-hw, -hd, hw, hd], [0, h], { round: true })];
    case 'flat':
      return [P([-hw, -hd, hw, hd], [0, Math.max(0.005, h)], {})];
    case 'door-panel':
      add(P([-hw, -hd, hw, hd], [0, h], { tint: 1 }));
      add(P([hw - 0.08, -hd - 0.02, hw - 0.05, hd + 0.02], [h * 0.45, h * 0.5], { color: METAL }));
      return out;
    default:
      return [P([-hw, -hd, hw, hd], [0, h], {})];
  }
}
