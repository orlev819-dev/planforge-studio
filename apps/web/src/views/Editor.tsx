import { useEffect, useRef, useState } from 'react';
import type { Vec2 } from '../../../../packages/shared-types/src/index';
import { addFloor, duplicateFloor, removeFloor, updateFloorProps, dist, formatLength, parseLength } from '../../../../packages/geometry/src/index';
import { projectJSON } from '../../../../packages/cad-io/src/tables';
import { Canvas2D } from '../editor/Canvas2D';
import { Viewer3DView } from './Viewer3DView';
import { Inspector } from '../components/Inspector';
import { LibraryPanel } from '../components/LibraryPanel';
import { ExportDialog } from '../components/ExportDialog';
import { RoomDialog } from '../components/RoomDialog';
import { ImportDialog } from '../components/ImportDialog';
import { LaserButton } from '../components/LaserButton';
import { Modal, download, safeName } from '../components/fields';
import { editProject, go, redo, setState, setTool, undo, useStore, currentFloor, toast, saveNow, getState, persistProject, type Tool, type LayerKey } from '../store';
import { dbApi, type Snapshot } from '../db';
import { useT, type TKey } from '../i18n';
import { Icon, type IconName } from '../components/Icon';
import { useCoarse } from '../components/fields';

const TOOLS: { id: Tool; key: TKey; icon: IconName; kbd?: string; primary?: boolean }[] = [
  { id: 'select', key: 'select', icon: 'select', kbd: 'V', primary: true },
  { id: 'pan', key: 'pan', icon: 'pan', kbd: 'H', primary: true },
  { id: 'room', key: 'room', icon: 'room', kbd: 'R', primary: true },
  { id: 'wall', key: 'wall', icon: 'wall', kbd: 'W', primary: true },
  { id: 'railing', key: 'railing', icon: 'railing', kbd: 'B', primary: true },
  { id: 'door', key: 'door', icon: 'door', kbd: 'D', primary: true },
  { id: 'window', key: 'window', icon: 'window', kbd: 'N', primary: true },
  { id: 'opening', key: 'opening', icon: 'opening', primary: true },
  { id: 'dimension', key: 'dimension', icon: 'dimension', kbd: 'M', primary: true },
  { id: 'corner', key: 'corner', icon: 'corner' },
  { id: 'ceiling', key: 'ceiling', icon: 'ceiling', kbd: 'C' },
  { id: 'furniture', key: 'furniture', icon: 'furniture' },
  { id: 'annotation', key: 'annotation', icon: 'note' },
  { id: 'eraser', key: 'eraser', icon: 'eraser', kbd: 'E' },
];

export function Editor() {
  const { t } = useT();
  const project = useStore((s) => s.project);
  const floor = useStore((s) => currentFloor(s));
  const tool = useStore((s) => s.tool);
  const view = useStore((s) => s.view);
  const save = useStore((s) => s.save);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const [dialog, setDialog] = useState<null | 'export' | 'room' | 'import' | 'share' | 'versions' | 'layers'>(null);
  const [side, setSide] = useState<'props' | 'library'>('props');
  // iPad portrait / narrow touch screens: the side panel is a slide-over drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const coarse = useCoarse();
  // draggable 2D | 3D splitter (split view)
  const [ratio, setRatio] = useState(() => { const v = Number(localStorage.getItem('planforge.split')); return v >= 0.2 && v <= 0.8 ? v : 0.5; });
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragSplit = (e: React.PointerEvent) => {
    const el = stageRef.current; if (!el) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const move = (ev: PointerEvent) => {
      const b = el.getBoundingClientRect();
      const r = Math.min(0.8, Math.max(0.2, (ev.clientX - b.left) / b.width));
      setRatio(r);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setRatio((r) => { localStorage.setItem('planforge.split', String(r)); return r; }); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const [calib, setCalib] = useState<{ a: Vec2; b: Vec2 } | null>(null);

  const selection = useStore((s) => s.selection);
  useEffect(() => { if (tool === 'furniture') { setSide('library'); setDrawerOpen(true); } }, [tool]);
  // after placing / picking something, show its properties
  useEffect(() => { if (selection.length && tool !== 'furniture') { setSide('props'); setDrawerOpen(true); } else if (!selection.length && tool !== 'furniture') setDrawerOpen(false); }, [selection]); // eslint-disable-line
  // switching 2D/3D/Split should never leave the drawer covering the new view
  useEffect(() => { setDrawerOpen(false); }, [view]);
  if (!project || !floor) return null;

  const saveLabel = save === 'saving' ? t('saving') : save === 'dirty' ? t('unsaved') : save === 'error' ? t('saveError') : t('saved');
  return (
    <div className="editor" data-testid="editor">
      <div className="topbar">
        <button className="icon-btn" onClick={() => go({ page: 'dashboard' })} title={t('dashboard')} aria-label={t('dashboard')}><Icon name="back" size={20} /></button>
        <input className="project-name" data-testid="project-title" value={project.name} onChange={(e) => setState({ project: { ...project, name: e.target.value } })} onBlur={(e) => editProject('Rename project', (p) => ({ ...p, name: e.target.value.trim() || p.name }))} />
        <div className="sep" />
        <button className="btn sm" data-testid="undo" disabled={!canUndo} onClick={undo} title="Ctrl+Z"><Icon name="undo" size={18} /> <span className="lbl">{t('undo')}</span></button>
        <button className="btn sm" data-testid="redo" disabled={!canRedo} onClick={redo} title="Ctrl+Shift+Z"><Icon name="redo" size={18} /> <span className="lbl">{t('redo')}</span></button>
        <span className={`save-state ${save}`} data-testid="save-state">{saveLabel}</span>
        <div className="sep" />
        <FloorSelector />
        <div className="seg" role="tablist">
          {(['2d', '3d', 'split'] as const).map((v) => <button key={v} role="tab" data-testid={`view-${v}`} className={view === v ? 'on' : ''} onClick={() => setState({ view: v })}>{v === 'split' && <Icon name="split" size={16} />}{t(v === '2d' ? 'view2d' : v === '3d' ? 'view3d' : 'split')}</button>)}
        </div>
        <div className="seg zoom-seg">
          <button onClick={() => window.dispatchEvent(new CustomEvent('planforge:zoom', { detail: 1 / 1.25 }))} aria-label="zoom out">−</button>
          <button onClick={() => window.dispatchEvent(new Event('planforge:fit'))}>{t('fitView')}</button>
          <button onClick={() => window.dispatchEvent(new CustomEvent('planforge:zoom', { detail: 1.25 }))} aria-label="zoom in">+</button>
        </div>
        <div className="grow" />
        <LaserButton />
        <button className="btn sm hide-touch" onClick={() => setDialog('versions')}>{t('versions')}</button>
        <button className="btn sm" onClick={() => setDialog('share')}><Icon name="share" size={18} /> <span className="lbl">{t('share')}</span></button>
        <button className="btn sm primary" data-testid="export-open" onClick={() => setDialog('export')}><Icon name="export" size={18} /> {t('export')}</button>
        <button className={`btn sm drawer-toggle ${drawerOpen ? 'on' : ''}`} data-testid="drawer-toggle" onClick={() => setDrawerOpen(!drawerOpen)} aria-expanded={drawerOpen}><Icon name="layers" size={18} /> {t('inspector')}</button>
      </div>
      <div className={`editor-main ${drawerOpen ? 'drawer-open' : ''}`}>
        <div className="toolbar" role="toolbar">
          {TOOLS.filter((tl) => !coarse || tl.primary).map((tl) => (
            <button key={tl.id} data-testid={`tool-${tl.id}`} className={tool === tl.id ? 'on' : ''}
              title={tl.id === 'room' ? `${t('room')} — ${t('roomDialog')}` : `${t(tl.key)}${tl.kbd ? ` (${tl.kbd})` : ''}`}
              onClick={() => { if (tl.id === 'room' && tool === 'room') setDialog('room'); else setTool(tl.id); }}>
              <span className="ti"><Icon name={tl.icon} /></span><span className="tl">{t(tl.key)}</span>
            </button>
          ))}
          {!coarse && <>
            <hr />
            <button data-testid="room-dialog-open" title={t('roomDialog')} onClick={() => setDialog('room')}><span className="ti"><Icon name="roomExact" /></span><span className="tl">{t('room')} …</span></button>
            <button data-testid="import-open" title={t('importPlan')} onClick={() => setDialog('import')}><span className="ti"><Icon name="import" /></span><span className="tl">{t('import')}</span></button>
            <button title={t('layers')} onClick={() => setDialog('layers')}><span className="ti"><Icon name="layers" /></span><span className="tl">{t('layers')}</span></button>
          </>}
          {coarse && (
            <button data-testid="tool-more" className={moreOpen ? 'on' : ''} title={t('more')} onClick={() => setMoreOpen(!moreOpen)}>
              <span className="ti"><Icon name="more" /></span><span className="tl">{t('more')}</span>
            </button>
          )}
          {coarse && moreOpen && (
            <div className="more-sheet" data-testid="more-sheet" onPointerDown={(e) => e.stopPropagation()}>
              {TOOLS.filter((tl) => !tl.primary).map((tl) => (
                <button key={tl.id} data-testid={`tool-${tl.id}`} className={tool === tl.id ? 'on' : ''} onClick={() => { setTool(tl.id); setMoreOpen(false); }}>
                  <span className="ti"><Icon name={tl.icon} /></span><span className="tl">{t(tl.key)}</span>
                </button>
              ))}
              <button data-testid="room-dialog-open" onClick={() => { setDialog('room'); setMoreOpen(false); }}><span className="ti"><Icon name="roomExact" /></span><span className="tl">{t('room')} …</span></button>
              <button data-testid="import-open" onClick={() => { setDialog('import'); setMoreOpen(false); }}><span className="ti"><Icon name="import" /></span><span className="tl">{t('import')}</span></button>
              <button onClick={() => { setDialog('layers'); setMoreOpen(false); }}><span className="ti"><Icon name="layers" /></span><span className="tl">{t('layers')}</span></button>
              <button onClick={() => { setDialog('versions'); setMoreOpen(false); }}><span className="ti"><Icon name="undo" /></span><span className="tl">{t('versions')}</span></button>
            </div>
          )}
        </div>
        <div className={`stage view-${view}`} ref={stageRef} style={view === 'split' ? { gridTemplateColumns: `${ratio}fr 12px ${1 - ratio}fr` } : undefined}>
          {view !== '3d' && <div className="stage-2d"><Canvas2D floor={floor} onCalibrate={(a, b) => setCalib({ a, b })} /></div>}
          {view === 'split' && <div className="splitter" data-testid="splitter" role="separator" aria-orientation="vertical" onPointerDown={dragSplit}><span /></div>}
          {view !== '2d' && <div className="stage-3d"><Viewer3DView /></div>}
        </div>
        <aside className="sidebar" data-testid="sidebar">
          <button className="icon-btn drawer-close" data-testid="drawer-close" onClick={() => setDrawerOpen(false)} aria-label={t('close')}><Icon name="close" size={18} /></button>
          <div className="seg full">
            <button className={side === 'props' ? 'on' : ''} onClick={() => setSide('props')}>{t('inspector')}</button>
            <button className={side === 'library' ? 'on' : ''} data-testid="tab-library" onClick={() => setSide('library')}>{t('furniture')}</button>
          </div>
          {side === 'props' ? <Inspector /> : <LibraryPanel compact />}
        </aside>
      </div>
      <StatusBar />
      {dialog === 'export' && <ExportDialog onClose={() => setDialog(null)} />}
      {dialog === 'room' && <RoomDialog onClose={() => setDialog(null)} />}
      {dialog === 'import' && <ImportDialog onClose={() => setDialog(null)} />}
      {dialog === 'share' && <Modal title={t('share')} onClose={() => setDialog(null)}><p>{t('shareInfo')}</p><button className="btn" onClick={() => download(`${safeName(project.name)}.planforge.json`, projectJSON(project), 'application/json')}>{t('backup')}</button></Modal>}
      {dialog === 'versions' && <VersionsDialog onClose={() => setDialog(null)} />}
      {dialog === 'layers' && <LayersDialog onClose={() => setDialog(null)} />}
      {calib && <CalibrateDialog a={calib.a} b={calib.b} onClose={() => setCalib(null)} />}
    </div>
  );
}

function FloorSelector() {
  const { t } = useT();
  const project = useStore((s) => s.project)!;
  const floorId = useStore((s) => currentFloor(s)?.id);
  return (
    <div className="floor-sel">
      <select data-testid="floor-select" value={floorId} onChange={(e) => setState({ floorId: e.target.value, selection: [] })} aria-label={t('floor')}>
        {project.floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
      </select>
      <button className="icon-btn" data-testid="floor-add" title={t('addFloor')} onClick={() => editProject('Add floor', (p) => addFloor(p))}>＋</button>
      <button className="icon-btn" title={t('duplicateFloor')} onClick={() => editProject('Duplicate floor', (p) => duplicateFloor(p, floorId!))}>⧉</button>
      <button className="icon-btn" title={t('deleteFloor')} disabled={project.floors.length < 2} onClick={() => { if (confirm(`${t('deleteFloor')}?`)) editProject('Delete floor', (p) => { const np = removeFloor(p, floorId!); return { project: np, floorId: np.floors[0].id }; }); }}>🗑</button>
    </div>
  );
}

function StatusBar() {
  const { t, lang } = useT();
  const project = useStore((s) => s.project)!;
  const cursor = useStore((s) => s.cursor);
  const zoom = useStore((s) => s.zoom);
  const save = useStore((s) => s.save);
  const set = (patch: Partial<typeof project.settings>) => editProject('Settings', (p) => ({ ...p, settings: { ...p.settings, ...patch } }));
  // on-screen scale at a nominal 96 dpi: 1 m = zoom px = zoom/96*25.4 mm  =>  1 : 1000 / (zoom/96*25.4)
  const denom = Math.round(1000 / ((zoom / 96) * 25.4));
  const fmt = (m: number) => formatLength(m, project.settings.unit, project.settings.precision);
  return (
    <div className="statusbar" data-testid="statusbar">
      <span>{t('scale')} ≈ 1:{denom}</span>
      <span className="cursor-pos" data-testid="cursor-pos" dir="ltr">{cursor ? `X ${fmt(cursor.x)}  Y ${fmt(cursor.y)}` : '—'}</span>
      <label>{t('units')} <select data-testid="unit-select" value={project.settings.unit} onChange={(e) => set({ unit: e.target.value as typeof project.settings.unit })}><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option><option value="ft-in">ft-in</option></select></label>
      <label>{t('precision')} <select value={project.settings.precision} onChange={(e) => set({ precision: Number(e.target.value) })}>{[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
      <label className="check"><input type="checkbox" checked={project.settings.snap} onChange={(e) => set({ snap: e.target.checked })} /> {t('snap')}</label>
      <label className="check"><input type="checkbox" checked={project.settings.showGrid} onChange={(e) => set({ showGrid: e.target.checked })} /> {t('grid')}</label>
      <span className="grow" />
      <PencilHint />
      <span>{lang === 'he' ? 'עברית' : 'English'}</span>
      <span className={`save-state ${save}`}>{save === 'saved' ? '●' : save === 'dirty' || save === 'saving' ? '◐' : save === 'error' ? '✕' : '○'}</span>
    </div>
  );
}

function PencilHint() {
  const { t } = useT();
  const coarse = useCoarse();
  if (!coarse) return null;
  return <span className="pencil-hint" data-testid="pencil-hint"><Icon name="note" size={15} /> {t('pencilHint')} <Icon name="info" size={15} /></span>;
}

function LayersDialog({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const layers = useStore((s) => s.layers);
  const names: Record<LayerKey, TKey> = { rooms: 'roomsList', walls: 'walls', openings: 'opening', furniture: 'furniture', ceilings: 'ceiling', dimensions: 'dimension', text: 'text', annotations: 'annotation', reference: 'reference' };
  return (
    <Modal title={t('layers')} onClose={onClose}>
      {(Object.keys(layers) as LayerKey[]).map((k) => (
        <label key={k} className="check"><input type="checkbox" checked={layers[k]} onChange={(e) => setState({ layers: { ...layers, [k]: e.target.checked } })} /> {t(names[k])}</label>
      ))}
    </Modal>
  );
}

function CalibrateDialog({ a, b, onClose }: { a: Vec2; b: Vec2; onClose: () => void }) {
  const { t } = useT();
  const floor = useStore((s) => currentFloor(s))!;
  const unit = useStore((s) => s.project!.settings.unit);
  const [val, setVal] = useState('');
  const measured = dist(a, b);
  function apply() {
    const real = parseLength(val, unit);
    const ref = floor.reference;
    if (!real || real <= 0 || !ref || measured < 1e-6) { toast('Enter a valid distance.', 'error'); return; }
    const k = real / measured;
    // scale about point a so the first picked point stays fixed
    editProject('Calibrate reference', (p) => updateFloorProps(p, floor.id, { reference: { ...ref, scale: ref.scale * k, x: a.x + (ref.x - a.x) * k, y: a.y + (ref.y - a.y) * k, calibrated: true, locked: true } }));
    onClose();
    window.dispatchEvent(new Event('planforge:fit'));
  }
  return (
    <Modal title={t('calibrate')} onClose={onClose} testId="calibrate-dialog" footer={<><button className="btn" onClick={onClose}>{t('cancel')}</button><button className="btn primary" data-testid="calibrate-apply" onClick={apply}>{t('apply')}</button></>}>
      <p className="muted">Current: {formatLength(measured, unit, 3)}</p>
      <label className="field"><span>{t('knownDistance')}</span><input autoFocus data-testid="calibrate-distance" value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && apply()} /></label>
    </Modal>
  );
}

function VersionsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const project = useStore((s) => s.project)!;
  const [list, setList] = useState<Snapshot[]>([]);
  const refresh = () => dbApi.listSnapshots(project.id).then((l) => setList(l.sort((x, y) => y.createdAt - x.createdAt)));
  useEffect(() => { void refresh(); }, []); // eslint-disable-line
  return (
    <Modal title={t('versions')} onClose={onClose}>
      <div className="row">
        <button className="btn primary" onClick={async () => { await saveNow(); await dbApi.putSnapshot({ id: crypto.randomUUID(), projectId: project.id, createdAt: Date.now(), label: `v${list.length + 1} · rev ${project.rev}`, project: getState().project! }); void refresh(); }}>{t('saveVersion')}</button>
        <button className="btn" onClick={() => download(`${safeName(project.name)}.planforge.json`, projectJSON(project), 'application/json')}>{t('backup')}</button>
      </div>
      <ul className="versions">
        {list.map((s) => (
          <li key={s.id}>
            <span>{s.label}</span><small>{new Date(s.createdAt).toLocaleString()}</small>
            <button className="btn sm" onClick={async () => {
              if (!confirm(`${t('restoreVersion')} "${s.label}"?`)) return;
              const restored = { ...s.project, updatedAt: Date.now(), rev: project.rev + 1 };
              editProject(`Restore ${s.label}`, () => restored);
              await persistProject(getState().project!);
              onClose();
            }}>{t('restoreVersion')}</button>
            <button className="icon-btn" onClick={async () => { await dbApi.deleteSnapshot(s.id); void refresh(); }}>✕</button>
          </li>
        ))}
        {!list.length && <li className="muted">—</li>}
      </ul>
    </Modal>
  );
}
