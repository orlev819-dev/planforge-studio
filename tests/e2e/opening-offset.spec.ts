/** Positioning a door or window by the distance measured from the wall to its edge. */
import { test, expect, type Page } from 'playwright/test';

async function toScreen(page: Page, p: { x: number; y: number }) {
  const c = page.getByTestId('plan-canvas'); const box = (await c.boundingBox())!; const v = JSON.parse((await c.getAttribute('data-view'))!);
  return { x: box.x + p.x * v.scale + v.ox, y: box.y + p.y * v.scale + v.oy };
}
const clickWorld = async (page: Page, p: { x: number; y: number }) => { const s = await toScreen(page, p); await page.mouse.click(s.x, s.y); };
const opening = async (page: Page) => {
  const s = await page.evaluate(() => (window as any).__planforge.getState());
  return Object.values(s.project.floors[0].openings)[0] as any;
};

test('place a door by the distance from the corner to its edge', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-name-input').fill('Offsets');
  await page.getByTestId('project-submit').click();
  await page.getByTestId('room-dialog-open').click();
  await page.getByTestId('room-create').click();                  // 4.00 x 3.50, 0.15 walls
  await page.getByTestId('tool-door').click();
  await clickWorld(page, { x: 2, y: 0 });                         // door on the bottom wall
  await page.getByTestId('tool-select').click();
  await clickWorld(page, { x: 2, y: 0 });
  await expect(page.getByTestId('inspector-opening')).toBeVisible();

  // the panel shows the two distances to the door's edges, not to its centre
  await expect(page.getByTestId('opening-width')).toHaveValue('0.8');
  await expect(page.getByTestId('opening-from-start')).toHaveValue('1.6');
  await expect(page.getByTestId('opening-to-end')).toHaveValue('1.6');

  // type the distance measured on site: 0.92 m from the corner to the near jamb
  await page.getByTestId('opening-from-start').fill('0.92');
  await page.getByTestId('opening-from-start').press('Enter');
  await expect(page.getByTestId('opening-to-end')).toHaveValue('2.28');
  expect((await opening(page)).t).toBeCloseTo(0.92 + 0.4, 6);
  await expect(page.getByTestId('opening-width')).toHaveValue('0.8');   // the door kept its width

  // interior mode measures from the inside faces, as a tape in the room does
  await page.getByTestId('opening-measure-interior').click();
  await expect(page.getByTestId('opening-from-start')).toHaveValue('0.845');  // 7.5 cm of side wall
  await expect(page.getByTestId('opening-span')).toContainText('3.85');
  await page.getByTestId('opening-from-start').fill('1.1');
  await page.getByTestId('opening-from-start').press('Enter');
  expect((await opening(page)).t).toBeCloseTo(0.075 + 1.1 + 0.4, 6);

  // measuring both sides sets the width from the measurements
  await page.getByTestId('opening-width-from-both').check();
  await page.getByTestId('opening-to-end').fill('1.5');
  await page.getByTestId('opening-to-end').press('Enter');
  const o = await opening(page);
  expect(o.width).toBeCloseTo(3.85 - 1.1 - 1.5, 3);
  await expect(page.getByTestId('opening-from-start')).toHaveValue('1.1');

  // a distance that pushes it off the wall is refused and the field snaps back
  await page.getByTestId('opening-from-start').fill('9');
  await page.getByTestId('opening-from-start').press('Enter');
  await expect(page.getByTestId('toast')).toContainText('fit');
  await expect(page.getByTestId('opening-from-start')).toHaveValue('1.1');

  // and it survives a reload
  await expect(page.getByTestId('save-state')).toHaveText('Saved');
  await page.reload();
  await expect(page.getByTestId('editor')).toBeVisible();
  expect((await opening(page)).t).toBeCloseTo(o.t, 6);
});
