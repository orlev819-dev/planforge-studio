/** Each wall keeps the length it was measured at — the room stops being a perfect rectangle. */
import { test, expect, type Page } from 'playwright/test';

const state = (page: Page) => page.evaluate(() => (window as any).__planforge.getState());
const lengths = async (page: Page) => {
  const s = await state(page);
  const f = s.project.floors[0];
  const r: any = Object.values(f.rooms)[0];
  return r.vertexIds.map((v: string, i: number) => {
    const a = f.vertices[v], b = f.vertices[r.vertexIds[(i + 1) % r.vertexIds.length]];
    return Math.hypot(b.x - a.x, b.y - a.y);
  });
};

test('measured walls hold their own lengths, and release lets them move again', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-name-input').fill('Measured');
  await page.getByTestId('project-submit').click();
  await page.getByTestId('room-dialog-open').click();
  await page.getByTestId('room-create').click();                 // 4.00 x 3.50
  await expect(page.getByTestId('room-area')).toHaveText('14.00 m²');

  // typing a length still squares the room up: wall 3 follows wall 1
  await page.getByTestId('room-wall-0').fill('4.18');
  await page.getByTestId('room-wall-0').press('Enter');
  expect((await lengths(page))[2]).toBeCloseTo(4.18, 3);

  // hold wall 1 at what was measured there, then measure the opposite wall
  await page.getByTestId('room-wall-0-lock').click();
  await expect(page.getByTestId('room-wall-0')).toHaveClass(/locked/);
  await page.getByTestId('room-wall-2').fill('4.05');
  await page.getByTestId('room-wall-2').press('Enter');
  let L = await lengths(page);
  expect(L[0]).toBeCloseTo(4.18, 3);   // held
  expect(L[2]).toBeCloseTo(4.05, 3);   // measured
  await expect(page.getByTestId('room-wall-0')).toHaveValue('4.18');

  // a held wall refuses to be edited, and says why
  await page.getByTestId('room-wall-0').fill('3.9');
  await page.getByTestId('room-wall-0').press('Enter');
  await expect(page.getByTestId('toast')).toContainText('locked');
  await expect(page.getByTestId('room-wall-0')).toHaveValue('4.18');

  // the next measurement grows into the free corner: the one held by wall 1 stays put
  const cornerOf = async (i: number) => {
    const f = (await state(page)).project.floors[0];
    const r: any = Object.values(f.rooms)[0];
    return f.vertices[r.vertexIds[i]];
  };
  const held = await cornerOf(0);
  await page.getByTestId('room-wall-3').fill('3.9');
  await page.getByTestId('room-wall-3').press('Enter');
  const after = await cornerOf(0);
  expect(after.x).toBeCloseTo(held.x, 6);
  expect(after.y).toBeCloseTo(held.y, 6);
  expect((await lengths(page))[0]).toBeCloseTo(4.18, 3);

  // every wall can hold its own measurement
  await page.getByTestId('room-wall-2-lock').click();
  await page.getByTestId('room-wall-1').fill('3.46');
  await page.getByTestId('room-wall-1').press('Enter');
  await page.getByTestId('room-wall-1-lock').click();
  await page.getByTestId('room-wall-3').fill('3.52');
  await page.getByTestId('room-wall-3').press('Enter');
  L = await lengths(page);
  expect(L[0]).toBeCloseTo(4.18, 2);
  expect(L[1]).toBeCloseTo(3.46, 2);
  expect(L[2]).toBeCloseTo(4.05, 2);
  expect(L[3]).toBeCloseTo(3.52, 2);

  // it survives a reload, and releasing a wall makes it editable again
  await expect(page.getByTestId('save-state')).toHaveText('Saved');
  await page.reload();
  await expect(page.getByTestId('editor')).toBeVisible();
  expect((await lengths(page))[0]).toBeCloseTo(4.18, 2);
  const s = await state(page);
  expect(Object.values(s.project.floors[0].walls).filter((w: any) => w.locked)).toHaveLength(3);
});
