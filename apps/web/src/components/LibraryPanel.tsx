import { useMemo, useState } from 'react';
import { CATALOG, CATEGORIES } from '../../../../packages/shared-types/src/catalog';
import { setState, setTool, useStore } from '../store';
import { useT } from '../i18n';

export function LibraryPanel({ compact }: { compact?: boolean }) {
  const { t, lang } = useT();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const pending = useStore((s) => s.pendingCatalogId);
  const items = useMemo(() => CATALOG.filter((c) => (cat === 'all' || c.category === cat) && (`${c.name.en} ${c.name.he} ${c.category}`.toLowerCase().includes(q.toLowerCase()))), [q, cat]);
  return (
    <div className={`library ${compact ? 'compact' : ''}`} data-testid="library">
      <input className="search" placeholder={`${t('search').replace('projects', 'objects')}`} value={q} onChange={(e) => setQ(e.target.value)} data-testid="library-search" />
      <div className="chips">
        <button className={`chip ${cat === 'all' ? 'on' : ''}`} onClick={() => setCat('all')}>{t('all')}</button>
        {CATEGORIES.map((c) => <button key={c.id} className={`chip ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>{c[lang]}</button>)}
      </div>
      <div className="lib-grid">
        {items.map((c) => (
          <button key={c.id} draggable data-testid={`lib-${c.id}`} className={`lib-item ${pending === c.id ? 'on' : ''}`}
            onDragStart={(e) => { e.dataTransfer.setData('text/planforge-catalog', c.id); e.dataTransfer.effectAllowed = 'copy'; }}
            onClick={() => { setTool('furniture'); setState({ pendingCatalogId: c.id }); }} title={t('placeObject')}>
            <svg viewBox="-1.3 -1.3 2.6 2.6" width="36" height="36" aria-hidden>
              <rect x={-c.width / Math.max(c.width, c.depth)} y={-c.depth / Math.max(c.width, c.depth)} width={(2 * c.width) / Math.max(c.width, c.depth)} height={(2 * c.depth) / Math.max(c.width, c.depth)} fill={c.color} stroke="#555" strokeWidth="0.06" rx="0.08" />
            </svg>
            <span>{c.name[lang]}</span>
            <small>{Math.round(c.width * 100)}×{Math.round(c.depth * 100)}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
