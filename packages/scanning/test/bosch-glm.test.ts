// Test fixtures: SYNTHETIC packets built to the documented layout (not captured from a device).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBoschGlmPacket, BoschGlmConnection, BOSCH_GLM_ENABLE, type BtApi } from '../src/bosch-glm';

const packet = (m: number, header = [0xc0, 0x55, 0x10, 0x06]) => {
  const b = new Uint8Array(16); b.set(header, 0); b[4] = 0x00; b[5] = 0x00; b[6] = 0x00;
  new DataView(b.buffer).setFloat32(7, m, true); b[11] = 0x00; return b;
};

test('parses distance packets (little-endian float32 at byte 7)', () => {
  assert.equal(parseBoschGlmPacket(packet(3.512)), 3.512);
  assert.equal(parseBoschGlmPacket(packet(0.305)), 0.305);
  assert.equal(parseBoschGlmPacket(packet(49.9987)), 49.9987);
});

test('rejects non-measurement / malformed packets', () => {
  assert.equal(parseBoschGlmPacket(packet(3, [0xc0, 0x55, 0x02, 0x01])), null);
  assert.equal(parseBoschGlmPacket(new Uint8Array([0xc0, 0x55, 0x10, 0x06, 0])), null);
  assert.equal(parseBoschGlmPacket(packet(NaN)), null);
  assert.equal(parseBoschGlmPacket(packet(-1)), null);
  assert.equal(parseBoschGlmPacket(packet(1e6)), null);
});

test('driver subscribes, sends the enable command and emits readings (mock GATT)', async () => {
  const written: Uint8Array[] = [];
  const ch = new EventTarget() as any;
  ch.startNotifications = async () => ch;
  ch.writeValueWithoutResponse = async (d: Uint8Array) => { written.push(d); };
  const server = { connected: true, connect: async () => server, disconnect() {}, getPrimaryService: async () => ({ getCharacteristic: async () => ch }) };
  const device = Object.assign(new EventTarget(), { id: 'x', name: 'GLM50-27 CG', gatt: server });
  const bt: BtApi = { requestDevice: async () => device as any };
  const statuses: string[] = [], readings: number[] = [];
  const c = new BoschGlmConnection(bt, { onStatus: (s) => statuses.push(s), onReading: (m) => readings.push(m) });
  await c.connect();
  assert.deepEqual(statuses, ['connecting', 'connected']);
  assert.deepEqual([...written[0]], [...BOSCH_GLM_ENABLE]);
  const p = packet(4.25);
  ch.value = new DataView(p.buffer);
  ch.dispatchEvent(new Event('characteristicvaluechanged'));
  assert.deepEqual(readings, [4.25]);
  c.disconnect();
  assert.equal(statuses.at(-1), 'idle');
});
