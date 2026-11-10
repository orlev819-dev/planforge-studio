/**
 * iPad layout + touch interaction (Chromium emulating an iPad: touch, coarse pointer, iPad viewport sizes).
 * Real Safari/WebKit is not available in this environment; see TEST_RESULTS.md.
 */
import { test, expect, type Page } from 'playwright/test';

type V = { x: number; y: number };
async function toScreen(page: Page, p: V) {
  const c = page.getByTestId('plan-canvas'); const box = (await c.boundingBox())!; const v = JSON.parse((await c.getAttribute('data-view'))!);
  return { x: box.x + p.x * v.scale + v.ox, y: box.y + p.y * v.scale + v.oy };
}
const tapWorld = async (page: Page, p: V) => { const s = await toScreen(page, p); await page.touchscreen.tap(s.x, s.y); await page.waitForTimeout(80); };
/** synthetic touch pointer sequence on the canvas (long press / drag) */
async function touchGesture(page: Page, pts: { x: number; y: number; type: 'down' | 'move' | 'up'; wait?: number }[]) {
  for (const p of pts) {
    await page.evaluate(({ x, y, type }) => {
      const c = document.querySelector('[data-testid=plan-canvas]')!;
      c.dispatchEvent(new PointerEvent(`pointer${type}`, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, button: 0, buttons: type === 'up' ? 0 : 1 }));
    }, p);
    if (p.wait) await page.waitForTimeout(p.wait);
  }
}
async function newProject(page: Page, name: string) {
  await page.goto('/');
  await page.getByTestId('new-project').tap();
  await page.getByTestId('project-name-input').fill(name);
  await page.getByTestId('project-submit').tap();
  await expect(page.getByTestId('editor')).toBeVisible();
}

test.describe('iPad portrait (820×1180)', () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

  test('touch layout: icon rail, drawer properties, 16px inputs, touch-size toolbar', async ({ page }) => {
    await newProject(page, 'iPad portrait');
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    expect((await page.locator('.nav').boundingBox())!.width).toBeLessThan(80);
    expect((await page.getByTestId('tool-room').boundingBox())!.height).toBeGreaterThanOrEqual(44);
    // drawer closed: canvas uses the full width next to the toolbar
    await expect(page.getByTestId('sidebar')).toBeHidden();
    await expect(page.getByTestId('drawer-toggle')).toBeVisible();
    await page.getByTestId('room-dialog-open').tap();
    const fs = await page.getByTestId('room-width').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fs).toBeGreaterThanOrEqual(16);
    await page.getByTestId('room-create').tap();
    // selecting something slides the properties drawer in
    await expect(page.getByTestId('sidebar')).toBeVisible();
    await expect(page.getByTestId('room-area')).toHaveText('14.00 m²');
    await page.getByTestId('drawer-close').tap();
    await expect(page.getByTestId('sidebar')).toBeHidden();
    await page.getByTestId('drawer-toggle').tap();
    await expect(page.getByTestId('sidebar')).toBeVisible();
  });

  test('draw a room by tapping corners and finishing from the action bar', async ({ page }) => {
    await newProject(page, 'Tap room');
    await page.getByTestId('tool-room').tap();
    for (const p of [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 2 }, { x: 0, y: 2 }]) await tapWorld(page, p);
    await expect(page.getByTestId('draw-bar')).toBeVisible();
    await page.getByTestId('bar-finish').tap();
    await expect(page.getByTestId('room-area')).toHaveText('6.00 m²');
    await expect(page.getByTestId('draw-bar')).toHaveCount(0);
  });

  test('typed length + direction buttons draw exact walls without a keyboard', async ({ page }) => {
    await newProject(page, 'Bar walls');
    await page.getByTestId('tool-room').tap();
    await tapWorld(page, { x: 0, y: 0 });
    const place = async (len: string, dir: string) => { await page.getByTestId('bar-length').fill(len); await page.getByTestId(dir).tap(); };
    await place('4.2', 'bar-dir-10');
    await place('3.1', 'bar-dir-01');
    await place('4.2', 'bar-dir--10');
    await page.getByTestId('bar-finish').tap();
    await expect(page.getByTestId('room-area')).toHaveText('13.02 m²');
  });

  test('long-press opens the context menu; one-finger drag on empty space pans', async ({ page }) => {
    await newProject(page, 'Gestures');
    await page.getByTestId('room-dialog-open').tap();
    await page.getByTestId('room-create').tap();
    await page.getByTestId('drawer-close').tap();
    const c = await toScreen(page, { x: 2, y: 1.75 });
    await touchGesture(page, [{ ...c, type: 'down', wait: 750 }, { ...c, type: 'up' }]);
    await expect(page.locator('.ctx-menu')).toBeVisible();
    await expect(page.locator('.ctx-menu')).toContainText('Rotate 90°');
    await page.keyboard.press('Escape');
    const before = JSON.parse((await page.getByTestId('plan-canvas').getAttribute('data-view'))!);
    const e = await toScreen(page, { x: -2, y: 6 });
    await touchGesture(page, [{ ...e, type: 'down' }, { x: e.x + 60, y: e.y + 40, type: 'move' }, { x: e.x + 120, y: e.y + 80, type: 'move' }, { x: e.x + 120, y: e.y + 80, type: 'up' }]);
    const after = JSON.parse((await page.getByTestId('plan-canvas').getAttribute('data-view'))!);
    expect(after.ox - before.ox).toBeCloseTo(120, 0);
    expect(after.oy - before.oy).toBeCloseTo(80, 0);
    // the room was not moved by the pan
    const s = await page.evaluate(() => (window as any).__planforge.getState());
    expect(Math.min(...Object.values(s.project.floors[0].vertices).map((v: any) => v.x))).toBe(0);
  });

  test('3D walk mode shows the on-screen walk pad', async ({ page }) => {
    await newProject(page, 'Walk');
    await page.getByTestId('room-dialog-open').tap();
    await page.getByTestId('room-create').tap();
    await page.getByTestId('view-3d').tap();
    await page.getByRole('button', { name: 'Walk (WASD)' }).tap();
    await expect(page.getByTestId('walk-pad')).toBeVisible();
    expect((await page.getByTestId('walk-w').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
});

test.describe('iPad landscape (1180×820)', () => {
  test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

  test('properties panel is docked; home-screen icons are served', async ({ page }) => {
    await newProject(page, 'iPad landscape');
    await expect(page.getByTestId('sidebar')).toBeVisible();
    await expect(page.getByTestId('drawer-toggle')).toBeHidden();
    const icon = await page.locator('link[rel=apple-touch-icon]').getAttribute('href');
    const res = await page.request.get(new URL(icon!, page.url()).toString());
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image/png');
    expect(await page.locator('meta[name=apple-mobile-web-app-capable]').getAttribute('content')).toBe('yes');
  });
});
