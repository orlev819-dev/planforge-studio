/** Bluetooth laser flow with a SIMULATED Bosch GLM (test fixture only — injected via addInitScript, never shipped). */
import { test, expect } from 'playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const ch: any = new EventTarget();
    const written: number[][] = [];
    ch.startNotifications = async () => ch;
    ch.writeValue = async (d: Uint8Array) => { written.push([...d]); };
    const server: any = { connected: true, connect: async () => { if ((window as any).__glmFail > 0) { (window as any).__glmFail--; throw Object.assign(new Error('Connection attempt failed.'), { name: 'NetworkError' }); } return server; }, disconnect() {}, getPrimaryService: async () => ({ getCharacteristic: async () => ch }) };
    const device: any = Object.assign(new EventTarget(), { id: 'sim', name: 'GLM50-27 CG (simulated)', gatt: server });
    (navigator as any).bluetooth = { requestDevice: async () => device };
    (window as any).__mockGlm = {
      written,
      // a pushed measurement event, with the real CRC-8 (poly 0xA6, init 0xAA) the driver checks
      emit(m: number) {
        const body = new Uint8Array(19);
        body.set([0xc0, 0x55, 0x10, 0x06, 0x08, 0x02, 0x08]);
        new DataView(body.buffer).setFloat32(7, m, true);
        let c = 0xaa;
        for (const x of body) { c ^= x; for (let i = 0; i < 8; i++) c = c & 0x80 ? ((c << 1) ^ 0xa6) & 0xff : (c << 1) & 0xff; }
        const b = new Uint8Array([...body, c]);
        ch.value = new DataView(b.buffer); ch.dispatchEvent(new Event('characteristicvaluechanged'));
      },
      heartbeat() {
        const b = new Uint8Array([0xc0, 0x11, 0x00, 0x3a]);
        ch.value = new DataView(b.buffer); ch.dispatchEvent(new Event('characteristicvaluechanged'));
      },
    };
  });
});

test('laser reading fills focused length field and sets selected wall length', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-name-input').fill('Laser');
  await page.getByTestId('project-submit').click();
  await page.getByTestId('room-dialog-open').click();
  await page.getByTestId('room-create').click();
  await expect(page.getByTestId('room-area')).toHaveText('14.00 m²');

  await page.getByTestId('laser-open').click();
  await page.getByTestId('laser-connect').click();
  await expect(page.getByTestId('laser-status')).toContainText('Connected');
  expect(await page.evaluate(() => (window as any).__mockGlm.written[0])).toEqual([0xc0, 0x55, 0x02, 0x01, 0x00, 0x1a]);
  await page.getByTestId('laser-open').click();

  // 1) focused wall-length field
  await page.getByTestId('room-wall-0').focus();
  await page.evaluate(() => (window as any).__mockGlm.emit(4.5));
  await expect(page.getByTestId('room-area')).toHaveText('15.75 m²');

  // 2) selected wall
  const s = await page.evaluate(() => (window as any).__planforge.getState());
  const f = s.project.floors[0];
  const room = Object.values(f.rooms)[0] as any;
  const wall = (Object.values(f.walls) as any[]).find((w) => [w.a, w.b].includes(room.vertexIds[1]) && [w.a, w.b].includes(room.vertexIds[2]));
  const canvas = page.getByTestId('plan-canvas');
  const box = (await canvas.boundingBox())!; const v = JSON.parse((await canvas.getAttribute('data-view'))!);
  const a = f.vertices[wall.a], b = f.vertices[wall.b];
  await page.getByTestId('tool-select').click();
  await page.mouse.click(box.x + ((a.x + b.x) / 2) * v.scale + v.ox, box.y + ((a.y + b.y) / 2) * v.scale + v.oy);
  await expect(page.getByTestId('inspector-wall')).toBeVisible();
  await page.evaluate(() => (window as any).__mockGlm.emit(2.8));
  await expect(page.getByTestId('wall-length')).toHaveValue('2.8');
  await page.getByTestId('laser-open').click();
  await expect(page.getByTestId('laser-last')).toContainText('2.800 m');
});

test('first GATT connect fails (Windows behaviour) -> automatic retry connects', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { (window as any).__glmFail = 2; });
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-name-input').fill('Retry');
  await page.getByTestId('project-submit').click();
  await page.getByTestId('laser-open').click();
  await page.getByTestId('laser-connect').click();
  await expect(page.getByTestId('laser-status')).toContainText('Connected', { timeout: 10000 });
  await expect(page.getByTestId('laser-log')).toContainText('attempt 1 failed');
  await expect(page.getByTestId('laser-log')).toContainText('status request c0 55 02 01 00 1a');
});

test('all connect attempts fail -> error with tips and log', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { (window as any).__glmFail = 99; });
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-name-input').fill('Fail');
  await page.getByTestId('project-submit').click();
  await page.getByTestId('laser-open').click();
  await page.getByTestId('laser-connect').click();
  await expect(page.getByTestId('laser-status')).toContainText('Error', { timeout: 15000 });
  await expect(page.getByTestId('laser-tips')).toContainText('MeasureOn');
  await expect(page.getByTestId('laser-log')).toContainText('attempt 4 failed');
});

test('laser panel is fully visible on a tablet top bar and closes on outside tap', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-name-input').fill('Panel');
  await page.getByTestId('project-submit').click();
  await page.getByTestId('laser-open').click();
  const pop = page.getByTestId('laser-panel');
  await expect(pop).toBeVisible();
  const b = (await pop.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.y).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(vp.width + 1);
  expect(b.y + b.height).toBeLessThanOrEqual(vp.height + 1);
  // not clipped by any scrolling ancestor
  expect(await pop.evaluate((el) => { const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + 10); return el.contains(top); })).toBe(true);
  await page.getByTestId('laser-connect').click();
  await expect(page.getByTestId('laser-status')).toContainText('Connected');
  await page.mouse.click(400, 700);
  await expect(pop).toHaveCount(0);
});

test('readings follow the aimed wall field: by selection, after focus is lost, and wall by wall', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-name-input').fill('Aim');
  await page.getByTestId('project-submit').click();
  await page.getByTestId('room-dialog-open').click();
  await page.getByTestId('room-create').click();                     // 4.00 x 3.50
  await page.getByTestId('laser-open').click();
  await page.getByTestId('laser-connect').click();
  await expect(page.getByTestId('laser-status')).toContainText('Connected');
  await expect(page.getByTestId('laser-aim')).toContainText('Wall 1'); // the new room is selected
  await page.getByTestId('laser-open').click();                       // close the panel, keep the selection

  // no field focused (the panel's button had focus): the reading still lands on Wall 1
  await page.evaluate(() => (window as any).__mockGlm.emit(4.2));
  await expect(page.getByTestId('room-wall-0')).toHaveValue('4.2');
  // ... and the aim moves on, so the next reading is Wall 2
  await expect(page.getByTestId('room-wall-1')).toHaveClass(/laser-armed/);
  await page.evaluate(() => (window as any).__mockGlm.emit(3.1));
  await expect(page.getByTestId('room-wall-1')).toHaveValue('3.1');
  await expect(page.getByTestId('room-area')).toHaveText('13.02 m²');

  // tapping a field aims at it and the aim survives losing focus to the panel
  await page.getByTestId('room-wall-3').focus();
  await page.getByTestId('laser-open').click();
  await expect(page.getByTestId('laser-aim')).toContainText('Wall 4');
  await page.getByTestId('laser-advance').uncheck();                  // stay on this wall
  await page.evaluate(() => (window as any).__mockGlm.emit(3.4));
  await expect(page.getByTestId('room-wall-3')).toHaveValue('3.4');
  // a measured wall is held: measuring it again is refused until it is released
  await expect(page.getByTestId('room-wall-3')).toHaveClass(/locked/);
  await page.evaluate(() => (window as any).__mockGlm.emit(3.6));
  await expect(page.getByTestId('toast')).toContainText('locked');
  await expect(page.getByTestId('room-wall-3')).toHaveValue('3.4');
  await page.getByTestId('room-wall-3-lock').click();                 // release it
  await page.evaluate(() => (window as any).__mockGlm.emit(3.6));
  await expect(page.getByTestId('room-wall-3')).toHaveValue('3.6');
  await page.getByTestId('laser-open').click();
  await expect(page.getByTestId('laser-last')).toContainText('3.600 m');

  // in interior mode the reading is taken as an inside-face measurement
  await page.getByTestId('laser-open').click();
  await page.getByTestId('room-wall-0-lock').click();                 // Wall 1 was measured earlier
  await page.getByTestId('measure-interior').click();
  await page.getByTestId('room-wall-0').focus();
  await page.evaluate(() => (window as any).__mockGlm.emit(3.72));
  await expect(page.getByTestId('room-wall-0')).toHaveValue('3.72');
  const xs = await page.evaluate(() => {
    const f = (window as any).__planforge.getState().project.floors[0];
    return Object.values(f.vertices).map((v: any) => v.x);
  });
  expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(3.72 + 0.15, 2);  // centerline, not the raw reading
});

test('heartbeats show the link is alive, and Measure asks the meter for a reading', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-name-input').fill('Measure');
  await page.getByTestId('project-submit').click();
  await page.getByTestId('room-dialog-open').click();
  await page.getByTestId('room-create').click();
  await page.getByTestId('laser-open').click();
  await page.getByTestId('laser-connect').click();
  await expect(page.getByTestId('laser-status')).toContainText('Connected');

  // the meter's heartbeat is not a measurement, but it proves the link
  await expect(page.getByTestId('laser-beats')).toContainText('Waiting');
  await page.evaluate(() => (window as any).__mockGlm.heartbeat());
  await page.evaluate(() => (window as any).__mockGlm.heartbeat());
  await expect(page.getByTestId('laser-beats')).toContainText('2 heartbeats');
  expect(await page.evaluate(() => (window as any).__planforge.getState().project.floors[0])).toBeTruthy();

  // Measure sends the button-press command; the meter answers with a pushed result
  await page.getByTestId('laser-measure').click();
  expect(await page.evaluate(() => (window as any).__mockGlm.written[1])).toEqual([0xc0, 0x56, 0x01, 0x00, 0x1e]);
  await page.evaluate(() => (window as any).__mockGlm.emit(2.75));
  await expect(page.getByTestId('laser-last')).toContainText('2.750 m');
  await expect(page.getByTestId('laser-log')).toContainText('measurement 2.75 m');
  await page.getByTestId('laser-open').click();
  await expect(page.getByTestId('room-wall-0')).toHaveValue('2.75');
});
