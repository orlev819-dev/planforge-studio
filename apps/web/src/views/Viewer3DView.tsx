import { useEffect, useMemo, useRef, useState } from 'react';
import { Viewer3D, type WallMode } from '../../../../packages/renderer-3d/src/webgl';
import { buildFloorMesh, type MeshPart } from '../../../../packages/renderer-3d/src/mesh';
import type { Floor } from '../../../../packages/shared-types/src/index';
import { select, useStore, currentFloor } from '../store';
import { useT } from '../i18n';

/** Per-floor mesh cache: floors are immutable, so identity tells us when to rebuild. */
const meshCache = new WeakMap<Floor, Map<string, MeshPart[]>>();
function floorMesh(f: Floor, ceilings: boolean) {
  let m = meshCache.get(f);
  if (!m) { m = new Map(); meshCache.set(f, m); }
  const k = String(ceilings);
  if (!m.has(k)) m.set(k, buildFloorMesh(f, { ceilings }));
  return m.get(k)!;
}

export function Viewer3DView() {
  const { t } = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<Viewer3D | null>(null);
  const [error, setError] = useState<string | null>(null);
  const project = useStore((s) => s.project)!;
  const floor = useStore((s) => currentFloor(s))!;
  const selection = useStore((s) => s.selection);
  const [allFloors, setAllFloors] = useState(false);
  const [ceilings, setCeilings] = useState(false);
  const [walls, setWalls] = useState<WallMode>('solid');
  const [walk, setWalk] = useState(false);
  const [stats, setStats] = useState({ parts: 0, uploads: 0 });

  useEffect(() => {
    try {
      const v = new Viewer3D(ref.current!);
      v.onPick = (id) => select(id ? [id] : []);
      viewer.current = v;
    } catch (e) { setError((e as Error).message); }
    return () => { viewer.current?.dispose(); viewer.current = null; };
  }, []);

  const parts = useMemo(() => (allFloors ? project.floors : [floor]).flatMap((f) => floorMesh(f, ceilings)), [project.floors, floor, allFloors, ceilings]);
  const first = useRef(true);
  useEffect(() => {
    const v = viewer.current; if (!v) return;
    v.setParts(parts);
    if (first.current) { v.fit(); first.current = false; }
    setStats({ parts: v.partCount, uploads: v.uploads });
  }, [parts]);
  useEffect(() => { viewer.current?.setSelected(selection[0] ?? null); }, [selection]);
  useEffect(() => { viewer.current?.setWallMode(walls); }, [walls]);
  useEffect(() => { viewer.current?.setWalk(walk); }, [walk]);

  if (error) return <div className="viewer-error" role="alert">3D unavailable: {error}</div>;
  return (
    <div className="viewer3d" data-testid="viewer-3d">
      <div className="viewer-toolbar">
        <button className="btn sm" onClick={() => { setWalk(false); viewer.current?.preset('perspective'); }}>{t('perspective')}</button>
        <button className="btn sm" onClick={() => { setWalk(false); viewer.current?.preset('top'); }}>{t('top')}</button>
        <button className="btn sm" onClick={() => { setWalk(false); viewer.current?.preset('iso'); }}>{t('iso')}</button>
        <button className={`btn sm ${walk ? 'on' : ''}`} onClick={() => setWalk(!walk)}>{t('walk')}</button>
        <button className="btn sm" onClick={() => viewer.current?.fit()}>{t('fitView')}</button>
        <select className="sm" value={walls} onChange={(e) => setWalls(e.target.value as WallMode)} aria-label={t('walls')}>
          <option value="solid">{t('walls')}: {t('solid')}</option><option value="transparent">{t('walls')}: {t('transparent')}</option><option value="hidden">{t('walls')}: {t('hidden')}</option>
        </select>
        <label className="check sm"><input type="checkbox" checked={ceilings} onChange={(e) => setCeilings(e.target.checked)} /> {t('ceilings')}</label>
        <label className="check sm"><input type="checkbox" checked={allFloors} onChange={(e) => setAllFloors(e.target.checked)} /> {t('allFloors')}</label>
        <span className="muted sm" data-testid="viewer-stats">{stats.parts} parts</span>
      </div>
      <canvas ref={ref} className="viewer-canvas" data-testid="viewer-canvas" />
    </div>
  );
}
