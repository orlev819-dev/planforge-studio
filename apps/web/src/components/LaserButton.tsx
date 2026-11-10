import { useState } from 'react';
import { useLaser, connectLaser, disconnectLaser } from '../laser';
import { useStore } from '../store';
import { formatLength } from '../../../../packages/geometry/src/index';
import { useT } from '../i18n';

export function LaserButton() {
  const { t } = useT();
  const l = useLaser();
  const unit = useStore((s) => s.project?.settings.unit ?? 'm');
  const [open, setOpen] = useState(false);
  const dot = l.status === 'connected' ? '🟢' : l.status === 'connecting' || l.status === 'reconnecting' ? '🟡' : l.status === 'error' ? '🔴' : '⚪';
  return (
    <div className="laser">
      <button className="btn sm" data-testid="laser-open" onClick={() => setOpen(!open)} title={t('laser')}>📏 {dot}</button>
      {open && (
        <div className="laser-pop" data-testid="laser-panel">
          <h4>{t('laser')}</h4>
          <div className="muted sm">Bosch GLM 50-27 C / CG</div>
          <p data-testid="laser-status"><b>{t(`laser_${l.status}` as 'laser_idle')}</b>{l.device ? ` · ${l.device}` : ''}{l.detail && l.status !== 'connected' ? ` · ${l.detail}` : ''}</p>
          {l.status === 'unsupported'
            ? <p className="hint-text">{t('laserUnsupported')}</p>
            : l.status === 'connected' || l.status === 'reconnecting'
              ? <button className="btn" onClick={disconnectLaser}>{t('disconnect')}</button>
              : <button className="btn primary" data-testid="laser-connect" disabled={l.status === 'connecting'} onClick={() => void connectLaser()}>{t('connect')}</button>}
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
