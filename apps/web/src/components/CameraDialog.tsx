import { useEffect, useRef, useState } from 'react';
import { Modal } from './fields';
import { useT } from '../i18n';
import { toast } from '../store';

/** Longest side of a stored photo, in pixels: enough to read a socket or a label, small enough to keep in the project. */
const MAX_SIDE = 1600;
const QUALITY = 0.75;

/** Downscale to MAX_SIDE and encode as JPEG, so a project with photos stays a few MB. */
export function shrinkToJpeg(src: CanvasImageSource, w: number, h: number): string {
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', QUALITY);
}

export function fileToJpeg(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onerror = () => rej(r.error ?? new Error('Could not read the file'));
    r.onload = () => {
      const img = new Image();
      img.onload = () => res(shrinkToJpeg(img, img.naturalWidth || 1, img.naturalHeight || 1));
      img.onerror = () => rej(new Error('Unreadable image'));
      img.src = String(r.result);
    };
    r.readAsDataURL(file);
  });
}

/**
 * Take a photo with the device camera. The live preview needs camera permission over HTTPS; where
 * that is refused or unavailable the dialog falls back to the system picker, which on a phone or
 * tablet still offers the camera. Returns a downscaled JPEG data URL.
 */
export function CameraDialog({ title, onClose, onPhoto }: { title?: string; onClose: () => void; onPhoto: (dataUrl: string) => void }) {
  const { t } = useT();
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shot, setShot] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const md = navigator.mediaDevices;
        if (!md?.getUserMedia) throw new Error(t('cameraUnavailable'));
        const s = await md.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false });
        if (dead) { s.getTracks().forEach((x) => x.stop()); return; }
        stream.current = s;
        if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
        setLive(true);
      } catch (e) {
        setError((e as Error).message || String(e));
      }
    })();
    return () => { dead = true; stream.current?.getTracks().forEach((x) => x.stop()); stream.current = null; };
  }, []); // eslint-disable-line

  function take() {
    const v = video.current;
    if (!v) return;
    const w = v.videoWidth || v.clientWidth, h = v.videoHeight || v.clientHeight;
    if (!w || !h) { toast(t('cameraNotReady'), 'error'); return; }
    setShot(shrinkToJpeg(v, w, h));
  }

  const use = () => { if (shot) { onPhoto(shot); onClose(); } };

  return (
    <Modal title={title ?? t('takePhoto')} onClose={onClose} testId="camera-dialog"
      footer={<>
        <button className="btn" onClick={onClose}>{t('cancel')}</button>
        {shot
          ? <><button className="btn" data-testid="camera-retake" onClick={() => setShot(null)}>{t('retake')}</button>
              <button className="btn primary" data-testid="camera-use" onClick={use}>{t('usePhoto')}</button></>
          : <button className="btn primary" data-testid="camera-shutter" disabled={!live} onClick={take}>{t('takePhoto')}</button>}
      </>}>
      {shot
        ? <img className="import-preview" data-testid="camera-shot" src={shot} alt={t('takePhoto')} />
        : <video ref={video} className="camera-view" data-testid="camera-view" playsInline muted />}
      {error && <p className="hint-text" data-testid="camera-error">{t('cameraFallback')} — {error}</p>}
      <label className="field">
        <span>{t('orPickFile')}</span>
        <input type="file" accept="image/*" capture="environment" data-testid="camera-file"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void fileToJpeg(f).then(setShot).catch((x) => toast(String(x.message || x), 'error')); }} />
      </label>
    </Modal>
  );
}
