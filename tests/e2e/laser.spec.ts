/** Bluetooth laser flow with a SIMULATED Bosch GLM (test fixture only — injected via addInitScript, never shipped). */
import { test, expect } from 'playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const ch: any = new EventTarget();
    const written: number[][] = [];
    ch.startNotifications = async () => ch;
    ch.writeValueWithoutResponse = async (d: Uint8Array) => { written.push([...d]); };
    const server: any = { connected: true, connect: async () => server, disconnect() {}, getPrimaryService: async () => ({ getCharacteristic: async () => ch }) };
    const device: any = Object.assign(new EventTarget(), { id: 'sim', name: 'GLM50-27 CG (simulated)', gatt: server });
    (navigator as any).bluetooth = { requestDevice: async () => device };
    (window as any).__mockGlm = {
      written,
      emit(m: number) {
        const b = new Uint8Array(16); b.set([0xc0, 0x55, 0x10, 0x06]); new DataView(b.buffer).setFloat32(7, m, true);
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
