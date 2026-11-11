import { test, expect, type Page } from 'playwright/test';

async function toScreen(page: Page, p: { x: number; y: number }) {
  const c = page.getByTestId('plan-canvas'); const box = (await c.boundingBox())!; const v = JSON.parse((await c.getAttribute('data-view'))!);
  return { x: box.x + p.x * v.scale + v.ox, y: box.y + p.y * v.scale + v.oy };
}
const clickWorld = async (page: Page, p: { x: number; y: number }) => { const s = await toScreen(page, p); await page.mouse.click(s.x, s.y); };
const state = (page: Page) => page.evaluate(() => (window as any).__planforge.getState());

test('closing a ring of drawn walls makes it a room', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-name-input').fill('Closed');
  await page.getByTestId('project-submit').click();

  // draw 4 walls round a 4.00 x 3.50 ring, the last click back on the first corner
  await page.getByTestId('tool-wall').click();
  for (const p of [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3.5 }, { x: 0, y: 3.5 }, { x: 0, y: 0 }]) await clickWorld(page, p);

  // the room exists, is selected, and the drawn walls are now its walls
  await expect(page.getByTestId('inspector-room')).toBeVisible();
  await expect(page.getByTestId('room-area')).toHaveText('14.00 m²');
  expect(await page.getByTestId('room-walls').getByRole('textbox').count()).toBe(4);
  let s = await state(page);
  let f = s.project.floors[0];
  expect(Object.keys(f.rooms)).toHaveLength(1);
  expect(Object.keys(f.walls)).toHaveLength(4);
  expect(Object.values(f.walls).filter((w: any) => w.standalone)).toHaveLength(0);
  expect(Object.values(f.walls).every((w: any) => w.exterior)).toBe(true);
  // the chain ended with the ring, so the next click starts a new one
  await expect(page.getByTestId('draw-bar')).toBeHidden();

  // one undo removes the room and the wall that closed it together
  await page.keyboard.press('Control+z');
  f = (await state(page)).project.floors[0];
  expect(Object.keys(f.rooms)).toHaveLength(0);
  expect(Object.keys(f.walls)).toHaveLength(3);
  await page.keyboard.press('Control+y');
  expect(Object.keys((await state(page)).project.floors[0].rooms)).toHaveLength(1);

  // draw 3 more walls closing against the right-hand wall of that room -> connected room
  await page.getByTestId('tool-wall').click();
  for (const p of [{ x: 4, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 3.5 }, { x: 4, y: 3.5 }]) await clickWorld(page, p);
  await expect(page.getByTestId('room-area')).toHaveText('7.00 m²');
  f = (await state(page)).project.floors[0];
  expect(Object.keys(f.rooms)).toHaveLength(2);
  expect(Object.keys(f.walls)).toHaveLength(7);           // the shared wall is not duplicated
  expect(Object.values(f.walls).filter((w: any) => !w.exterior)).toHaveLength(1);

  // an open chain stays walls: no room, no toast
  await page.getByTestId('tool-wall').click();
  await clickWorld(page, { x: 0, y: 5 });
  await clickWorld(page, { x: 3, y: 5 });
  await page.keyboard.press('Escape');
  f = (await state(page)).project.floors[0];
  expect(Object.keys(f.rooms)).toHaveLength(2);
  expect(Object.values(f.walls).filter((w: any) => w.standalone)).toHaveLength(1);

  // survives a reload
  await expect(page.getByTestId('save-state')).toHaveText('Saved');
  await page.reload();
  await expect(page.getByTestId('editor')).toBeVisible();
  f = (await state(page)).project.floors[0];
  expect(Object.keys(f.rooms)).toHaveLength(2);
  expect(Object.keys(f.walls)).toHaveLength(8);
});

test('a railing ring becomes a balcony', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-name-input').fill('Balcony ring');
  await page.getByTestId('project-submit').click();
  await page.getByTestId('tool-railing').click();
  for (const p of [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 1.5 }, { x: 0, y: 1.5 }, { x: 0, y: 0 }]) await clickWorld(page, p);
  await expect(page.getByTestId('inspector-room')).toBeVisible();
  await expect(page.getByTestId('room-area')).toHaveText('4.50 m²');
  const f = (await state(page)).project.floors[0];
  expect(Object.values(f.walls).filter((w: any) => w.kind === 'railing')).toHaveLength(4);
  expect(Object.values(f.walls).every((w: any) => w.height === 1.05)).toBe(true);
});
