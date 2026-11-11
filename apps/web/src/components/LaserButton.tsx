import { useEffect, useRef, useState } from 'react';
import { useLaser, connectLaser, disconnectLaser, armLaserField, setLaserAdvance, aimLabel } from '../laser';
import { useStore } from '../store';
import { formatLength } from '../../../../packages/geometry/src/index';
import { useT } from '../i18n';
import { Icon } from './Icon';
import { Check } from './fields';

export function LaserButton() {
  const { t } = useT();
  const l = useLaser();
  const unit = useStore((s) => s.project?.settings.unit ?? 'm');
  const selection = useStore((s) => s.selection.join(','));
  void selection; // the default aim follows the selection, so re-read it whenever that changes
  const aim = aimLabel();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement | null>(null);
  const pop = useRef<HTMLDivElement | null>(null);
  // the top bar scrolls horizontally on tablets, so the panel is positioned in the viewport, not inside it
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const place = () => {
    const b = btn.current?.getBoundingClientRect();
    if (!b) return;
    const w = Math.min(330, window.innerWidth - 16);
    setPos({ top: Math.round(b.bottom + 8), left: Math.round(Math.max(8, Math.min(window.innerWidth - w - 8, b.right - w))) });
  };
  useEffect(() => {
    if (!open) return;
    place();
    const onDown = (e: PointerEvent) => {
      const tgt = e.target as Node;
      if (!pop.current?.contains(tgt) && !btn.current?.contains(tgt)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    return () => { window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('keydown', onKey); window.removeEventListener('resize', place); };
  }, [open]);
  const status = l.status === 'connected' ? 'ok' : l.status === 'connecting' || l.status === 'reconnecting' ? 'busy' : l.status === 'error' ? 'bad' : 'off';
  return (
    <div className="laser">
      <button ref={btn} className={`btn sm laser-btn ${status}`} data-testid="laser-open" onClick={() => setOpen(!open)} title={t('laser')} aria-expanded={open}>
        <Icon name="ruler" size={18} /><i className="dot" />
      </button>
      {open && (
        <div ref={pop} className="laser-pop" data-testid="laser-panel" style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}>
          <h4>{t('laser')}</h4>
          <div className="muted sm">Bosch GLM 50-27 C / CG</div>
          <p data-testid="laser-status"><b>{t(`laser_${l.status}` as 'laser_idle')}</b>{l.device ? ` · ${l.device}` : ''}{l.detail && l.status !== 'connected' ? ` · ${l.detail}` : ''}</p>
          {l.status === 'unsupported'
            ? <p className="hint-text">{typeof window !== 'undefined' && !window.isSecureContext ? t('laserInsecure') : t('laserUnsupported')}</p>
            : l.status === 'connected' || l.status === 'reconnecting'
              ? <button className="btn" onClick={disconnectLaser}>{t('disconnect')}</button>
              : <button className="btn primary" data-testid="laser-connect" disabled={l.status === 'connecting'} onClick={() => void connectLaser()}>{t('connect')}</button>}
          <p data-testid="laser-aim">
            {t('laserNext')}: <b>{aim || t('laserAimAuto')}</b>
            {l.armed && <button className="btn sm" data-testid="laser-aim-clear" onClick={() => armLaserField(null)}>{t('release')}</button>}
          </p>
          <Check label={t('laserAdvance')} checked={l.advance} testId="laser-advance" onChange={setLaserAdvance} />
          {l.last && <p data-testid="laser-last">{t('lastReading')}: <b>{formatLength(l.last.m, unit, 3)}</b> → {t(`laserTarget_${l.last.target}` as 'laserTarget_none')}</p>}
          {l.status === 'error' && <ul className="hint-text" data-testid="laser-tips">{t('laserTips').split('|').map((x) => <li key={x}>{x}</li>)}</ul>}
          {l.log.length > 0 && <details open={l.status === 'error'}><summary className="sm">Log</summary><pre className="laser-log" data-testid="laser-log">{l.log.join('\n')}</pre></details>}
          <p className="hint-text">{t('laserHow')}</p>
          <p className="hint-text">{t('laserNote')}</p>
        </div>
      )}
    </div>
  );
}
