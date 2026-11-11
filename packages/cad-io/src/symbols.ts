/**
 * Plan symbols for catalogue objects. Each shape returns the lines an architect would draw inside
 * its outline — the back and arms of a sofa, the swing of a cabinet door, the bowl of a basin, the
 * folds of a curtain — in the object's own coordinates (x across its width, y across its depth,
 * the front facing -y). The canvas, SVG, PDF and DXF all draw the same lines.
 */
import type { Vec2 } from '../../shared-types/src/index';
import type { Shape } from '../../shared-types/src/catalog';

export interface SymbolLine { pts: Vec2[]; closed?: boolean; dash?: boolean; thin?: boolean }

const pt = (x: number, y: number): Vec2 => ({ x, y });
const rect = (x0: number, y0: number, x1: number, y1: number, o: Partial<SymbolLine> = {}): SymbolLine =>
  ({ pts: [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)], closed: true, ...o });
const line = (...pts: Vec2[]): SymbolLine => ({ pts, closed: false });
const ellipse = (cx: number, cy: number, rx: number, ry: number, n = 28, o: Partial<SymbolLine> = {}): SymbolLine =>
  ({ pts: Array.from({ length: n }, (_, i) => pt(cx + Math.cos((i / n) * Math.PI * 2) * rx, cy + Math.sin((i / n) * Math.PI * 2) * ry)), closed: true, ...o });
/** evenly spaced spans with a gap, like door or drawer fronts */
const spans = (x0: number, x1: number, n: number) => Array.from({ length: n }, (_, i) => [x0 + ((x1 - x0) / n) * i, x0 + ((x1 - x0) / n) * (i + 1)] as const);

/** The lines drawn inside an object's outline on the plan. */
export function planSymbol(shape: Shape, w: number, d: number): SymbolLine[] {
  const hw = w / 2, hd = d / 2;
  const out: SymbolLine[] = [];
  /** cabinet fronts: a panel per door with its handle, which stays inside the outline */
  const doors = (x0: number, x1: number, n: number) => {
    const t = Math.min(0.05, d * 0.18);
    for (const [a, b] of spans(x0, x1, n)) {
      out.push(rect(a + 0.012, -hd, b - 0.012, -hd + t, { thin: true }));
      const hx = b - 0.012 - Math.min(0.07, (b - a) * 0.2);
      out.push(line(pt(hx, -hd + t * 0.25), pt(hx, -hd + t * 0.75)));
    }
  };
  switch (shape) {
    case 'sofa': case 'sofa-module': {
      const arm = shape === 'sofa' ? Math.min(0.18, w * 0.12) : 0.06;
      out.push(line(pt(-hw + arm, hd - 0.22), pt(hw - arm, hd - 0.22)));
      out.push(line(pt(-hw + arm, -hd), pt(-hw + arm, hd - 0.22)), line(pt(hw - arm, -hd), pt(hw - arm, hd - 0.22)));
      for (const [a] of spans(-hw + arm, hw - arm, Math.max(1, Math.round(w / 0.75))).slice(1)) out.push(line(pt(a, -hd + 0.05), pt(a, hd - 0.24)));
      return out;
    }
    case 'sofa-l': {
      const leg = Math.min(d * 0.62, d - 0.3);
      out.push(line(pt(-hw + 0.22, hd - 0.22), pt(hw - 0.18, hd - 0.22)));
      out.push(line(pt(-hw + 0.22, hd - 0.22), pt(-hw + 0.22, -hd + 0.18)));
      out.push(line(pt(-hw + leg, hd - leg), pt(hw - 0.18, hd - leg)), line(pt(-hw + leg, hd - leg), pt(-hw + leg, -hd + 0.18)));
      return out;
    }
    case 'armchair':
      out.push(line(pt(-hw + 0.14, hd - 0.2), pt(hw - 0.14, hd - 0.2)));
      out.push(line(pt(-hw + 0.14, -hd), pt(-hw + 0.14, hd - 0.2)), line(pt(hw - 0.14, -hd), pt(hw - 0.14, hd - 0.2)));
      return out;
    case 'pouffe': case 'stool': return [ellipse(0, 0, hw, hd)];
    case 'chair':
      out.push(line(pt(-hw + 0.03, hd - 0.06), pt(hw - 0.03, hd - 0.06)));
      out.push(rect(-hw + 0.04, -hd + 0.04, hw - 0.04, hd - 0.08, { thin: true }));
      return out;
    case 'office-chair':
      out.push(ellipse(0, 0, hw * 0.8, hd * 0.8), line(pt(-hw * 0.75, hd * 0.45), pt(hw * 0.75, hd * 0.45)));
      return out;
    case 'bench': out.push(rect(-hw + 0.04, -hd + 0.04, hw - 0.04, hd - 0.04, { thin: true })); return out;
    case 'lounger':
      out.push(line(pt(-hw, hd * 0.5), pt(hw, hd * 0.5)));
      for (const y of [hd * 0.66, hd * 0.82]) out.push(line(pt(-hw, y), pt(hw, y)));
      return out;

    case 'table': case 'desk': case 'counter':
      out.push(rect(-hw + 0.05, -hd + 0.05, hw - 0.05, hd - 0.05, { thin: true }));
      return out;
    case 'table-round': out.push(ellipse(0, 0, hw, hd), ellipse(0, 0, hw * 0.55, hd * 0.55, 20, { thin: true })); return out;

    case 'cabinet': case 'kitchen-base': case 'vanity': case 'island': case 'wardrobe':
      doors(-hw, hw, Math.max(1, Math.round(w / 0.55)));
      return out;
    case 'kitchen-upper':
      out.push(rect(-hw, -hd, hw, hd, { dash: true }));
      for (const [a] of spans(-hw, hw, Math.max(1, Math.round(w / 0.5))).slice(1)) out.push(line(pt(a, -hd), pt(a, hd)));
      return out;
    case 'kitchen-tall': case 'wardrobe-sliding': {
      const n = Math.max(2, Math.round(w / (shape === 'kitchen-tall' ? 0.6 : 1.0)));
      for (const [a, b] of spans(-hw, hw, n)) {
        out.push(line(pt(a, -hd + 0.02), pt(b, -hd + 0.02)));
        if (shape === 'wardrobe-sliding') out.push(line(pt((a + b) / 2 - 0.08, -hd + 0.06), pt((a + b) / 2 + 0.08, -hd + 0.06)));
      }
      out.push(line(pt(-hw, hd - 0.02), pt(hw, hd - 0.02)));
      return out;
    }
    case 'kitchen-drawers': case 'dresser':
      out.push(line(pt(-hw, -hd + 0.03), pt(hw, -hd + 0.03)));
      out.push(line(pt(-hw * 0.5, -hd + 0.03), pt(hw * 0.5, -hd + 0.03)));
      out.push(rect(-hw + 0.03, -hd + 0.03, hw - 0.03, hd - 0.03, { thin: true }));
      return out;
    case 'kitchen-corner':
      out.push(line(pt(-hw, hd), pt(hw, -hd)));
      doors(-hw * 0.5, hw * 0.5, 1);
      return out;
    case 'shelf':
      for (const [a] of spans(-hw, hw, Math.max(2, Math.round(w / 0.4))).slice(1)) out.push(line(pt(a, -hd), pt(a, hd)));
      return out;

    case 'bed': case 'bed-kids': case 'bunk':
      out.push(line(pt(-hw, hd - 0.1), pt(hw, hd - 0.1)));                       // headboard
      out.push(line(pt(-hw, hd * 0.25), pt(hw, hd * 0.25)));                   // duvet fold
      for (const [a, b] of spans(-hw + 0.08, hw - 0.08, w > 1.2 ? 2 : 1))
        out.push(rect(a + 0.04, hd - 0.52, b - 0.04, hd - 0.14, { thin: true })); // pillows
      return out;
    case 'crib':
      out.push(rect(-hw + 0.05, -hd + 0.05, hw - 0.05, hd - 0.05, { thin: true }));
      return out;

    case 'fridge': case 'fridge-side': case 'dishwasher': case 'washer': case 'oven': case 'microwave': case 'coffee': case 'boiler':
      out.push(line(pt(-hw, -hd + 0.04), pt(hw, -hd + 0.04)));
      if (shape === 'fridge-side') out.push(line(pt(0, -hd + 0.04), pt(0, hd)));
      if (shape === 'washer' || shape === 'dishwasher') out.push(ellipse(0, -hd + 0.04 + Math.min(0.18, d * 0.3), Math.min(hw * 0.55, 0.18), Math.min(hw * 0.55, 0.18), 20, { thin: true }));
      if (shape === 'oven') out.push(rect(-hw + 0.05, -hd + 0.05, hw - 0.05, -hd + 0.1, { thin: true }));
      return out;
    case 'cooktop':
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const)
        out.push(ellipse(sx * hw * 0.45, sy * hd * 0.45, Math.min(hw, hd) * 0.3, Math.min(hw, hd) * 0.3, 18));
      return out;
    case 'hood':
      out.push(rect(-hw * 0.5, -hd * 0.5, hw * 0.5, hd * 0.5, { dash: true }));
      return out;
    case 'ac': out.push(line(pt(-hw + 0.04, -hd + 0.015), pt(hw - 0.04, -hd + 0.015))); return out;
    case 'tv': out.push(line(pt(-hw * 0.18, hd), pt(hw * 0.18, hd))); return out;

    case 'toilet':
      out.push(ellipse(0, -hd + 0.26, hw * 0.78, hd * 0.42, 24));
      out.push(line(pt(-hw, hd - 0.2), pt(hw, hd - 0.2)));
      return out;
    case 'toilet-wall':
      out.push(ellipse(0, 0, hw * 0.8, hd * 0.8, 24), line(pt(-hw, hd - 0.04), pt(hw, hd - 0.04)));
      return out;
    case 'bidet': out.push(ellipse(0, 0, hw * 0.8, hd * 0.8, 24)); return out;
    case 'basin': case 'sink':
      out.push(ellipse(0, 0, hw * 0.78, hd * 0.7, 24), ellipse(0, hd * 0.55, 0.035, 0.035, 10));
      return out;
    case 'bath':
      out.push(rect(-hw + 0.06, -hd + 0.06, hw - 0.06, hd - 0.06, { thin: true }));
      out.push(ellipse(hw - 0.22, 0, 0.05, 0.05, 12));
      return out;
    case 'shower':
      out.push(line(pt(-hw, -hd), pt(hw, hd)), line(pt(hw, -hd), pt(-hw, hd)));
      out.push(ellipse(0, 0, Math.min(hw, hd) * 0.18, Math.min(hw, hd) * 0.18, 12));
      return out;
    case 'shower-screen': return [];
    case 'towel': out.push(line(pt(-hw, -hd + 0.02), pt(hw, -hd + 0.02))); return out;

    case 'curtain': case 'curtain-sheer': {
      const folds = Math.max(6, Math.round(w / 0.16));
      const pts: Vec2[] = [];
      for (let i = 0; i <= folds; i++) pts.push(pt(-hw + (w / folds) * i, i % 2 ? hd : -hd));
      out.push({ pts, closed: false });
      return out;
    }
    case 'roller': case 'venetian':
      out.push(line(pt(-hw, 0), pt(hw, 0)));
      out.push(rect(-hw, -hd, hw, hd, { dash: true }));
      return out;

    case 'pendant': case 'ceiling-lamp': case 'spot': case 'sconce': case 'table-lamp': case 'floor-lamp':
      out.push(ellipse(0, 0, hw, hd, 20), line(pt(-hw, -hd), pt(hw, hd)), line(pt(hw, -hd), pt(-hw, hd)));
      return out;

    case 'plant': case 'planter':
      out.push(ellipse(0, 0, hw * 0.9, hd * 0.9, 20, { thin: true }));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        out.push(ellipse(Math.cos(a) * hw * 0.45, Math.sin(a) * hd * 0.45, hw * 0.35, hd * 0.35, 14, { thin: true }));
      }
      return out;
    case 'parasol': out.push(ellipse(0, 0, hw, hd, 24), ellipse(0, 0, 0.06, 0.06, 10)); return out;
    case 'bbq': out.push(ellipse(0, 0, hw * 0.75, hd * 0.75, 20)); return out;
    case 'mirror': case 'picture': out.push(rect(-hw + 0.03, -hd, hw - 0.03, hd, { thin: true })); return out;
    case 'vase': out.push(ellipse(0, 0, hw * 0.8, hd * 0.8, 16)); return out;
    case 'rug': out.push(rect(-hw + 0.1, -hd + 0.1, hw - 0.1, hd - 0.1, { dash: true, thin: true })); return out;

    case 'stairs': {
      const steps = Math.max(2, Math.round(d / 0.28));
      for (let i = 1; i < steps; i++) out.push(line(pt(-hw, -hd + (d / steps) * i), pt(hw, -hd + (d / steps) * i)));
      out.push(line(pt(0, -hd + 0.1), pt(0, hd - 0.1)), line(pt(-0.08, hd - 0.25), pt(0, hd - 0.1)), line(pt(0.08, hd - 0.25), pt(0, hd - 0.1)));
      return out;
    }
    case 'column': case 'cylinder': return [ellipse(0, 0, hw, hd, 24)];
    default: return out;
  }
}
