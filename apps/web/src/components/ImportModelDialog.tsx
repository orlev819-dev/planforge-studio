import { useMemo, useState } from 'react';
import { parseModelFile, buildModelAsset, guessUnit, rawSize, UNIT_SCALE, type ModelUnit, type ParsedModel } from '../../../../packages/cad-io/src/model-import';
import type { ModelFormat } from '../../../../packages/shared-types/src/index';
import { uid } from '../../../../packages/geometry/src/model';
import { editProject, setState, setTool, toast, useStore } from '../store';
import { useT } from '../i18n';
import { Modal, SelectField } from './fields';

/** Import a user-owned OBJ/STL as a placeable object (stored inside the project). */
export function ImportModelDialog({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const unitLabel = useStore((s) => s.project?.settings.unit ?? 'm');
  const [file, setFile] = useState<({ name: string } & ParsedModel & { format: ModelFormat }) | null>(null);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<ModelUnit>('mm');
  const [up, setUp] = useState<'y' | 'z'>('z');
  const [color, setColor] = useState('#9aa3ad');
  const [busy, setBusy] = useState(false);

  async function onFile(f: File) {
    setBusy(true);
    try {
      const r = parseModelFile(f.name, await f.arrayBuffer());
      setFile({ name: f.name, ...r });
      setName(f.name.replace(/\.(obj|stl|glb|gltf)$/i, ''));
      setUnit(guessUnit(r.tris));
      setUp(r.format === 'stl' ? 'z' : 'y');
      if (r.groups.length) setColor(r.groups[0].color);
    } catch (e) { toast((e as Error).message, 'error'); setFile(null); }
    finally { setBusy(false); }
  }

  const dims = useMemo(() => {
    if (!file) return null;
    const s = rawSize(file.tris), k = UNIT_SCALE[unit];
    return up === 'z' ? { w: s.x * k, d: s.y * k, h: s.z * k } : { w: s.x * k, d: s.z * k, h: s.y * k };
  }, [file, unit, up]);
  const fmt = (m: number) => (unitLabel === 'cm' ? `${(m * 100).toFixed(1)} cm` : unitLabel === 'mm' ? `${(m * 1000).toFixed(0)} mm` : `${m.toFixed(3)} m`);

  function add() {
    if (!file) return;
    try {
      const id = uid();
      const asset = buildModelAsset(id, name.trim() || 'Model', file.format, file.tris, { unit, up, color, groups: file.groups });
      if (asset.size.x > 30 || asset.size.y > 30 || asset.size.z > 30) { toast(t('modelTooBig'), 'error'); return; }
      if (editProject('Import model', (p) => ({ ...p, assets: { ...(p.assets ?? {}), [id]: asset } }))) {
        setTool('furniture'); setState({ pendingCatalogId: `asset:${id}` });
        toast(t('placeObject'));
        onClose();
      }
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <Modal title={t('importModel')} onClose={onClose} testId="model-dialog" footer={<><button className="btn" onClick={onClose}>{t('cancel')}</button><button className="btn primary" data-testid="model-add" disabled={!file || busy} onClick={add}>{t('apply')}</button></>}>
      <input type="file" data-testid="model-file" accept=".glb,.gltf,.obj,.stl" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
      {busy && <p className="muted">…</p>}
      {file && dims && <>
        <p className="muted sm" data-testid="model-info">{file.format.toUpperCase()} · {(file.tris.length / 9).toLocaleString()} triangles{file.groups.length ? ` · ${file.groups.length} ${t('materials')}` : ''}</p>
        {file.groups.length > 0 && (
          <div className="swatches" data-testid="model-materials">{file.groups.slice(0, 12).map((g, i) => <span key={i} className="sw" style={{ background: g.color }} title={g.color} />)}</div>
        )}
        <label className="field"><span>{t('name')}</span><input data-testid="model-name" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <div className="grid2">
          <SelectField label={t('fileUnits')} value={unit} testId="model-unit" options={(['mm', 'cm', 'm', 'in'] as ModelUnit[]).map((u) => ({ value: u, label: u }))} onChange={setUnit} />
          <SelectField label={t('upAxis')} value={up} testId="model-up" options={[{ value: 'z', label: 'Z up (STL / CAD)' }, { value: 'y', label: 'Y up (OBJ / Blender export)' }]} onChange={setUp} />
        </div>
        <label className="field"><span>Color</span><input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
        <p data-testid="model-dims"><b>{fmt(dims.w)} × {fmt(dims.d)} × {fmt(dims.h)}</b> <span className="muted sm">(W × D × H)</span></p>
        <p className="hint-text">{t('modelHint')}</p>
      </>}
    </Modal>
  );
}
