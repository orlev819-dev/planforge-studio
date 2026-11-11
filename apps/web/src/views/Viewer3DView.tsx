import { useEffect, useMemo, useRef, useState } from 'react';
import { Viewer3D, type WallMode, type SceneLight } from '../../../../packages/renderer-3d/src/webgl';
import { buildFloorMesh, type MeshPart } from '../../../../packages/renderer-3d/src/mesh';
import type { Floor, ModelAsset } from '../../../../packages/shared-types/src/index';
import { select, toast, useStore, currentFloor } from '../store';
import { useT } from '../i18n';

/** Per-floor mesh cache: floors are immutable, so identity tells us when to rebuild. */
const meshCache = new WeakMap<Floor, WeakMap<object, Map<string, MeshPart[]>>>();
function floorMesh(f: Floor, ceilings: boolean, assets: Record<string, ModelAsset>) {
  let byAssets = meshCache.get(f);
  if (!byAssets) { byAssets = new WeakMap(); meshCache.set(f, byAssets); }
  let m = byAssets.get(assets);
  if (!m) { m = new Map(); byAssets.set(assets, m); }
  const k = String(ceilings);
  if (!m.has(k)) m.set(k, buildFloorMesh(f, { ceilings, assets }));
  return m.get(k)!;
}
const NO_ASSETS: Record<string, ModelAsset> = {};

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
  const [light, setLight] = useState<SceneLight>('day');
  const [intensity, setIntensity] = useState(1);
  const [eye, setEye] = useState(1.65);
  const [stats, setStats] = useState({ parts: 0, uploads: 0 });

  useEffect(() => {
    try {
      const v = new Viewer3D(ref.current!);
      v.onPick = (id) => select(id ? [id] : []);
      viewer.current = v;
    } catch (e) { setError((e as Error).message); }
    return () => { viewer.current?.dispose(); viewer.current = null; };
  }, []);

  const parts = useMemo(() => (allFloors ? project.floors : [floor]).flatMap((f) => floorMesh(f, ceilings, project.assets ?? NO_ASSETS)), [project.floors, project.assets, floor, allFloors, ceilings]);
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
  useEffect(() => { viewer.current?.setLight(light); }, [light]);
  useEffect(() => { viewer.current?.setIntensity(intensity); }, [intensity]);
  useEffect(() => { viewer.current?.setEyeHeight(eye); }, [eye]);
  // walls and railings stop the walker; the list is rebuilt whenever the plan changes
  useEffect(() => {
    const segs = (allFloors ? project.floors : [floor]).flatMap((f) => Object.values(f.walls)
      .filter((w) => w.kind !== 'open')
      .map((w) => { const a = f.vertices[w.a], b = f.vertices[w.b]; return a && b ? [a.x, a.y, b.x, b.y, w.thickness / 2] : null; })
      .filter((x): x is number[] => !!x));
    viewer.current?.setBlockers(segs);
  }, [project.floors, floor, allFloors]);

  if (error) return <div className="viewer-error" role="alert">3D unavailable: {error}</div>;
  return (
    <div className="viewer3d" data-testid="viewer-3d">
      <div className="viewer-toolbar">
        <button className="btn sm" onClick={() => { setWalk(false); viewer.current?.preset('perspective'); }}>{t('perspective')}</button>
        <button className="btn sm" onClick={() => { setWalk(false); viewer.current?.preset('top'); }}>{t('top')}</button>
        <button className="btn sm" onClick={() => { setWalk(false); viewer.current?.preset('iso'); }}>{t('iso')}</button>
        <button className="btn sm" data-testid="view-dollhouse" onClick={() => { setWalk(false); setCeilings(false); viewer.current?.preset('dollhouse'); }}>{t('dollhouse')}</button>
        <button className={`btn sm ${walk ? 'on' : ''}`} data-testid="view-walk" onClick={() => setWalk(!walk)}>{t('walk')}</button>
        <button className="btn sm" onClick={() => viewer.current?.fit()}>{t('fitView')}</button>
        <select className="sm" data-testid="scene-light" value={light} onChange={(e) => setLight(e.target.value as SceneLight)} aria-label={t('daylight')}>
          <option value="morning">{t('morning')}</option><option value="day">{t('midday')}</option><option value="evening">{t('evening')}</option><option value="night">{t('night')}</option>
        </select>
        <label className="check sm" title={t('warmth')}>🔆
          <input type="range" data-testid="light-intensity" min={0.5} max={1.6} step={0.05} value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} style={{ width: 70 }} />
        </label>
        <button className="btn sm primary" data-testid="render-shot" onClick={() => {
          const v = viewer.current; if (!v) return;
          const url = v.capture(3, 'image/png');
          const a = document.createElement('a');
          a.href = url; a.download = `${project.name || 'planforge'}-render.png`; document.body.appendChild(a); a.click(); a.remove();
          toast(t('renderSaved'));
        }}>{t('render')}</button>
        <select className="sm" value={walls} onChange={(e) => setWalls(e.target.value as WallMode)} aria-label={t('walls')}>
          <option value="solid">{t('walls')}: {t('solid')}</option><option value="transparent">{t('walls')}: {t('transparent')}</option><option value="hidden">{t('walls')}: {t('hidden')}</option>
        </select>
        <label className="check sm"><input type="checkbox" checked={ceilings} onChange={(e) => setCeilings(e.target.checked)} /> {t('ceilings')}</label>
        <label className="check sm"><input type="checkbox" checked={allFloors} onChange={(e) => setAllFloors(e.target.checked)} /> {t('allFloors')}</label>
        <span className="muted sm" data-testid="viewer-stats">{stats.parts} parts</span>
      </div>
      <canvas ref={ref} className="viewer-canvas" data-testid="viewer-canvas" />
      {walk && (
        <div className="walk-opts" data-testid="walk-options">
          <label className="check sm">{t('eyeHeight')}
            <input type="range" data-testid="eye-height" min={0.8} max={2.0} step={0.05} value={eye} onChange={(e) => setEye(Number(e.target.value))} />
            <b>{eye.toFixed(2)} m</b>
          </label>
          <label className="check sm"><input type="checkbox" data-testid="walk-collide" defaultChecked onChange={(e) => { if (viewer.current) viewer.current.collide = e.target.checked; }} /> {t('collision')}</label>
        </div>
      )}
      {walk && (
        <div className="walk-pad" data-testid="walk-pad" aria-label="walk controls">
          {([['w', '▲', 'up'], ['arrowleft', '⟲', 'tl'], ['a', '◀', 'left'], ['d', '▶', 'right'], ['arrowright', '⟳', 'tr'], ['s', '▼', 'down']] as const).map(([k, lbl, cls]) => (
            <button key={k} className={`wp ${cls}`} data-testid={`walk-${k}`}
              onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); viewer.current?.setKey(k, true); }}
              onPointerUp={() => viewer.current?.setKey(k, false)} onPointerCancel={() => viewer.current?.setKey(k, false)} onPointerLeave={() => viewer.current?.setKey(k, false)}>{lbl}</button>
          ))}
        </div>
      )}
    </div>
  );
}
