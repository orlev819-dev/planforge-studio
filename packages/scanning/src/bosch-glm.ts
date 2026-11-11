/**
 * Bosch GLM 50-27 C / CG (and other "MT protocol" GLM-C models) over Bluetooth LE.
 *
 * PROTOCOL SOURCE: not an official Bosch specification. Community reverse engineering of the
 * MeasureOn app, cross-checked frame by frame against the published captures:
 *  - service 02a6c0d0-0451-4000-b000-fb3210111989, characteristic 02a6c0d1-…-fb3210111989 (indicate + write)
 *  - frames the meter sends by itself:  C0 | command | length | data | CRC
 *    replies to a command:              status | length | data | CRC
 *    CRC-8, polynomial 0xA6, initial value 0xAA, over everything before it
 *  - C0 55 02 01 00 1A  asks for the status AND switches on pushing measurements to the host
 *  - C0 56 01 00 1E     takes a measurement, as if the button had been pressed
 *  - C0 40 00 EE        raw measurement (unsigned 32-bit × 0.05 mm from the top of the meter)
 *  - a pushed 0x55 event carries: kind, laser on/off, counter, 00, float32 metres (data offset 4),
 *    with kind 06 = result, 0A = result with min/max, 02 = laser state changed, FE = failed
 *  - C0 11 00 3A arrives every 1.6–2.5 s; it is the meter's heartbeat and needs no answer
 *  - the meter switches itself off after 5 minutes, even while connected, unless it is asked
 *    for its status now and then
 * (github.com/matom-642/Bosch-GLM-BLE and ketan/Bosch-GLM50C-Rangefinder, both on a GLM 50-27 CG;
 *  b4x.com GLM threads for the captured frames above.)
 */
export const BOSCH_GLM_SERVICE = '02a6c0d0-0451-4000-b000-fb3210111989';
export const BOSCH_GLM_CHARACTERISTIC = '02a6c0d1-0451-4000-b000-fb3210111989';

export const CMD = { heartbeat: 0x11, rawMeasure: 0x40, sync: 0x55, measure: 0x56 } as const;
/** `kind` byte of a 0x55 payload */
export const EVENT = { status: 0x02, result: 0x06, resultMinMax: 0x0a, error: 0xfe } as const;

/** CRC-8, polynomial 0xA6, initial value 0xAA */
export function crc8(data: ArrayLike<number>): number {
  let c = 0xaa;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i];
    for (let b = 0; b < 8; b++) c = c & 0x80 ? ((c << 1) ^ 0xa6) & 0xff : (c << 1) & 0xff;
  }
  return c;
}

/** C0 | command | length | data | CRC */
export function buildCommand(command: number, data: number[] = []): Uint8Array<ArrayBuffer> {
  const frame = [0xc0, command, data.length, ...data];
  return new Uint8Array([...frame, crc8(frame)]);
}

/** status request — also switches on pushing measurements to the host */
export const BOSCH_GLM_ENABLE = buildCommand(CMD.sync, [0x01, 0x00]); // C0 55 02 01 00 1A
/** take a measurement, as if the button had been pressed */
export const BOSCH_GLM_MEASURE = buildCommand(CMD.measure, [0x00]);   // C0 56 01 00 1E

export type GlmFrame =
  | { type: 'device'; command: number; data: Uint8Array; crcOk: boolean; raw: Uint8Array }
  | { type: 'reply'; status: number; data: Uint8Array; crcOk: boolean; raw: Uint8Array };

export const hex = (b: ArrayLike<number>) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ');

/** Highest byte accepted as the status of a reply; anything else that is not C0 means lost sync. */
const MAX_STATUS = 0x1f;

/**
 * Turns indication payloads into frames. One indication normally carries one frame, but this also
 * copes with several frames in one payload or one frame split over two. A frame whose checksum is
 * wrong is still returned (marked crcOk: false, so the app can report it) and anything buffered
 * after it is dropped, because the byte stream can no longer be trusted.
 */
export class GlmFrameParser {
  private buf = new Uint8Array(0);
  reset() { this.buf = new Uint8Array(0); }
  feed(payload: Uint8Array): GlmFrame[] {
    let buf = new Uint8Array(this.buf.length + payload.length);
    buf.set(this.buf); buf.set(payload, this.buf.length);
    const out: GlmFrame[] = [];
    while (buf.length) {
      const header = buf[0] === 0xc0 ? 3 : buf[0] <= MAX_STATUS ? 2 : 0;
      if (!header) { buf = new Uint8Array(0); break; } // not a frame start: resync
      if (buf.length < header) break;
      const total = header + buf[header - 1] + 1;
      if (buf.length < total) break;
      const raw = buf.slice(0, total);
      buf = buf.slice(total);
      const crcOk = crc8(raw.subarray(0, total - 1)) === raw[total - 1];
      out.push(header === 3
        ? { type: 'device', command: raw[1], data: raw.subarray(3, total - 1), crcOk, raw }
        : { type: 'reply', status: raw[0], data: raw.subarray(2, total - 1), crcOk, raw });
      if (!crcOk) { buf = new Uint8Array(0); break; }
    }
    this.buf = buf;
    return out;
  }
}

export interface GlmSync { kind: number; laserOn: boolean; counter: number; value: number }

/** Decode the payload of a 0x55 event or reply: kind, laser, counter, 00, float32 metres. */
export function parseSyncData(data: Uint8Array): GlmSync | null {
  if (data.length < 8) return null;
  const value = new DataView(data.buffer, data.byteOffset, data.byteLength).getFloat32(4, true);
  return { kind: data[0], laserOn: data[1] === 0x01, counter: data[2], value };
}

/** A measurement in metres from a pushed 0x55 result frame, or null for anything else. */
export function parseBoschGlmPacket(bytes: Uint8Array): number | null {
  for (const fr of new GlmFrameParser().feed(bytes)) {
    if (fr.type !== 'device' || fr.command !== CMD.sync) continue;
    const s = parseSyncData(fr.data);
    if (!s || (s.kind !== EVENT.result && s.kind !== EVENT.resultMinMax)) continue;
    // GLM 50-27 range is 0.05-50 m; reject garbage (NaN, negative, out of range)
    if (!Number.isFinite(s.value) || s.value <= 0 || s.value > 250) return null;
    return Math.round(s.value * 10000) / 10000;
  }
  return null;
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
  /** diagnostic trace of connection steps and of every frame the meter sends (shown in the UI) */
  onLog?(msg: string): void;
  /** the meter's heartbeat: the link is alive even when no measurement arrives */
  onHeartbeat?(n: number): void;
}

/** how often the meter is asked for its status, to stop it switching off after 5 minutes */
const KEEPALIVE_MS = 4 * 60 * 1000;

/** Web Bluetooth driver for Bosch GLM-C laser measures with automatic reconnect. */
export class BoschGlmConnection {
  device: BtDevice | null = null;
  private char: BtChar | null = null;
  private manualDisconnect = false;
  private frames = new GlmFrameParser();
  private beats = 0;
  private keepAlive: ReturnType<typeof setInterval> | null = null;
  /** the first state the meter reports is its last measurement, not a new one */
  private gotFirstSync = false;

  private onChange = (e: Event) => {
    const dv = (e.target as BtChar).value;
    if (!dv) return;
    for (const fr of this.frames.feed(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength))) this.handleFrame(fr);
  };
  private onDisconnect = () => { void this.handleDisconnect(); };

  constructor(private bt: BtApi, private ev: GlmEvents) {}

  private handleFrame(fr: GlmFrame) {
    if (!fr.crcOk) this.log(`checksum mismatch: ${hex(fr.raw)}`);
    if (fr.type === 'device' && fr.command === CMD.heartbeat) {
      this.beats++;
      if (this.beats === 1) this.log('heartbeat — the meter is talking; press its button or tap Measure');
      this.ev.onHeartbeat?.(this.beats);
      return;
    }
    const sync = (fr.type === 'device' && fr.command === CMD.sync) || fr.type === 'reply' ? parseSyncData(fr.data) : null;
    if (!sync) { this.log(`frame ignored: ${hex(fr.raw)}`); return; }
    if (fr.type === 'reply' && fr.status !== 0) { this.log(`meter refused the command (status ${fr.status}): ${hex(fr.raw)}`); return; }
    if (sync.kind === EVENT.error) { this.log('the meter could not measure (no target / out of range)'); return; }
    if (sync.kind === EVENT.status) { this.log(`laser ${sync.laserOn ? 'on' : 'off'}`); return; }
    if (sync.kind !== EVENT.result && sync.kind !== EVENT.resultMinMax) { this.log(`event ${sync.kind.toString(16)}: ${hex(fr.raw)}`); return; }
    const m = Math.round(sync.value * 10000) / 10000;
    if (!Number.isFinite(m) || m <= 0 || m > 250) { this.log(`result out of range: ${hex(fr.raw)}`); return; }
    // the answer to the first status request reports the measurement already on the display
    if (fr.type === 'reply' && !this.gotFirstSync) { this.gotFirstSync = true; this.log(`meter ready (last value ${m} m)`); return; }
    this.gotFirstSync = true;
    this.log(`measurement ${m} m`);
    this.ev.onReading(m);
  }

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

  /** Write a command frame. With response by default: the meter ignores some writes without one. */
  private async write(frame: Uint8Array<ArrayBuffer>) {
    const ch = this.char;
    if (!ch) throw new Error('not connected');
    try { await ch.writeValue(frame); }
    catch (e) {
      if (!ch.writeValueWithoutResponse) throw e;
      this.log(`write with response failed (${(e as Error).message || e}) — trying without response`);
      await ch.writeValueWithoutResponse(frame);
    }
  }

  /** Take a measurement from the app, as if the meter's own button had been pressed. */
  async measure() {
    this.log(`measure command ${hex(BOSCH_GLM_MEASURE)}`);
    await this.write(BOSCH_GLM_MEASURE);
  }

  /** Ask for the meter's status; this also (re-)enables pushing measurements to the host. */
  async requestStatus() {
    this.log(`status request ${hex(BOSCH_GLM_ENABLE)}`);
    await this.write(BOSCH_GLM_ENABLE);
  }

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
    this.char = ch;
    this.frames.reset();
    this.gotFirstSync = false;
    await this.requestStatus();
    this.log('ready — measure on the device, or tap Measure');
    if (this.keepAlive) clearInterval(this.keepAlive);
    // the meter powers off after 5 minutes even while connected
    this.keepAlive = setInterval(() => { void this.requestStatus().catch(() => {}); }, KEEPALIVE_MS);
  }

  private async handleDisconnect() {
    this.char = null;
    if (this.keepAlive) { clearInterval(this.keepAlive); this.keepAlive = null; }
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
    if (this.keepAlive) { clearInterval(this.keepAlive); this.keepAlive = null; }
    this.char?.removeEventListener('characteristicvaluechanged', this.onChange);
    this.device?.removeEventListener('gattserverdisconnected', this.onDisconnect);
    try { this.device?.gatt?.disconnect(); } catch { /* already gone */ }
    this.device = null; this.char = null;
    this.ev.onStatus('idle');
  }
}
