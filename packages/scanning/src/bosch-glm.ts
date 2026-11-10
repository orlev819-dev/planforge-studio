/**
 * Bosch GLM 50-27 C / CG (and likely other "MT protocol" GLM-C models) over Bluetooth LE.
 *
 * PROTOCOL SOURCE: not an official Bosch specification. Community reverse engineering of the MeasureOn app:
 *  - service 02a6c0d0-0451-4000-b000-fb3210111989, characteristic 02a6c0d1-0451-4000-b000-fb3210111989
 *  - after subscribing to indications, write C0 55 02 01 00 1A to enable sending measurements to the host
 *  - a measurement packet starts with C0 55 10 06; bytes 7..10 are a little-endian float32 distance in meters
 * (github.com/ketan/Bosch-GLM50C-Rangefinder, which was written for a GLM 50-27 CG; b4x.com GLM threads; eevblog GLM thread)
 */
export const BOSCH_GLM_SERVICE = '02a6c0d0-0451-4000-b000-fb3210111989';
export const BOSCH_GLM_CHARACTERISTIC = '02a6c0d1-0451-4000-b000-fb3210111989';
export const BOSCH_GLM_ENABLE = new Uint8Array([0xc0, 0x55, 0x02, 0x01, 0x00, 0x1a]);
const HEADER = [0xc0, 0x55, 0x10, 0x06];

/** Returns the distance in meters, or null for packets that are not a valid distance measurement. */
export function parseBoschGlmPacket(bytes: Uint8Array): number | null {
  if (bytes.length < 11) return null;
  for (let i = 0; i < HEADER.length; i++) if (bytes[i] !== HEADER[i]) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getFloat32(7, true);
  // GLM 50-27 range is 0.05–50 m; reject garbage (NaN, negative, out of range)
  if (!Number.isFinite(v) || v <= 0 || v > 250) return null;
  return Math.round(v * 10000) / 10000;
}

// ---- minimal Web Bluetooth typings (not in TS DOM lib) ----
interface BtChar extends EventTarget { value?: DataView; startNotifications(): Promise<BtChar>; writeValueWithoutResponse?(d: BufferSource): Promise<void>; writeValue(d: BufferSource): Promise<void> }
interface BtServer { connected: boolean; connect(): Promise<BtServer>; disconnect(): void; getPrimaryService(s: string): Promise<{ getCharacteristic(c: string): Promise<BtChar> }> }
export interface BtDevice extends EventTarget { id: string; name?: string; gatt?: BtServer }
export interface BtApi { requestDevice(o: unknown): Promise<BtDevice>; getAvailability?(): Promise<boolean> }

export type LaserStatus = 'unsupported' | 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface GlmEvents {
  onStatus(s: LaserStatus, detail?: string): void;
  onReading(meters: number): void;
  /** diagnostic trace of connection steps (shown in the UI) */
  onLog?(msg: string): void;
}

/** Web Bluetooth driver for Bosch GLM-C laser measures with automatic reconnect. */
export class BoschGlmConnection {
  device: BtDevice | null = null;
  private char: BtChar | null = null;
  private manualDisconnect = false;
  private onChange = (e: Event) => {
    const dv = (e.target as BtChar).value;
    if (!dv) return;
    const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
    const m = parseBoschGlmPacket(bytes);
    if (m != null) this.ev.onReading(m);
    else this.log(`packet ignored: ${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join(' ')}`);
  };
  private onDisconnect = () => { void this.handleDisconnect(); };

  constructor(private bt: BtApi, private ev: GlmEvents) {}

  async connect() {
    this.manualDisconnect = false;
    this.ev.onStatus('connecting');
    try {
      const device = await this.bt.requestDevice({
        filters: [{ services: [BOSCH_GLM_SERVICE] }, { namePrefix: 'GLM' }, { namePrefix: 'Bosch' }],
        optionalServices: [BOSCH_GLM_SERVICE],
      });
      this.device = device;
      this.log(`device selected: ${device.name ?? device.id}`);
      device.addEventListener('gattserverdisconnected', this.onDisconnect);
      // Windows/Chrome often fail the first GATT connect: retry with backoff
      let last: unknown = null;
      for (let i = 1; i <= 4; i++) {
        try { this.log(`GATT connect attempt ${i}/4`); await this.setup(); last = null; break; }
        catch (e) {
          last = e; this.log(`attempt ${i} failed: ${(e as Error).name ?? ''} ${(e as Error).message ?? e}`);
          try { device.gatt?.disconnect(); } catch { /* ignore */ }
          await new Promise((r) => setTimeout(r, 600 * i));
        }
      }
      if (last) throw last;
      this.ev.onStatus('connected', device.name ?? 'GLM');
    } catch (e) {
      const msg = (e as Error).message || String(e);
      // user closed the chooser: back to idle, not an error
      this.ev.onStatus(/cancel|chooser|NotFoundError/i.test(`${(e as Error).name} ${msg}`) ? 'idle' : 'error', msg);
    }
  }

  private log(m: string) { this.ev.onLog?.(m); }

  private async setup() {
    const server = await this.device!.gatt!.connect();
    this.log('GATT connected');
    const svc = await server.getPrimaryService(BOSCH_GLM_SERVICE);
    this.log('Bosch service found');
    const ch = await svc.getCharacteristic(BOSCH_GLM_CHARACTERISTIC);
    this.log('measurement characteristic found');
    await ch.startNotifications();
    this.log('indications enabled');
    ch.removeEventListener('characteristicvaluechanged', this.onChange);
    ch.addEventListener('characteristicvaluechanged', this.onChange);
    if (ch.writeValueWithoutResponse) await ch.writeValueWithoutResponse(BOSCH_GLM_ENABLE);
    else await ch.writeValue(BOSCH_GLM_ENABLE);
    this.log('enable command sent - ready, measure on the device');
    this.char = ch;
  }

  private async handleDisconnect() {
    this.char = null;
    if (this.manualDisconnect || !this.device) { this.ev.onStatus('idle'); return; }
    // the GLM powers off after inactivity; try to reconnect a few times with backoff
    for (let i = 0; i < 3; i++) {
      this.ev.onStatus('reconnecting', `${i + 1}/3`);
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      if (this.manualDisconnect) return;
      try { await this.setup(); this.ev.onStatus('connected', this.device.name ?? 'GLM'); return; } catch { /* retry */ }
    }
    this.ev.onStatus('error', 'Device disconnected (switched off or out of range). Turn it on and connect again.');
  }

  disconnect() {
    this.manualDisconnect = true;
    this.char?.removeEventListener('characteristicvaluechanged', this.onChange);
    this.device?.removeEventListener('gattserverdisconnected', this.onDisconnect);
    try { this.device?.gatt?.disconnect(); } catch { /* already gone */ }
    this.device = null; this.char = null;
    this.ev.onStatus('idle');
  }
}
