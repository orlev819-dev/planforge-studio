/** Open plan: the wall between two rooms goes, the rooms stay. */
import { test, expect, type Page } from 'playwright/test';

async function toScreen(page: Page, p: { x: number; y: number }) {
  const c = page.getByTestId('plan-canvas'); const box = (await c.boundingBox())!; const v = JSON.parse((await c.getAttribute('data-view'))!);
  return { x: box.x + p.x * v.scale + v.ox, y: box.y + p.y * v.scale + v.oy };
}
const clickWorld = async (page: Page, p: { x: number; y: number }) => { const s = await toScreen(page, p); await page.mouse.click(s.x, s.y); };
const floor = async (page: Page) => (await page.evaluate(() => (window as any).__planforge.getState())).project.floors[0];

test('erase the wall between two rooms: an open passage, two rooms', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-name-input').fill('Open plan');
  await page.getByTestId('project-submit').click();
  await page.getByTestId('room-dialog-open').click();
  await page.getByTestId('room-dialog-name').fill('Living');
  await page.getByTestId('room-create').click();

  // a second room attached to its right shares that wall
  await page.getByTestId('room-dialog-open').click();
  await page.getByTestId('room-dialog-name').fill('Kitchen');
  await page.getByTestId('room-width').fill('3');
  await page.getByTestId('room-attach').selectOption('right');
  await page.getByTestId('room-create').click();
  await expect(page.getByTestId('room-area')).toHaveText('10.50 m²');
  let f = await floor(page);
  expect(Object.keys(f.rooms)).toHaveLength(2);
  expect(Object.values(f.walls).filter((w: any) => !w.exterior)).toHaveLength(1);

  // count what 3D builds while the wall is still there
  await page.getByTestId('view-3d').click();
  await page.waitForTimeout(400);
  const before = Number(((await page.getByTestId('viewer-stats').textContent()) ?? '0').split(' ')[0]);
  await page.getByTestId('view-2d').click();

  // the eraser on that shared wall opens the passage instead of refusing
  await page.getByTestId('tool-eraser').click();
  await clickWorld(page, { x: 4, y: 1.75 });
  f = await floor(page);
  expect(Object.keys(f.rooms)).toHaveLength(2);                       // still two rooms
  const shared = Object.values(f.walls).find((w: any) => !w.exterior) as any;
  expect(shared.kind).toBe('open');
  expect(Object.keys(f.walls)).toHaveLength(7);                       // the edge is still there

  // the rooms keep their own names and areas, and the passage is reported
  await page.getByTestId('tool-select').click();
  await clickWorld(page, { x: 2, y: 1.75 });
  await expect(page.getByTestId('room-area')).toHaveText('14.00 m²');
  await expect(page.getByTestId('room-open')).toHaveText('3.35 m');
  await clickWorld(page, { x: 5.5, y: 1.75 });
  await expect(page.getByTestId('room-area')).toHaveText('10.50 m²');

  // nothing stands there in 3D any more
  await page.getByTestId('view-3d').click();
  await page.waitForTimeout(400);
  const after = Number(((await page.getByTestId('viewer-stats').textContent()) ?? '0').split(' ')[0]);
  expect(after).toBeLessThan(before);
  await page.getByTestId('view-2d').click();

  // and it can be closed again from the wall panel
  await clickWorld(page, { x: 4, y: 1.75 });
  await expect(page.getByTestId('inspector-wall')).toBeVisible();
  await expect(page.getByTestId('wall-kind')).toHaveValue('open');
  await expect(page.getByTestId('wall-open-hint')).toBeVisible();
  await page.getByTestId('wall-kind').selectOption('solid');
  expect(((Object.values((await floor(page)).walls) as any[]).find((w) => !w.exterior)).kind).toBe('solid');

  // survives a reload
  await page.getByTestId('tool-eraser').click();
  await clickWorld(page, { x: 4, y: 1.75 });
  await expect(page.getByTestId('save-state')).toHaveText('Saved');
  await page.reload();
  await expect(page.getByTestId('editor')).toBeVisible();
  f = await floor(page);
  expect(Object.keys(f.rooms)).toHaveLength(2);
  expect((Object.values(f.walls) as any[]).find((w) => !w.exterior).kind).toBe('open');
});
