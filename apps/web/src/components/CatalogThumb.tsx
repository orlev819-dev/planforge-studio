import { planSymbol } from '../../../../packages/cad-io/src/symbols';
import type { CatalogItem } from '../../../../packages/shared-types/src/catalog';

/**
 * Thumbnail drawn from the object's own definition — the same outline and plan symbol that end up
 * on the drawing, so what you pick is what you get. No image files, nothing to download.
 */
export function CatalogThumb({ item, size = 44, color }: { item: CatalogItem; size?: number; color?: string }) {
  const k = Math.max(item.width, item.depth);
  const hw = item.width / k, hd = item.depth / k;
  const sym = planSymbol(item.shape, item.width, item.depth);
  const s = (v: number) => v / k;
  return (
    <svg viewBox="-1.15 -1.15 2.3 2.3" width={size} height={size} aria-hidden>
      <rect x={-hw} y={-hd} width={hw * 2} height={hd * 2} rx={0.04} fill={color ?? item.color} stroke="#4a4a4a" strokeWidth={0.05} />
      {sym.map((l, i) => (
        <polyline key={i} points={[...l.pts, ...(l.closed ? [l.pts[0]] : [])].map((p) => `${s(p.x)},${s(p.y)}`).join(' ')}
          fill="none" stroke="#3a3a3a" strokeWidth={l.thin ? 0.025 : 0.04} strokeDasharray={l.dash ? '0.07 0.05' : undefined} strokeLinejoin="round" />
      ))}
    </svg>
  );
}
