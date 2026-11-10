import { useState } from 'react';
import { addRectRoom, roomPoints, bbox, parseLength } from '../../../../packages/geometry/src/index';
import { editFloor, select, setTool, useStore, currentFloor, toast } from '../store';
import { useT } from '../i18n';
import { Modal, SelectField } from './fields';

type Side = 'none' | 'right' | 'left' | 'above' | 'below';

export function RoomDialog({ onClose }: { onClose: () => void }) {
  const { t, lang } = useT();
  const floor = useStore((s) => currentFloor(s))!;
  const unit = useStore((s) => s.project!.settings.unit);
  const selectedRoom = useStore((s) => s.selection.find((id) => currentFloor(s)?.rooms[id]));
  const du = unit === 'ft-in' ? 'ft-in' : unit;
  const n = Object.keys(floor.rooms).length + 1;
  const [name, setName] = useState(`${lang === 'he' ? 'חדר' : 'Room'} ${n}`);
  const [w, setW] = useState(unit === 'cm' ? '400' : unit === 'mm' ? '4000' : '4.00');
  const [l, setL] = useState(unit === 'cm' ? '350' : unit === 'mm' ? '3500' : '3.50');
  const [h, setH] = useState(String(unit === 'cm' ? floor.defaultHeight * 100 : unit === 'mm' ? floor.defaultHeight * 1000 : floor.defaultHeight));
  const [x, setX] = useState('0');
  const [y, setY] = useState('0');
  const [side, setSide] = useState<Side>(selectedRoom ? 'right' : 'none');

  function create() {
    const W = parseLength(w, du), Lg = parseLength(l, du), H = parseLength(h, du);
    let X = parseLength(x, du), Y = parseLength(y, du);
    if (!W || !Lg || !H || W <= 0 || Lg <= 0 || H <= 0 || X == null || Y == null) { toast('Please enter valid positive dimensions.', 'error'); return; }
    if (side !== 'none' && selectedRoom) {
      const b = bbox(roomPoints(floor, floor.rooms[selectedRoom]));
      if (side === 'right') { X = b.maxX; Y = b.minY; }
      if (side === 'left') { X = b.minX - W; Y = b.minY; }
      if (side === 'below') { X = b.minX; Y = b.maxY; }
      if (side === 'above') { X = b.minX; Y = b.minY - Lg; }
    }
    let id: string | null = null;
    const ok = editFloor('Create room', (f) => { const r = addRectRoom(f, { x: X!, y: Y!, width: W, length: Lg, height: H, name: name.trim() || `Room ${n}` }); id = r.roomId; return r.floor; });
    if (ok && id) { select([id]); setTool('select'); onClose(); window.dispatchEvent(new Event('planforge:fit')); }
  }
  const field = (label: string, v: string, set: (s: string) => void, testId: string) => (
    <label className="field"><span>{label}</span><span className="field-input"><input data-testid={testId} value={v} inputMode="decimal" onChange={(e) => set(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} /><em>{unit === 'ft-in' ? 'ft' : unit}</em></span></label>
  );
  return (
    <Modal title={t('roomDialog')} onClose={onClose} testId="room-dialog" footer={<><button className="btn" onClick={onClose}>{t('cancel')}</button><button className="btn primary" data-testid="room-create" onClick={create}>{t('create')}</button></>}>
      <label className="field"><span>{t('name')}</span><input data-testid="room-dialog-name" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <div className="grid2">
        {field(t('width'), w, setW, 'room-width')}
        {field(t('length'), l, setL, 'room-length')}
        {field(t('height'), h, setH, 'room-ceiling')}
      </div>
      {selectedRoom && <SelectField label={t('attach')} value={side} testId="room-attach" options={(['none', 'right', 'left', 'above', 'below'] as Side[]).map((s) => ({ value: s, label: t(s) }))} onChange={setSide} />}
      {side === 'none' && <div className="grid2">{field(t('positionX'), x, setX, 'room-x')}{field(t('positionY'), y, setY, 'room-y')}</div>}
    </Modal>
  );
}
