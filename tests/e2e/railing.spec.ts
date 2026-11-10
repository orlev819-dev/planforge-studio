import { test, expect, type Page } from 'playwright/test';

async function toScreen(page: Page, p: { x: number; y: number }) {
  const c = page.getByTestId('plan-canvas'); const box = (await c.boundingBox())!; const v = JSON.parse((await c.getAttribute('data-view'))!);
  return { x: box.x + p.x * v.scale + v.ox, y: box.y + p.y * v.scale + v.oy };
}
const clickWorld = async (page: Page, p: { x: number; y: number }) => { const s = await toScreen(page, p); await page.mouse.click(s.x, s.y); };

test('balcony railing: convert a room wall, and draw a standalone railing', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-name-input').fill('Balcony');
  await page.getByTestId('project-submit').click();
  await page.getByTestId('room-dialog-open').click();
  await page.getByTestId('room-dialog-name').fill('Balcony');
  await page.getByTestId('room-width').fill('4');
  await page.getByTestId('room-length').fill('2');
  await page.getByTestId('room-create').click();
  await expect(page.getByTestId('room-area')).toHaveText('8.00 m²');

  await page.getByTestId('view-3d').click(); await page.waitForTimeout(400);
  const before = Number((await page.getByTestId('viewer-stats').textContent())!.split(' ')[0]);
  await page.getByTestId('view-2d').click();

  // turn the south wall of the room into a railing from the room panel
  await clickWorld(page, { x: 1, y: 1 });
  await expect(page.getByTestId('inspector-room')).toBeVisible();
  await page.getByTestId('room-wall-2-railing').click();
  await expect(page.getByTestId('room-railing')).toHaveText('3.85 m');

  // the wall inspector now shows railing options
  await clickWorld(page, { x: 2, y: 2 });
  await expect(page.getByTestId('inspector-wall')).toBeVisible();
  await expect(page.getByTestId('wall-kind')).toHaveValue('railing');
  await expect(page.getByTestId('wall-height')).toHaveValue('1.05');
  await page.getByTestId('railing-style').selectOption('glass');
  await page.getByTestId('wall-height').fill('1.1');
  await page.getByTestId('wall-height').press('Enter');

  let s = await page.evaluate(() => (window as any).__planforge.getState());
  let rails = Object.values(s.project.floors[0].walls).filter((w: any) => w.kind === 'railing') as any[];
  expect(rails).toHaveLength(1);
  expect(rails[0].railingStyle).toBe('glass');
  expect(rails[0].height).toBe(1.1);

  // 3D gains the railing parts (structure + glass) and keeps 3 solid walls
  await page.getByTestId('view-3d').click(); await page.waitForTimeout(400);
  expect(Number((await page.getByTestId('viewer-stats').textContent())!.split(' ')[0])).toBeGreaterThan(before);
  await page.getByTestId('view-2d').click();

  // draw a standalone railing with the tool
  await page.getByTestId('tool-railing').click();
  await clickWorld(page, { x: 0.5, y: 3 });
  await clickWorld(page, { x: 3.5, y: 3 });
  await page.keyboard.press('Escape');
  s = await page.evaluate(() => (window as any).__planforge.getState());
  rails = Object.values(s.project.floors[0].walls).filter((w: any) => w.kind === 'railing') as any[];
  expect(rails).toHaveLength(2);
  const standalone = rails.find((w: any) => w.standalone)!;
  expect(standalone.height).toBe(1.05);
  expect(standalone.thickness).toBeLessThanOrEqual(0.08);

  // doors are refused on a railing
  await page.getByTestId('tool-door').click();
  await clickWorld(page, { x: 2, y: 2 });
  await expect(page.getByTestId('toast')).toContainText('railing');
  expect(Object.keys((await page.evaluate(() => (window as any).__planforge.getState())).project.floors[0].openings)).toHaveLength(0);

  // survives reload
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('save-state')).toHaveText('Saved');
  await page.reload();
  await expect(page.getByTestId('editor')).toBeVisible();
  s = await page.evaluate(() => (window as any).__planforge.getState());
  expect(Object.values(s.project.floors[0].walls).filter((w: any) => w.kind === 'railing')).toHaveLength(2);
});
