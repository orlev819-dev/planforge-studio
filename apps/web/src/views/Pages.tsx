import { useState } from 'react';
import { projectMetrics, formatArea, formatLength, formatVolume, createProject, addRectRoom, addOpening, addFurniture, roomEdgeWalls, createFloor } from '../../../../packages/geometry/src/index';
import { roomsCSV } from '../../../../packages/cad-io/src/tables';
import { catalogById } from '../../../../packages/shared-types/src/catalog';
import { go, persistProject, setState, useStore, toast } from '../store';
import { useT } from '../i18n';
import { LibraryPanel } from '../components/LibraryPanel';
import { download, safeName } from '../components/fields';
import { BUILD_ID } from '../build';

export function LibraryPage() {
  const { t } = useT();
  return <div className="page"><h1>{t('library')}</h1><p className="muted">{t('hintFurniture')}</p><LibraryPanel /></div>;
}

export function ReportsPage() {
  const { t } = useT();
  const projects = useStore((s) => s.projects.filter((p) => p.status !== 'deleted'));
  const [id, setId] = useState(projects[0]?.id ?? '');
  const p = projects.find((x) => x.id === id);
  if (!projects.length) return <div className="page"><h1>{t('reports')}</h1><p className="empty">{t('noProjects')}</p></div>;
  const m = p ? projectMetrics(p) : null;
  const u = p?.settings.unit ?? 'm', pr = p?.settings.precision ?? 2;
  return (
    <div className="page" data-testid="reports">
      <h1>{t('reports')}</h1>
      <div className="row">
        <select value={id} onChange={(e) => setId(e.target.value)}>{projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        {p && <button className="btn" onClick={() => download(`${safeName(p.name)}_rooms.csv`, roomsCSV(p), 'text/csv')}>CSV</button>}
        {p && <button className="btn primary" onClick={() => go({ page: 'editor', projectId: p.id })}>{t('open')} → {t('export')} PDF</button>}
      </div>
      {p && m && (
        <table className="report">
          <thead><tr><th>{t('floor')}</th><th>{t('room')}</th><th>{t('grossArea')}</th><th>{t('netArea')}</th><th>{t('perimeter')}</th><th>{t('height')}</th><th>{t('volume')}</th><th>{t('wallArea')}</th><th>{t('doors')}</th><th>{t('windows')}</th></tr></thead>
          <tbody>
            {m.floors.flatMap((f) => f.rooms.map((r) => (
              <tr key={r.roomId}><td>{f.floor.name}</td><td>{r.name}</td><td>{formatArea(r.grossArea, u, pr)}</td><td>{formatArea(r.netArea, u, pr)}</td><td>{formatLength(r.perimeter, u, pr)}</td><td>{formatLength(r.height, u, pr)}</td><td>{formatVolume(r.volume, u, pr)}</td><td>{formatArea(r.wallArea, u, pr)}</td><td>{r.doors}</td><td>{r.windows}</td></tr>
            )))}
          </tbody>
          <tfoot><tr><th colSpan={2}>{t('totals')}</th><th>{formatArea(m.grossArea, u, pr)}</th><th>{formatArea(m.netArea, u, pr)}</th><th colSpan={6} /></tr></tfoot>
        </table>
      )}
    </div>
  );
}

export function SettingsPage() {
  const { t } = useT();
  const lang = useStore((s) => s.lang);
  const theme = useStore((s) => s.theme);
  async function demo() {
    let f = createFloor('Ground floor');
    const a = addRectRoom(f, { x: 0, y: 0, width: 4.5, length: 3.8, name: 'Living room', height: 2.7 }); f = a.floor;
    const b = addRectRoom(f, { x: 4.5, y: 0, width: 3.2, length: 3.8, name: 'Kitchen', height: 2.7 }); f = b.floor;
    const c = addRectRoom(f, { x: 0, y: 3.8, width: 3.5, length: 3.2, name: 'Bedroom', height: 2.7 }); f = c.floor;
    const w = roomEdgeWalls(f, f.rooms[a.roomId]);
    f = addOpening(f, w[0]!.id, 'window', 2.25, { width: 1.6 }).floor;
    f = addOpening(f, w[4]!.id, 'door', 1.5, { width: 0.9 }).floor;
    const shared = Object.values(f.walls).filter((x) => !x.exterior);
    for (const s of shared) f = addOpening(f, s.id, 'door', 1, { width: 0.8 }).floor;
    const put = (id: string, x: number, y: number, rotation = 0) => { const it = catalogById(id)!; f = addFurniture(f, { catalogId: id, name: it.name.en, category: it.category, x, y, rotation, width: it.width, depth: it.depth, height: it.height, elevation: it.elevation ?? 0, mirrored: false, layer: 'furniture', color: it.color, meta: { shape: it.shape } }).floor; };
    put('sofa-3', 2.2, 3.2, 180); put('coffee-table', 2.2, 2.2); put('dining-table', 6.1, 1.9); put('fridge', 7.25, 0.5); put('bed-double', 1.75, 5.6);
    const p = { ...createProject('Demo apartment (sample)', { isDemo: true, address: 'Demo content', description: 'Clearly labelled demo project' }), floors: [f] };
    await persistProject(p);
    toast('Demo project created');
  }
  return (
    <div className="page" data-testid="settings">
      <h1>{t('settings')}</h1>
      <label className="field"><span>{t('language')}</span><select data-testid="lang-select" value={lang} onChange={(e) => setState({ lang: e.target.value as 'en' | 'he' })}><option value="en">English</option><option value="he">עברית</option></select></label>
      <label className="field"><span>{t('theme')}</span><select data-testid="theme-select" value={theme} onChange={(e) => setState({ theme: e.target.value as 'light' | 'dark' })}><option value="light">{t('light')}</option><option value="dark">{t('dark')}</option></select></label>
      <hr />
      <button className="btn" onClick={demo}>Create demo project (labelled as demo)</button>
      <hr />
      <p className="muted" data-testid="build-id">Build: {BUILD_ID}</p>
      <h3>Build capability status</h3>
      <ul className="caps">
        <li>✓ 2D editor, geometry kernel, 3D (WebGL), IndexedDB autosave, undo/redo, version snapshots</li>
        <li>✓ Export: PDF (to scale), SVG, DXF R12, PNG/JPEG, GLB, OBJ, JSON, CSV</li>
        <li>✓ Import: PDF/PNG/JPG/SVG as calibrated reference layer, project JSON</li>
        <li>✕ Accounts, cloud sync, teams/permissions, comments — server not part of this build</li>
        <li>✕ Cost estimation, photos/attachments — not implemented yet</li>
        <li>✕ LiDAR/RoomPlan/ARCore scanning, Bluetooth lasers — require native apps (not available in a browser build)</li>
        <li>✕ USDZ, IFC, XLSX export, DXF import — not supported yet</li>
      </ul>
    </div>
  );
}
