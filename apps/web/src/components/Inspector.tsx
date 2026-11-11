import { useState } from 'react';
import type { Floor, Opening } from '../../../../packages/shared-types/src/index';
import {
  roomMetrics, floorMetrics, wallMetrics, formatArea, formatLength, formatVolume, setWallLength, setWallAngle, updateWall, updateRoom, updateOpening,
  updateFurniture, moveVertex, roomEdgeWalls, rotateRoom, deleteEntity, addOpening, mergeRooms, splitRoom, objectToWallDistance, deleteCorner, mergeWallsAt,
  updateFloorProps, wallLength, dist, updateCeilingDrop, ceilingAbove, setRoomEdgeInteriorLength, setWallLocked, openingOffsets, setOpeningOffset, addPhoto, updatePhoto, interiorPoint, roomPoints,
} from '../../../../packages/geometry/src/index';
import { editFloor, editProject, getState, select, setTool, useStore, currentFloor } from '../store';
import { useT } from '../i18n';
import { materialColor } from '../../../../packages/renderer-3d/src/mesh';
import { Icon } from './Icon';
import { LengthField, NumberField, TextField, SelectField, Check, Stat, MATERIALS } from './fields';
import { CameraDialog } from './CameraDialog';

export function Inspector() {
  const { t } = useT();
  // when on, measuring one side of an opening holds the other edge, so the width follows the two measurements
  const [widthFromBoth, setWidthFromBoth] = useState(false);
  const project = useStore((s) => s.project)!;
  const floor = useStore((s) => currentFloor(s))!;
  const selection = useStore((s) => s.selection);
  const unit = project.settings.unit, prec = project.settings.precision;
  const L = (m: number) => formatLength(m, unit, prec);
  const A = (m: number) => formatArea(m, unit, prec);
  const sel = selection.filter((id) => floor.rooms[id] || floor.walls[id] || floor.openings[id] || floor.furniture[id] || floor.vertices[id] || floor.dimensions[id] || floor.annotations[id] || floor.ceilingDrops?.[id] || floor.photos?.[id]);

  if (sel.length === 2 && floor.rooms[sel[0]] && floor.rooms[sel[1]])
    return (
      <Panel title={`${t('roomsList')} (2)`}>
        <button className="btn" data-testid="merge-rooms" onClick={() => { if (editFloor('Merge rooms', (f) => mergeRooms(f, sel[0], sel[1]))) select([sel[0]]); }}>{t('mergeRooms')}</button>
      </Panel>
    );
  if (sel.length > 1) return <Panel title={`${sel.length} selected`}><button className="btn danger" onClick={() => { editFloor('Delete', (f) => sel.reduce((g, id) => (g.rooms[id] || g.furniture[id] || g.openings[id] ? deleteEntity(g, id) : g), f)); select([]); }}>{t('delete')}</button></Panel>;

  const id = sel[0];
  if (!id) return <FloorPanel floor={floor} />;

  if (floor.rooms[id]) {
    const r = floor.rooms[id];
    const m = roomMetrics(floor, r);
    const walls = roomEdgeWalls(floor, r);
    const interior = project.settings.measure === 'interior';
    const setMeasure = (v: 'centerline' | 'interior') => editProject('Measure mode', (p) => ({ ...p, settings: { ...p.settings, measure: v } }));
    return (
      <Panel title={`${t('room')}: ${r.name}`} testId="inspector-room">
        <TextField label={t('name')} value={r.name} testId="room-name" onCommit={(name) => editFloor('Rename room', (f) => updateRoom(f, id, { name }))} />
        <LengthField label={t('height')} value={r.height} unit={unit} testId="room-height" onCommit={(h) => h && editFloor('Room height', (f) => updateRoom(f, id, { height: h }))} />
        <label className="field"><span>{t('material')} (floor)</span>
          <span className="field-input">
            <span className="swatch" style={{ background: materialColor(r.floorMaterial) }} />
            <select value={r.floorMaterial} onChange={(e) => editFloor('Floor material', (f) => updateRoom(f, id, { floorMaterial: e.target.value }))}>{MATERIALS.map((x) => <option key={x} value={x}>{x}</option>)}</select>
          </span>
        </label>
        <div className="stats">
          <Stat label={t('grossArea')} value={A(m.grossArea)} testId="room-area" />
          <Stat label={t('netArea')} value={A(m.netArea)} testId="room-net-area" />
          <Stat label={t('perimeter')} value={L(m.perimeter)} />
          <Stat label={t('volume')} value={formatVolume(m.volume, unit, prec)} />
          <Stat label={t('wallArea')} value={A(m.wallArea)} />
          <Stat label={t('ceilingArea')} value={A(m.ceilingArea)} />
          <Stat label={`${t('doors')} / ${t('windows')}`} value={`${m.doors} / ${m.windows}`} />
          {m.railingLength > 0 && <Stat label={t('railingLength')} value={L(m.railingLength)} testId="room-railing" />}
          {m.openLength > 0 && <Stat label={t('openLength')} value={L(m.openLength)} testId="room-open" />}
          {m.loweredArea > 0 && <Stat label={t('loweredArea')} value={A(m.loweredArea)} testId="room-lowered" />}
          {m.soffitSideArea > 0 && <Stat label={t('soffitFaces')} value={A(m.soffitSideArea)} />}
        </div>
        <div className="walls-head">
          <h4>{t('walls')}</h4>
          <div className="seg sm" role="tablist" aria-label={t('measureMode')}>
            <button role="tab" data-testid="measure-centerline" className={interior ? '' : 'on'} onClick={() => setMeasure('centerline')}>{t('centerline')}</button>
            <button role="tab" data-testid="measure-interior" className={interior ? 'on' : ''} onClick={() => setMeasure('interior')}>{t('interiorMeasure')}</button>
          </div>
        </div>
        <div data-testid="room-walls">
          {r.vertexIds.map((_, i) => {
            const w = walls[i];
            const len = (interior ? m.netEdgeLengths[i] : m.edgeLengths[i]) ?? m.edgeLengths[i] ?? null;
            return (
              <div className="wall-row" key={w?.id ?? `edge-${i}`}>
                <LengthField label={`${w?.kind === 'railing' ? t('railing') : t('wall')} ${i + 1}`} value={len} unit={unit} testId={`room-wall-${i}`} locked={!!w?.locked}
                  onCommit={(v, o) => v && editFloor(o?.measured ? 'Measure wall' : 'Wall length', (f) => (interior || !w
                    ? setRoomEdgeInteriorLength(f, id, i, v, 'a', { lock: o?.measured })
                    : setWallLength(f, w.id, v, w.a === r.vertexIds[i] ? 'a' : 'b', { lock: o?.measured })))} />
                <button className={`icon-btn ${w?.locked ? 'on' : ''}`} data-testid={`room-wall-${i}-lock`} title={w?.locked ? t('releaseWall') : t('lockWall')} disabled={!w}
                  onClick={() => w && editFloor(w.locked ? 'Release wall' : 'Lock wall', (f) => setWallLocked(f, w.id, !w.locked))}><Icon name={w?.locked ? 'lock' : 'unlock'} size={18} /></button>
                <button className={`icon-btn ${w?.kind === 'railing' ? 'on' : ''}`} data-testid={`room-wall-${i}-railing`} title={t('railing')} disabled={!w}
                  onClick={() => w && editFloor('Wall type', (f) => updateWall(f, w.id, { kind: w.kind === 'railing' ? 'solid' : 'railing' }))}><Icon name="railing" size={18} /></button>
                <button className={`icon-btn ${w?.kind === 'open' ? 'on' : ''}`} data-testid={`room-wall-${i}-open`} title={t('openSpace')} disabled={!w}
                  onClick={() => w && editFloor('Wall type', (f) => updateWall(f, w.id, { kind: w.kind === 'open' ? 'solid' : 'open' }))}><Icon name="openWall" size={18} /></button>
              </div>
            );
          })}
        </div>
        <RoomPhotos roomId={id} floor={floor} />
        <SplitRoom roomId={id} floor={floor} />
        <div className="row">
          <button className="btn" onClick={() => editFloor('Rotate room', (f) => rotateRoom(f, id, 90))}>{t('rotate90')}</button>
          <button className="btn danger" onClick={() => { editFloor('Delete room', (f) => deleteEntity(f, id)); select([]); }}>{t('delete')}</button>
        </div>
      </Panel>
    );
  }

  if (floor.walls[id]) {
    const w = floor.walls[id];
    const wm = wallMetrics(floor, id);
    const ops = Object.values(floor.openings).filter((o) => o.wallId === id);
    const railing = w.kind === 'railing';
    return (
      <Panel title={railing ? t('railing') : t('wall')} testId="inspector-wall">
        <SelectField label={t('wallType')} value={w.kind} testId="wall-kind"
          options={[{ value: 'solid', label: t('solidWall') }, { value: 'railing', label: t('railing') }, { value: 'open', label: t('openSpace') }]}
          onChange={(v) => editFloor('Wall type', (f) => updateWall(f, id, { kind: v }))} />
        {railing && <SelectField label={t('railingStyle')} value={w.railingStyle} testId="railing-style"
          options={[{ value: 'bars', label: t('bars') }, { value: 'glass', label: t('glass') }, { value: 'panel', label: t('panel') }]}
          onChange={(v) => editFloor('Railing style', (f) => updateWall(f, id, { railingStyle: v }))} />}
        <LengthField label={`${t('length')} (${t('centerline')})`} value={wm.length} unit={unit} testId="wall-length" locked={w.locked} onCommit={(len, o) => len && editFloor(o?.measured ? 'Measure wall' : 'Wall length', (f) => setWallLength(f, id, len, 'a', { lock: o?.measured }))} />
        <Check label={t('lockedWall')} checked={w.locked} testId="wall-locked" onChange={(v) => editFloor(v ? 'Lock wall' : 'Release wall', (f) => setWallLocked(f, id, v))} />
        {w.locked && <p className="hint-text" data-testid="wall-locked-hint">{t('lockedWallHint')}</p>}
        {w.kind === 'open' && <p className="hint-text" data-testid="wall-open-hint">{t('openSpaceHint')}</p>}
        {(() => {
          const owner = Object.values(floor.rooms).find((rr) => roomEdgeWalls(floor, rr).some((x, k) => x?.id === id && k >= 0));
          if (!owner) return null;
          const k = roomEdgeWalls(floor, owner).findIndex((x) => x?.id === id);
          const mm = roomMetrics(floor, owner);
          return <LengthField label={`${t('length')} (${t('interiorMeasure')} · ${owner.name})`} value={mm.netEdgeLengths[k]} unit={unit} testId="wall-interior-length" locked={w.locked}
            onCommit={(len, o) => len && editFloor(o?.measured ? 'Measure wall' : 'Interior length', (f) => setRoomEdgeInteriorLength(f, owner.id, k, len, 'a', { lock: o?.measured }))} />;
        })()}
        <NumberField label={t('angle')} value={+wm.angle.toFixed(2)} suffix="°" step={0.5} onCommit={(a) => editFloor('Wall angle', (f) => setWallAngle(f, id, a))} />
        <LengthField label={t('thickness')} value={w.thickness} unit={unit} testId="wall-thickness" onCommit={(v) => v && editFloor('Wall thickness', (f) => updateWall(f, id, { thickness: v }))} />
        <LengthField label={t('objHeight')} value={w.height} unit={unit} allowEmpty={!railing} placeholder={L(wm.height)} testId="wall-height" onCommit={(v) => editFloor('Wall height', (f) => updateWall(f, id, { height: v }))} />
        {!railing && <Check label={t('exterior')} checked={w.exterior} onChange={(b) => editFloor('Wall type', (f) => updateWall(f, id, { exterior: b }))} />}
        <SelectField label={t('material')} value={w.material} options={(railing ? ['steel', 'aluminium', 'glass', 'wood', 'stone'] : MATERIALS).map((x) => ({ value: x, label: x }))} onChange={(v) => editFloor('Wall material', (f) => updateWall(f, id, { material: v }))} />
        <div className="stats"><Stat label={railing ? t('area') : t('wallArea')} value={A(wm.sideArea)} />{!railing && <Stat label={`${t('doors')} / ${t('windows')}`} value={String(ops.length)} />}</div>
        {railing && <div className="hint-text">{t('railingNoOpening')}</div>}
        <div className="row">
          {!railing && <button className="btn" onClick={() => editFloor('Add door', (f) => addOpening(f, id, 'door', wm.length / 2, { width: getState().openingDefaults.door }).floor)}>+ {t('door')}</button>}
          {!railing && <button className="btn" onClick={() => editFloor('Add window', (f) => addOpening(f, id, 'window', wm.length / 2, { width: getState().openingDefaults.window }).floor)}>+ {t('window')}</button>}
          {w.standalone && <button className="btn danger" onClick={() => { editFloor('Delete wall', (f) => deleteEntity(f, id)); select([]); }}>{t('delete')}</button>}
        </div>
      </Panel>
    );
  }

  if (floor.openings[id]) {
    const o = floor.openings[id];
    const wl = wallLength(floor, floor.walls[o.wallId]);
    const subtypes = o.kind === 'door' ? ['single', 'double', 'sliding', 'pocket', 'folding', 'double-sliding', 'custom'] : o.kind === 'window' ? ['fixed', 'sliding', 'casement', 'double', 'floor-to-ceiling', 'custom'] : ['opening'];
    const set = (patch: Partial<Opening>, label = 'Edit opening') => editFloor(label, (f) => updateOpening(f, id, patch));
    return (
      <Panel title={t(o.kind)} testId="inspector-opening">
        <SelectField label={t('type')} value={o.subtype} options={subtypes.map((s) => ({ value: s, label: s }))} testId="opening-subtype"
          onChange={(v) => set(v === 'floor-to-ceiling' ? { subtype: v as Opening['subtype'], sill: 0, height: Math.max(o.height, 2.1) } : { subtype: v as Opening['subtype'] })} />
        <LengthField label={t('width')} value={o.width} unit={unit} testId="opening-width" onCommit={(v) => v && set({ width: v })} />
        <LengthField label={t('objHeight')} value={o.height} unit={unit} testId="opening-height" onCommit={(v) => v && set({ height: v })} />
        {o.kind !== 'door' && <LengthField label={t('sill')} value={o.sill} unit={unit} testId="opening-sill" onCommit={(v) => v != null && set({ sill: v })} />}
        {(() => {
          const measure = project.settings.measure;
          const off = openingOffsets(floor, o, measure);
          const place = (side: 'start' | 'end', v: number) =>
            editFloor('Position opening', (f) => setOpeningOffset(f, id, side, v, { measure, keepWidth: !widthFromBoth }));
          return (
            <>
              <div className="walls-head">
                <h4>{t('position')}</h4>
                <div className="seg sm" role="tablist" aria-label={t('measureMode')}>
                  <button role="tab" data-testid="opening-measure-centerline" className={measure === 'interior' ? '' : 'on'}
                    onClick={() => editProject('Measure mode', (p) => ({ ...p, settings: { ...p.settings, measure: 'centerline' } }))}>{t('centerline')}</button>
                  <button role="tab" data-testid="opening-measure-interior" className={measure === 'interior' ? 'on' : ''}
                    onClick={() => editProject('Measure mode', (p) => ({ ...p, settings: { ...p.settings, measure: 'interior' } }))}>{t('interiorMeasure')}</button>
                </div>
              </div>
              <LengthField label={t('offsetStart')} value={off.start} unit={unit} testId="opening-from-start" onCommit={(v) => v != null && place('start', v)} />
              <LengthField label={t('offsetEnd')} value={off.end} unit={unit} testId="opening-to-end" onCommit={(v) => v != null && place('end', v)} />
              <Check label={t('widthFromBoth')} checked={widthFromBoth} testId="opening-width-from-both" onChange={setWidthFromBoth} />
              <div className="hint-text" data-testid="opening-span">{t('clearSpan')}: {L(off.span)} · {t('wall')}: {L(wl)}</div>
            </>
          );
        })()}
        {o.kind === 'door' && <>
          <SelectField label={t('hinge')} value={o.hinge} options={[{ value: 'start', label: 'start' }, { value: 'end', label: 'end' }]} onChange={(v) => set({ hinge: v })} />
          <button className="btn" onClick={() => set({ side: o.side === 1 ? -1 : 1 }, 'Flip door')}>{t('flip')} ({t('swing')})</button>
        </>}
        <SelectField label={t('material')} value={o.material} options={['wood', 'aluminium', 'pvc', 'steel', 'glass'].map((x) => ({ value: x, label: x }))} onChange={(v) => set({ material: v })} />
        <LengthField label="Frame depth" value={o.frameDepth} unit={unit} onCommit={(v) => v != null && set({ frameDepth: v })} />
        <button className="btn danger" onClick={() => { editFloor('Delete opening', (f) => deleteEntity(f, id)); select([]); }}>{t('delete')}</button>
      </Panel>
    );
  }

  if (floor.furniture[id]) {
    const fu = floor.furniture[id];
    const set = (patch: Partial<typeof fu>, label = 'Edit object') => editFloor(label, (f) => updateFurniture(f, id, patch));
    const dw = objectToWallDistance(floor, id);
    return (
      <Panel title={fu.name} testId="inspector-furniture">
        <TextField label={t('name')} value={fu.name} onCommit={(name) => set({ name })} />
        <div className="grid2">
          <LengthField label={t('x')} value={fu.x} unit={unit} min={-1e6} onCommit={(v) => v != null && set({ x: v })} />
          <LengthField label={t('y')} value={fu.y} unit={unit} min={-1e6} onCommit={(v) => v != null && set({ y: v })} />
          <LengthField label={t('width')} value={fu.width} unit={unit} testId="furniture-width" onCommit={(v) => v && set({ width: v })} />
          <LengthField label={t('depth')} value={fu.depth} unit={unit} onCommit={(v) => v && set({ depth: v })} />
          <LengthField label={t('objHeight')} value={fu.height} unit={unit} onCommit={(v) => v && set({ height: v })} />
          <LengthField label={t('elevation')} value={fu.elevation} unit={unit} min={-100} onCommit={(v) => v != null && set({ elevation: v })} />
        </div>
        <NumberField label={t('rotation')} value={fu.rotation} suffix="°" step={15} onCommit={(r) => set({ rotation: ((r % 360) + 360) % 360 })} />
        <Check label={t('mirror')} checked={fu.mirrored} onChange={(b) => set({ mirrored: b })} />
        <TextField label={t('layer')} value={fu.layer} onCommit={(layer) => set({ layer })} />
        <label className="field"><span>Color</span><input type="color" value={fu.color} onChange={(e) => set({ color: e.target.value })} /></label>
        <Stat label={t('distToWall')} value={isFinite(dw.distance) ? L(dw.distance) : '—'} />
        <MetaEditor meta={fu.meta} onChange={(meta) => set({ meta }, 'Edit metadata')} />
        <div className="row">
          <button className="btn" onClick={() => set({ rotation: (fu.rotation + 90) % 360 })}>{t('rotate90')}</button>
          <button className="btn danger" onClick={() => { editFloor('Delete object', (f) => deleteEntity(f, id)); select([]); }}>{t('delete')}</button>
        </div>
      </Panel>
    );
  }

  if (floor.vertices[id]) {
    const v = floor.vertices[id];
    return (
      <Panel title={t('corner')}>
        <LengthField label={t('x')} value={v.x} unit={unit} min={-1e6} testId="vertex-x" onCommit={(x) => x != null && editFloor('Move corner', (f) => moveVertex(f, id, { x, y: v.y }))} />
        <LengthField label={t('y')} value={v.y} unit={unit} min={-1e6} testId="vertex-y" onCommit={(y) => y != null && editFloor('Move corner', (f) => moveVertex(f, id, { x: v.x, y }))} />
        <div className="row">
          <button className="btn" onClick={() => editFloor('Merge walls', (f) => mergeWallsAt(f, id)) && select([])}>{t('mergeWalls')}</button>
          <button className="btn danger" onClick={() => editFloor('Delete corner', (f) => deleteCorner(f, id)) && select([])}>{t('deleteCorner')}</button>
        </div>
      </Panel>
    );
  }

  if (floor.ceilingDrops?.[id]) {
    const c = floor.ceilingDrops[id];
    const top = ceilingAbove(floor, c);
    const set = (patch: Partial<typeof c>) => editFloor('Edit lowered ceiling', (f) => updateCeilingDrop(f, id, patch));
    return (
      <Panel title={t('ceiling')} testId="inspector-ceiling">
        <TextField label={t('name')} value={c.name} onCommit={(name) => set({ name })} />
        <LengthField label={t('ceilingHeightAt')} value={c.height} unit={unit} testId="ceiling-height" onCommit={(v) => v && set({ height: v })} />
        <div className="hint-text">{t('dropBy')} {L(top - c.height)} ({t('height')}: {L(top)})</div>
        <div className="grid2">
          <LengthField label={t('width')} value={c.width} unit={unit} testId="ceiling-width" onCommit={(v) => v && set({ width: v })} />
          <LengthField label={t('depth')} value={c.depth} unit={unit} testId="ceiling-depth" onCommit={(v) => v && set({ depth: v })} />
          <LengthField label={t('x')} value={c.x} unit={unit} min={-1e6} onCommit={(v) => v != null && set({ x: v })} />
          <LengthField label={t('y')} value={c.y} unit={unit} min={-1e6} onCommit={(v) => v != null && set({ y: v })} />
        </div>
        <NumberField label={t('rotation')} value={c.rotation} suffix="°" step={15} onCommit={(r) => set({ rotation: ((r % 360) + 360) % 360 })} />
        <Stat label={t('area')} value={A(c.width * c.depth)} />
        <button className="btn danger" onClick={() => { editFloor('Delete lowered ceiling', (f) => deleteEntity(f, id)); select([]); }}>{t('delete')}</button>
      </Panel>
    );
  }

  if (floor.dimensions[id]) {
    const d = floor.dimensions[id];
    return (
      <Panel title={t('dimension')}>
        <Stat label={t('length')} value={L(dist(d.a, d.b))} />
        <LengthField label={t('offset')} value={d.offset} unit={unit} min={-100} onCommit={(v) => v != null && editFloor('Dimension offset', (f) => ({ ...f, dimensions: { ...f.dimensions, [id]: { ...d, offset: v } } }))} />
        <button className="btn danger" onClick={() => { editFloor('Delete dimension', (f) => deleteEntity(f, id)); select([]); }}>{t('delete')}</button>
      </Panel>
    );
  }

  if (floor.photos?.[id]) {
    const ph = floor.photos[id];
    return (
      <Panel title={t('photo')} testId="inspector-photo">
        <img className="photo-full" data-testid="photo-image" src={ph.dataUrl} alt={ph.name}
          onClick={() => { const w = window.open(); if (w) w.document.write(`<img src="${ph.dataUrl}" style="max-width:100%">`); }} />
        <TextField label={t('name')} value={ph.name} testId="photo-name" onCommit={(v) => editFloor('Rename photo', (f) => updatePhoto(f, id, { name: v }))} />
        <TextField label={t('photoNote')} value={ph.note} multiline testId="photo-note" onCommit={(v) => editFloor('Photo note', (f) => updatePhoto(f, id, { note: v }))} />
        {ph.subjectId && floor.rooms[ph.subjectId] && <div className="hint-text" data-testid="photo-subject">{t('room')}: {floor.rooms[ph.subjectId].name}</div>}
        {ph.takenAt && <div className="hint-text">{new Date(ph.takenAt).toLocaleString()}</div>}
        <button className="btn danger" onClick={() => { editFloor('Delete photo', (f) => deleteEntity(f, id)); select([]); }}>{t('delete')}</button>
      </Panel>
    );
  }

  if (floor.annotations[id]) {
    const a = floor.annotations[id];
    return (
      <Panel title={t('annotation')}>
        <TextField label={t('text')} value={a.text} multiline testId="note-text" onCommit={(text) => editFloor('Edit note', (f) => ({ ...f, annotations: { ...f.annotations, [id]: { ...a, text } } }))} />
        <button className="btn danger" onClick={() => { editFloor('Delete note', (f) => deleteEntity(f, id)); select([]); }}>{t('delete')}</button>
      </Panel>
    );
  }
  return <FloorPanel floor={floor} />;
}

function SplitRoom({ roomId, floor }: { roomId: string; floor: Floor }) {
  const { t } = useT();
  const r = floor.rooms[roomId];
  const [a, setA] = useState(0);
  const [b, setB] = useState(Math.min(2, r.vertexIds.length - 1));
  if (r.vertexIds.length < 4) return null;
  const opts = r.vertexIds.map((_, i) => ({ value: String(i), label: `#${i + 1}` }));
  return (
    <details className="sub">
      <summary>{t('splitRoom')}</summary>
      <div className="grid2">
        <SelectField label="A" value={String(a)} options={opts} onChange={(v) => setA(Number(v))} />
        <SelectField label="B" value={String(b)} options={opts} onChange={(v) => setB(Number(v))} />
      </div>
      <button className="btn" onClick={() => editFloor('Split room', (f) => splitRoom(f, roomId, r.vertexIds[a], r.vertexIds[b]).floor)}>{t('splitRoom')}</button>
      <div className="hint-text">Tip: use “{t('corner')}” to add corners on opposite walls first.</div>
    </details>
  );
}

function MetaEditor({ meta, onChange }: { meta: Record<string, string>; onChange: (m: Record<string, string>) => void }) {
  const [k, setK] = useState('');
  const [v, setV] = useState('');
  const entries = Object.entries(meta).filter(([key]) => key !== 'shape');
  return (
    <details className="sub">
      <summary>Metadata ({entries.length})</summary>
      {entries.map(([key, val]) => (
        <div className="meta-row" key={key}><code>{key}</code><span>{val}</span><button className="icon-btn" onClick={() => { const m = { ...meta }; delete m[key]; onChange(m); }}>✕</button></div>
      ))}
      <div className="meta-row"><input placeholder="key" value={k} onChange={(e) => setK(e.target.value)} /><input placeholder="value" value={v} onChange={(e) => setV(e.target.value)} /><button className="icon-btn" onClick={() => { if (k.trim()) { onChange({ ...meta, [k.trim()]: v }); setK(''); setV(''); } }}>＋</button></div>
    </details>
  );
}

function FloorPanel({ floor }: { floor: Floor }) {
  const { t } = useT();
  const project = useStore((s) => s.project)!;
  const unit = project.settings.unit, prec = project.settings.precision;
  const fm = floorMetrics(floor);
  const ref = floor.reference;
  const setRef = (patch: Partial<NonNullable<Floor['reference']>> | null) => editProject('Reference', (p) => updateFloorProps(p, floor.id, { reference: patch === null ? null : { ...ref!, ...patch } }));
  return (
    <Panel title={`${t('floor')}: ${floor.name}`} testId="inspector-floor">
      <TextField label={t('name')} value={floor.name} onCommit={(name) => editProject('Rename floor', (p) => updateFloorProps(p, floor.id, { name }))} />
      <LengthField label={t('elevation')} value={floor.elevation} unit={unit} min={-100} onCommit={(v) => v != null && editProject('Floor elevation', (p) => updateFloorProps(p, floor.id, { elevation: v }))} />
      <LengthField label={t('defaultHeight')} value={floor.defaultHeight} unit={unit} onCommit={(v) => v && editProject('Default height', (p) => updateFloorProps(p, floor.id, { defaultHeight: v }))} />
      <LengthField label={t('wallThickness')} value={floor.defaultWallThickness} unit={unit} onCommit={(v) => v && editProject('Default thickness', (p) => updateFloorProps(p, floor.id, { defaultWallThickness: v }))} />
      <div className="stats">
        <Stat label={t('grossArea')} value={formatArea(fm.grossArea, unit, prec)} testId="floor-area" />
        <Stat label={t('netArea')} value={formatArea(fm.netArea, unit, prec)} />
        <Stat label={t('roomsList')} value={String(fm.rooms.length)} />
      </div>
      {ref && (
        <details className="sub" open>
          <summary>{t('reference')}</summary>
          <Check label={t('visible')} checked={ref.visible} onChange={(b) => setRef({ visible: b })} />
          <Check label={t('locked')} checked={ref.locked} onChange={(b) => setRef({ locked: b })} />
          <NumberField label={t('opacity')} value={ref.opacity} step={0.1} min={0} max={1} onCommit={(n) => setRef({ opacity: n })} />
          <NumberField label={t('rotation')} value={ref.rotation} suffix="°" step={0.5} onCommit={(n) => setRef({ rotation: n })} />
          <div className="grid2">
            <LengthField label={t('x')} value={ref.x} unit={unit} min={-1e6} onCommit={(v) => v != null && setRef({ x: v })} />
            <LengthField label={t('y')} value={ref.y} unit={unit} min={-1e6} onCommit={(v) => v != null && setRef({ y: v })} />
          </div>
          <div className="hint-text">{ref.calibrated ? `✓ ${t('calibrate')}: ${(1 / ref.scale).toFixed(1)} px/m` : `⚠ ${t('calibrateHint')}`}</div>
          <div className="row">
            <button className="btn" data-testid="calibrate-btn" disabled={ref.locked} onClick={() => setTool('calibrate')}>{t('calibrate')}</button>
            <button className="btn danger" onClick={() => setRef(null)}>{t('removeReference')}</button>
          </div>
        </details>
      )}
    </Panel>
  );
}

/** Photos taken for this room: a strip of thumbnails plus the camera. */
function RoomPhotos({ roomId, floor }: { roomId: string; floor: Floor }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const mine = Object.values(floor.photos ?? {}).filter((p) => p.subjectId === roomId);
  return (
    <details className="sub" open={mine.length > 0}>
      <summary data-testid="room-photos-summary">{t('photos')} ({mine.length})</summary>
      <div className="photo-strip" data-testid="room-photos">
        {mine.map((p) => (
          <button key={p.id} className="photo-thumb" data-testid={`room-photo-${p.id}`} title={p.name} onClick={() => select([p.id])}>
            <img src={p.dataUrl} alt={p.name} />
          </button>
        ))}
      </div>
      <button className="btn" data-testid="room-add-photo" onClick={() => setOpen(true)}><Icon name="camera" size={16} /> {t('addPhoto')}</button>
      {open && (
        <CameraDialog onClose={() => setOpen(false)} onPhoto={(dataUrl) => {
          const p = interiorPoint(roomPoints(floor, floor.rooms[roomId]));
          editFloor('Add photo', (f) => addPhoto(f, { name: '', dataUrl, x: p.x, y: p.y, subjectId: roomId, note: '' }).floor);
        }} />
      )}
    </details>
  );
}

function Panel({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) {
  return <section className="panel" data-testid={testId}><h3>{title}</h3>{children}</section>;
}
