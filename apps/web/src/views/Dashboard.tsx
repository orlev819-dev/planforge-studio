import { useMemo, useState } from 'react';
import type { Project } from '../../../../packages/shared-types/src/index';
import { projectMetrics, formatArea, duplicateProject, parseProject } from '../../../../packages/geometry/src/index';
import { buildDrawing, toSVG, readProjectJSON } from '../../../../packages/cad-io/src/index';
import { go, newProject, persistProject, removeProjectForever, toast, useStore } from '../store';
import { useT } from '../i18n';
import { Modal } from '../components/fields';
import { uid } from '../../../../packages/geometry/src/model';

const thumbCache = new WeakMap<Project, string>();
function thumbnail(p: Project): string | null {
  const f = p.floors.find((x) => Object.keys(x.rooms).length);
  if (!f) return null;
  if (!thumbCache.has(p)) {
    const svg = toSVG(buildDrawing(f, { unit: p.settings.unit, precision: 1, dimensions: false, labels: false, annotations: false }), { background: '#fbfbfa' });
    thumbCache.set(p, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  }
  return thumbCache.get(p)!;
}

export function Dashboard() {
  const { t, lang } = useT();
  const projects = useStore((s) => s.projects);
  const loaded = useStore((s) => s.loaded);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Project['status']>('active');
  const [sort, setSort] = useState<'modified' | 'name'>('modified');
  const [range, setRange] = useState<'all' | '7' | '30'>('all');
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<Project | null>(null);

  const list = useMemo(() => {
    const now = Date.now();
    return projects
      .filter((p) => p.status === tab)
      .filter((p) => `${p.name} ${p.address} ${p.description}`.toLowerCase().includes(q.toLowerCase()))
      .filter((p) => range === 'all' || now - p.updatedAt <= Number(range) * 86400000)
      .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name, lang) : b.updatedAt - a.updatedAt));
  }, [projects, q, tab, sort, range, lang]);

  const setStatus = (p: Project, status: Project['status']) => persistProject({ ...p, status, updatedAt: Date.now() });

  async function importJson(file: File) {
    try {
      const p = parseProject(readProjectJSON(await file.text()));
      const exists = projects.some((x) => x.id === p.id);
      await persistProject(exists ? { ...p, id: uid(), name: `${p.name} (imported)` } : p);
      toast(`Imported "${p.name}"`);
    } catch (e) { toast(`Import failed: ${(e as Error).message.slice(0, 200)}`, 'error'); }
  }

  return (
    <div className="dashboard" data-testid="dashboard">
      <header className="dash-head">
        <h1>{t('projects')}</h1>
        <div className="grow" />
        <label className="btn">{t('importJson')}<input type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importJson(f); e.target.value = ''; }} /></label>
        <button className="btn primary" data-testid="new-project" onClick={() => setCreating(true)}>＋ {t('newProject')}</button>
      </header>
      <div className="dash-filters">
        <input className="search" data-testid="project-search" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="seg">
          {(['active', 'archived', 'deleted'] as const).map((s) => <button key={s} className={tab === s ? 'on' : ''} onClick={() => setTab(s)}>{t(s === 'deleted' ? 'trash' : s)} ({projects.filter((p) => p.status === s).length})</button>)}
        </div>
        <select value={range} onChange={(e) => setRange(e.target.value as typeof range)} aria-label={t('modified')}>
          <option value="all">{t('modified')}: {t('all')}</option><option value="7">≤ 7d</option><option value="30">≤ 30d</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="sort"><option value="modified">{t('sortModified')}</option><option value="name">{t('sortName')}</option></select>
      </div>
      {loaded && !list.length && <p className="empty">{tab === 'active' && !q ? t('noProjects') : '—'}</p>}
      <div className="cards">
        {list.map((p) => {
          const m = projectMetrics(p);
          const th = thumbnail(p);
          return (
            <article key={p.id} className="card" data-testid="project-card">
              <button className="thumb" onClick={() => p.status !== 'deleted' && go({ page: 'editor', projectId: p.id })} aria-label={`${t('open')} ${p.name}`}>
                {th ? <img src={th} alt="" /> : <span className="muted">∅</span>}
              </button>
              <div className="card-body">
                <h3 title={p.name}>{p.name} {p.isDemo && <span className="badge">{t('demo')}</span>}</h3>
                {p.address && <div className="muted ellipsis">{p.address}</div>}
                <div className="card-meta">
                  <span>{p.floors.length} {t('floors')}</span>
                  <span data-testid="card-area">{formatArea(m.grossArea, p.settings.unit, 2)}</span>
                  <span>{new Date(p.updatedAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB')}</span>
                  <span className={`status ${p.status}`}>{t(p.status === 'deleted' ? 'trash' : p.status)}</span>
                </div>
                <div className="card-actions">
                  {p.status !== 'deleted' && <button className="btn sm" data-testid="open-project" onClick={() => go({ page: 'editor', projectId: p.id })}>{t('open')}</button>}
                  {p.status !== 'deleted' && <button className="btn sm" onClick={() => setRenaming(p)}>{t('rename')}</button>}
                  {p.status !== 'deleted' && <button className="btn sm" onClick={() => persistProject(duplicateProject(p))}>{t('duplicate')}</button>}
                  {p.status === 'active' && <button className="btn sm" onClick={() => setStatus(p, 'archived')}>{t('archive')}</button>}
                  {p.status === 'archived' && <button className="btn sm" onClick={() => setStatus(p, 'active')}>{t('unarchive')}</button>}
                  {p.status !== 'deleted' && <button className="btn sm danger" onClick={() => setStatus(p, 'deleted')}>{t('delete')}</button>}
                  {p.status === 'deleted' && <button className="btn sm" onClick={() => setStatus(p, 'active')}>{t('restore')}</button>}
                  {p.status === 'deleted' && <button className="btn sm danger" onClick={() => { if (confirm(`${t('deleteForever')}: ${p.name}?`)) void removeProjectForever(p.id); }}>{t('deleteForever')}</button>}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {creating && <ProjectForm title={t('newProject')} onClose={() => setCreating(false)} onSubmit={async (v) => { const p = await newProject(v.name, v.address, v.description); setCreating(false); go({ page: 'editor', projectId: p.id }); }} />}
      {renaming && <ProjectForm title={t('rename')} initial={renaming} onClose={() => setRenaming(null)} onSubmit={async (v) => { await persistProject({ ...renaming, ...v, updatedAt: Date.now() }); setRenaming(null); }} />}
    </div>
  );
}

function ProjectForm({ title, initial, onClose, onSubmit }: { title: string; initial?: Project; onClose: () => void; onSubmit: (v: { name: string; address: string; description: string }) => void }) {
  const { t } = useT();
  const [name, setName] = useState(initial?.name ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const submit = () => { if (!name.trim()) { toast(t('projectName'), 'error'); return; } onSubmit({ name: name.trim(), address, description }); };
  return (
    <Modal title={title} onClose={onClose} testId="project-form" footer={<><button className="btn" onClick={onClose}>{t('cancel')}</button><button className="btn primary" data-testid="project-submit" onClick={submit}>{initial ? t('save') : t('create')}</button></>}>
      <label className="field"><span>{t('projectName')}</span><input autoFocus data-testid="project-name-input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} /></label>
      <label className="field"><span>{t('address')}</span><input value={address} onChange={(e) => setAddress(e.target.value)} /></label>
      <label className="field"><span>{t('description')}</span><textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
    </Modal>
  );
}
