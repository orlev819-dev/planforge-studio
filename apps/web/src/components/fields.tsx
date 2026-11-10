import { useEffect, useState, useSyncExternalStore } from 'react';
import { Icon } from './Icon';
import type { LengthUnit } from '../../../../packages/shared-types/src/index';
import { parseLength, toUnit } from '../../../../packages/geometry/src/index';
import { toast } from '../store';

const unitLabel = (u: LengthUnit) => (u === 'ft-in' ? 'ft' : u);

/** true on touch screens (iPad): drives the touch-first styling and stepper buttons */
export function useCoarse() {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia('(pointer: coarse)'); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => window.matchMedia('(pointer: coarse)').matches,
    () => false,
  );
}
const stepFor = (v: number | null) => (v != null && v < 0.3 ? 0.01 : 0.05);

/** Length input in the project's unit (accepts explicit suffixes like 425cm or 12' 6"). Commits meters on Enter/blur. */
export function LengthField({ label, value, unit, onCommit, testId, min = 0, allowEmpty, placeholder, steppers = true }: {
  label: string; value: number | null; unit: LengthUnit; onCommit: (m: number | null) => void; testId?: string; min?: number; allowEmpty?: boolean; placeholder?: string; steppers?: boolean;
}) {
  const coarse = useCoarse();
  const fmt = (v: number | null) => (v == null ? '' : String(+toUnit(v, unit).toFixed(unit === 'mm' ? 1 : unit === 'cm' ? 2 : 4)));
  const [text, setText] = useState(fmt(value));
  useEffect(() => setText(fmt(value)), [value, unit]); // eslint-disable-line
  const commit = () => {
    if (text.trim() === '' && allowEmpty) { if (value != null) onCommit(null); return; }
    const m = parseLength(text, unit);
    if (m == null || m < min) { toast(`Invalid length: "${text}"`, 'error'); setText(fmt(value)); return; }
    if (value == null || Math.abs(m - value) > 1e-9) onCommit(m);
  };
  return (
    <label className="field">
      <span>{label}</span>
      <span className="field-input">
        <input data-testid={testId} data-laser-commit="1" value={text} placeholder={placeholder} inputMode="decimal" onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setText(fmt(value)); (e.target as HTMLInputElement).blur(); } }} />
        <em>{unitLabel(unit)}</em>
        {coarse && steppers && (
          <span className="stepper">
            <button type="button" data-testid={testId ? `${testId}-minus` : undefined} aria-label="−" onClick={() => { const v = (value ?? 0) - stepFor(value); if (v >= min) onCommit(+v.toFixed(4)); }}><Icon name="minus" size={16} /></button>
            <button type="button" data-testid={testId ? `${testId}-plus` : undefined} aria-label="+" onClick={() => onCommit(+((value ?? 0) + stepFor(value)).toFixed(4))}><Icon name="plus" size={16} /></button>
          </span>
        )}
      </span>
    </label>
  );
}

export function NumberField({ label, value, onCommit, suffix, step = 1, testId, min, max }: { label: string; value: number; onCommit: (n: number) => void; suffix?: string; step?: number; testId?: string; min?: number; max?: number }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(+value.toFixed(4))), [value]);
  const commit = () => {
    const n = Number(text.replace(',', '.'));
    if (!Number.isFinite(n) || (min != null && n < min) || (max != null && n > max)) { toast(`Invalid value: "${text}"`, 'error'); setText(String(value)); return; }
    if (n !== value) onCommit(n);
  };
  return (
    <label className="field">
      <span>{label}</span>
      <span className="field-input">
        <input data-testid={testId} type="number" step={step} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        {suffix && <em>{suffix}</em>}
      </span>
    </label>
  );
}

export function TextField({ label, value, onCommit, testId, multiline }: { label: string; value: string; onCommit: (s: string) => void; testId?: string; multiline?: boolean }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => { if (text !== value) onCommit(text); };
  return (
    <label className="field">
      <span>{label}</span>
      {multiline
        ? <textarea data-testid={testId} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} rows={3} />
        : <input data-testid={testId} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />}
    </label>
  );
}

export function SelectField<T extends string>({ label, value, options, onChange, testId }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; testId?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select data-testid={testId} value={value} onChange={(e) => onChange(e.target.value as T)}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
    </label>
  );
}

export function Check({ label, checked, onChange, testId }: { label: string; checked: boolean; onChange: (b: boolean) => void; testId?: string }) {
  return <label className="check"><input data-testid={testId} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}</label>;
}

export function Stat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return <div className="stat"><span>{label}</span><b data-testid={testId}>{value}</b></div>;
}

export function Modal({ title, onClose, children, footer, testId }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; testId?: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label={title} data-testid={testId}>
        <header><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="close">✕</button></header>
        <div className="modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

export const MATERIALS = ['wood', 'tile', 'concrete', 'carpet', 'marble', 'paint-white', 'plaster', 'brick', 'stone'];

export function download(name: string, data: BlobPart, type: string) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const safeName = (s: string) => s.replace(/[^\p{L}\p{N}_ -]+/gu, '').trim().replace(/\s+/g, '_') || 'plan';
