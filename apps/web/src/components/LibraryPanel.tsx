import { useMemo, useState } from 'react';
import { CATALOG, CATEGORIES } from '../../../../packages/shared-types/src/catalog';
import { editProject, setState, setTool, toast, useStore } from '../store';
import { ImportModelDialog } from './ImportModelDialog';
import { useT } from '../i18n';

export function LibraryPanel({ compact }: { compact?: boolean }) {
  const { t, lang } = useT();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const pending = useStore((s) => s.pendingCatalogId);
  const assets = useStore((s) => s.project?.assets ?? null);
  const inProject = useStore((s) => !!s.project);
  const [importing, setImporting] = useState(false);
  const items = useMemo(() => CATALOG.filter((c) => cat !== 'custom' && (cat === 'all' || c.category === cat) && (`${c.name.en} ${c.name.he} ${c.category}`.toLowerCase().includes(q.toLowerCase()))), [q, cat]);
  return (
    <div className={`library ${compact ? 'compact' : ''}`} data-testid="library">
      <input className="search" placeholder={`${t('search').replace('projects', 'objects')}`} value={q} onChange={(e) => setQ(e.target.value)} data-testid="library-search" />
      <div className="chips">
        <button className={`chip ${cat === 'all' ? 'on' : ''}`} onClick={() => setCat('all')}>{t('all')}</button>
        {inProject && <button className={`chip ${cat === 'custom' ? 'on' : ''}`} onClick={() => setCat('custom')}>{t('myModels')}</button>}
        {CATEGORIES.map((c) => <button key={c.id} className={`chip ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>{c[lang]}</button>)}
      </div>
      {inProject && (cat === 'all' || cat === 'custom') && (
        <div className="my-models">
          <div className="row"><b className="sm">{t('myModels')}</b><span className="grow" /><button className="btn sm" data-testid="model-import-open" onClick={() => setImporting(true)}>⇪ OBJ / STL</button></div>
          <div className="lib-grid">
            {Object.values(assets ?? {}).filter((a) => a.name.toLowerCase().includes(q.toLowerCase())).map((a) => (
              <div key={a.id} className={`lib-item ${pending === `asset:${a.id}` ? 'on' : ''}`} draggable data-testid={`asset-${a.name}`}
                onDragStart={(e) => { e.dataTransfer.setData('text/planforge-catalog', `asset:${a.id}`); e.dataTransfer.effectAllowed = 'copy'; }}
                onClick={() => { setTool('furniture'); setState({ pendingCatalogId: `asset:${a.id}` }); }} title={t('placeObject')}>
                <svg viewBox="-1.2 -1.2 2.4 2.4" width="36" height="36" aria-hidden>
                  <polygon points={a.hull.map((h) => `${(h.x / Math.max(a.size.x, a.size.z)) * 2},${(h.y / Math.max(a.size.x, a.size.z)) * 2}`).join(' ')} fill={a.color} stroke="#555" strokeWidth="0.06" />
                </svg>
                <span>{a.name}</span>
                <small>{Math.round(a.size.x * 100)}×{Math.round(a.size.z * 100)}×{Math.round(a.size.y * 100)}</small>
                <button className="icon-btn sm" title={t('delete')} onClick={(e) => {
                  e.stopPropagation();
                  editProject('Delete model', (p) => {
                    if (p.floors.some((f) => Object.values(f.furniture).some((fu) => fu.meta.modelId === a.id))) { toast(t('modelInUse'), 'error'); return p; }
                    const next = { ...p.assets }; delete next[a.id]; return { ...p, assets: next };
                  });
                }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {importing && <ImportModelDialog onClose={() => setImporting(false)} />}
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
