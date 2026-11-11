// Fixtures: frames built to the documented layout, plus the exact frames published in the
// community captures of a GLM 50-27 CG (see the protocol notes in src/bosch-glm.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBoschGlmPacket, parseSyncData, GlmFrameParser, buildCommand, crc8, hex,
  BoschGlmConnection, BOSCH_GLM_ENABLE, BOSCH_GLM_MEASURE, type BtApi,
} from '../src/bosch-glm';

const bytes = (s: string) => new Uint8Array(s.split(/\s+/).map((x) => parseInt(x, 16)));
/** a pushed measurement event: C0 55 10 | kind laser counter 00 | float32 | 8x00 | CRC */
const packet = (m: number, kind = 0x06) => {
  const body = new Uint8Array(19);
  body.set([0xc0, 0x55, 0x10, kind, 0x08, 0x02, 0x08]);
  new DataView(body.buffer).setFloat32(7, m, true);
  return new Uint8Array([...body, crc8(body)]);
};

test('checksum and command frames match the published captures', () => {
  assert.equal(hex(BOSCH_GLM_ENABLE), 'c0 55 02 01 00 1a');      // status request / enable push
  assert.equal(hex(BOSCH_GLM_MEASURE), 'c0 56 01 00 1e');        // measure, as if the button was pressed
  assert.equal(hex(buildCommand(0x40)), 'c0 40 00 ee');          // raw measurement
  assert.equal(crc8(bytes('c0 11 00')), 0x3a);                   // the meter's heartbeat
});

test('parses the captured measurement frames', () => {
  assert.equal(parseBoschGlmPacket(bytes('C0 55 10 06 08 02 08 E0 9C E9 3F 00 00 00 00 00 00 00 00 06')), 1.8251);
  // the older curr/min/max event (kind 0A): the current value is the first float
  assert.equal(parseBoschGlmPacket(bytes('C0 55 10 0A 08 6A 00 DC D7 C1 3F 4E D1 C1 3F C6 DC C1 3F 3C')), 1.5144);
  assert.equal(parseBoschGlmPacket(packet(3.512)), 3.512);
  assert.equal(parseBoschGlmPacket(packet(49.9987)), 49.9987);
});

test('rejects heartbeats, status events and malformed packets', () => {
  assert.equal(parseBoschGlmPacket(bytes('c0 11 00 3a')), null);  // heartbeat
  assert.equal(parseBoschGlmPacket(packet(3, 0x02)), null);       // laser-state event
  assert.equal(parseBoschGlmPacket(packet(3, 0xfe)), null);       // measurement failed
  assert.equal(parseBoschGlmPacket(bytes('c0 55 10 06 00')), null); // truncated
  assert.equal(parseBoschGlmPacket(packet(NaN)), null);
  assert.equal(parseBoschGlmPacket(packet(-1)), null);
  assert.equal(parseBoschGlmPacket(packet(1e6)), null);
});

test('frame parser: splits, joins and checks frames', () => {
  const p = new GlmFrameParser();
  const beat = bytes('c0 11 00 3a');
  // two frames in one indication
  const two = p.feed(new Uint8Array([...beat, ...packet(2.5)]));
  assert.equal(two.length, 2);
  assert.equal(two[0].type === 'device' && two[0].command, 0x11);
  assert.ok(two.every((f) => f.crcOk));
  // one frame split over two indications
  const m = packet(1.25);
  assert.deepEqual(p.feed(m.slice(0, 6)), []);
  const rest = p.feed(m.slice(6));
  assert.equal(rest.length, 1);
  assert.equal(parseSyncData(rest[0].data)!.value, 1.25);
  // a bad checksum is reported, not silently used
  const bad = packet(3); bad[bad.length - 1] ^= 0xff;
  assert.equal(p.feed(bad)[0].crcOk, false);
  // replies start with a status byte: status | length | data | CRC
  const reply = new Uint8Array([0x00, 0x10, 0x02, 0x00, 0x08, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  reply[reply.length - 1] = crc8(reply.subarray(0, reply.length - 1));
  const r = p.feed(reply)[0];
  assert.equal(r.type, 'reply');
  assert.ok(r.crcOk);
});

function mockDevice() {
  const written: Uint8Array[] = [];
  const ch = new EventTarget() as any;
  ch.startNotifications = async () => ch;
  ch.writeValue = async (d: Uint8Array) => { written.push(d); };
  const server = { connected: true, connect: async () => server, disconnect() {}, getPrimaryService: async () => ({ getCharacteristic: async () => ch }) };
  const device = Object.assign(new EventTarget(), { id: 'x', name: 'GLM50-27 CG', gatt: server });
  const emit = (b: Uint8Array) => { ch.value = new DataView(b.buffer, b.byteOffset, b.byteLength); ch.dispatchEvent(new Event('characteristicvaluechanged')); };
  return { bt: { requestDevice: async () => device as any } as BtApi, written, emit, ch };
}

test('driver: subscribes, asks for status with a response, and emits only real measurements', async () => {
  const { bt, written, emit } = mockDevice();
  const statuses: string[] = [], readings: number[] = [], beats: number[] = [];
  const c = new BoschGlmConnection(bt, { onStatus: (s) => statuses.push(s), onReading: (m) => readings.push(m), onHeartbeat: (n) => beats.push(n) });
  await c.connect();
  assert.deepEqual(statuses, ['connecting', 'connected']);
  assert.equal(hex(written[0]), hex(BOSCH_GLM_ENABLE));
  emit(bytes('c0 11 00 3a'));                  // heartbeat: link alive, no reading
  assert.deepEqual(beats, [1]);
  emit(packet(2.1, 0x02));                     // laser switched on
  emit(packet(4.25));                          // a measurement
  emit(packet(0.98, 0x0a));                    // and one with min/max
  assert.deepEqual(readings, [4.25, 0.98]);
  await c.measure();
  assert.equal(hex(written[1]), hex(BOSCH_GLM_MEASURE));
  c.disconnect();
  assert.equal(statuses.at(-1), 'idle');
});

test('driver: the status reply reports the value already on the display, which is not a new reading', async () => {
  const { bt, emit } = mockDevice();
  const readings: number[] = [];
  const c = new BoschGlmConnection(bt, { onStatus: () => {}, onReading: (m) => readings.push(m) });
  await c.connect();
  const reply = new Uint8Array([0x00, 0x10, 0x06, 0x00, 0x08, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  new DataView(reply.buffer).setFloat32(6, 3.33, true);
  reply[reply.length - 1] = crc8(reply.subarray(0, reply.length - 1));
  emit(reply);
  assert.deepEqual(readings, []);              // the meter's current display value is not a measurement
  emit(packet(3.33));                          // the same value measured again IS one
  assert.deepEqual(readings, [3.33]);
  c.disconnect();
});

test('driver: falls back to write-without-response when the write needs one', async () => {
  const { bt, ch } = mockDevice();
  const without: Uint8Array[] = [];
  ch.writeValue = async () => { throw new Error('NotSupportedError'); };
  ch.writeValueWithoutResponse = async (d: Uint8Array) => { without.push(d); };
  const c = new BoschGlmConnection(bt, { onStatus: () => {}, onReading: () => {} });
  await c.connect();
  assert.equal(hex(without[0]), hex(BOSCH_GLM_ENABLE));
  c.disconnect();
});
