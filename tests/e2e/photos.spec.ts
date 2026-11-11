/** Camera: taking a site photo and pinning it to the plan. The camera is a canvas stream here. */
import { test, expect, type Page } from 'playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // a fake rear camera: a 640x480 canvas painted with a recognisable colour
    const c = document.createElement('canvas'); c.width = 640; c.height = 480;
    const ctx = c.getContext('2d')!;
    const paint = () => { ctx.fillStyle = '#2a9d8f'; ctx.fillRect(0, 0, 640, 480); ctx.fillStyle = '#fff'; ctx.fillRect(40, 40, 200, 120); requestAnimationFrame(paint); };
    paint();
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => (c as any).captureStream(30) } });
  });
});

async function toScreen(page: Page, p: { x: number; y: number }) {
  const c = page.getByTestId('plan-canvas'); const box = (await c.boundingBox())!; const v = JSON.parse((await c.getAttribute('data-view'))!);
  return { x: box.x + p.x * v.scale + v.ox, y: box.y + p.y * v.scale + v.oy };
}
const clickWorld = async (page: Page, p: { x: number; y: number }) => { const s = await toScreen(page, p); await page.mouse.click(s.x, s.y); };
const photos = async (page: Page) => Object.values((await page.evaluate(() => (window as any).__planforge.getState())).project.floors[0].photos) as any[];

test('take a photo on site and pin it to the plan', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-name-input').fill('Site');
  await page.getByTestId('project-submit').click();
  await page.getByTestId('room-dialog-open').click();
  await page.getByTestId('room-create').click();

  // the Photo tool: tap where the photo was taken, shoot, keep it
  await page.getByTestId('tool-photo').click();
  await clickWorld(page, { x: 1, y: 1 });
  await expect(page.getByTestId('camera-dialog')).toBeVisible();
  await expect(page.getByTestId('camera-view')).toBeVisible();
  await page.getByTestId('camera-shutter').click();
  await expect(page.getByTestId('camera-shot')).toBeVisible();
  await page.getByTestId('camera-use').click();

  // it is pinned at that point, selected, and stored as a JPEG inside the project
  await expect(page.getByTestId('inspector-photo')).toBeVisible();
  let list = await photos(page);
  expect(list).toHaveLength(1);
  expect(list[0].x).toBeCloseTo(1, 1);
  expect(list[0].dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
  expect(list[0].dataUrl.length).toBeGreaterThan(500);

  // a name and a note stay with it
  await page.getByTestId('photo-name').fill('Socket wall');
  await page.getByTestId('photo-name').blur();
  await page.getByTestId('photo-note').fill('crack above the window');
  await page.getByTestId('photo-note').blur();

  // the pin is on the plan and selecting it opens the photo again
  await page.getByTestId('tool-select').click();
  await clickWorld(page, { x: 4, y: 3 });
  await expect(page.getByTestId('inspector-photo')).toBeHidden();
  await clickWorld(page, { x: 1, y: 1 });
  await expect(page.getByTestId('inspector-photo')).toBeVisible();
  await expect(page.getByTestId('photo-name')).toHaveValue('Socket wall');

  // a photo taken from the room panel is filed under that room
  await clickWorld(page, { x: 2, y: 2 });
  await expect(page.getByTestId('inspector-room')).toBeVisible();
  await page.getByTestId('room-photos-summary').click();
  await page.getByTestId('room-add-photo').click();
  await page.getByTestId('camera-shutter').click();
  await page.getByTestId('camera-use').click();
  await expect(page.getByTestId('room-photos').locator('button')).toHaveCount(1);
  list = await photos(page);
  expect(list.filter((p) => p.subjectId)).toHaveLength(1);

  // both survive a reload
  await expect(page.getByTestId('save-state')).toHaveText('Saved');
  await page.reload();
  await expect(page.getByTestId('editor')).toBeVisible();
  list = await photos(page);
  expect(list).toHaveLength(2);
  expect(list.find((p) => p.name === 'Socket wall').note).toBe('crack above the window');
});

test('without camera permission the dialog still offers the picker', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { throw new Error('Permission denied'); } } }); });
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-name-input').fill('No camera');
  await page.getByTestId('project-submit').click();
  await page.getByTestId('tool-photo').click();
  await clickWorld(page, { x: 1, y: 1 });
  await expect(page.getByTestId('camera-dialog')).toBeVisible();
  await expect(page.getByTestId('camera-error')).toContainText('Permission denied');
  await expect(page.getByTestId('camera-shutter')).toBeDisabled();
  await expect(page.getByTestId('camera-file')).toBeVisible();
});
