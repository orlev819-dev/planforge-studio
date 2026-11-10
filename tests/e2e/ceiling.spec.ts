import { test, expect, type Page } from 'playwright/test';

async function toScreen(page: Page, p: { x: number; y: number }) {
  const c = page.getByTestId('plan-canvas'); const box = (await c.boundingBox())!; const v = JSON.parse((await c.getAttribute('data-view'))!);
  return { x: box.x + p.x * v.scale + v.ox, y: box.y + p.y * v.scale + v.oy };
}

test('draw a lowered ceiling, edit its height, room volume and 3D update', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-name-input').fill('Ceilings');
  await page.getByTestId('project-submit').click();
  await page.getByTestId('room-dialog-open').click();
  await page.getByTestId('room-ceiling').fill('2.75');
  await page.getByTestId('room-create').click();
  await expect(page.getByTestId('room-area')).toHaveText('14.00 m²');
  await page.waitForTimeout(200);
  await page.getByTestId('view-3d').click(); await page.waitForTimeout(300);
  const partsBefore = Number((await page.getByTestId('viewer-stats').textContent())!.split(' ')[0]);
  await page.getByTestId('view-2d').click(); await page.waitForTimeout(300);

  await page.getByTestId('tool-ceiling').click();
  const a = await toScreen(page, { x: 1, y: 1 }), b = await toScreen(page, { x: 3, y: 2 });
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up();
  await expect(page.getByTestId('inspector-ceiling')).toBeVisible();
  await expect(page.getByTestId('ceiling-height')).toHaveValue('2.45');
  await expect(page.getByTestId('ceiling-width')).toHaveValue('2');
  await page.getByTestId('ceiling-height').fill('2.35');
  await page.getByTestId('ceiling-height').press('Enter');

  const s = await page.evaluate(() => (window as any).__planforge.getState());
  const f = s.project.floors[0];
  const drop = Object.values(f.ceilingDrops)[0] as any;
  expect(drop.height).toBe(2.35);

  // room shows lowered area (2 m²)
  const r = await toScreen(page, { x: 0.5, y: 3 });
  await page.mouse.click(r.x, r.y);
  await expect(page.getByTestId('room-lowered')).toHaveText('2.00 m²');

  // too high is rejected, model unchanged
  const c = await toScreen(page, { x: 2, y: 1.5 });
  await page.mouse.click(c.x, c.y);
  await page.getByTestId('ceiling-height').fill('3');
  await page.getByTestId('ceiling-height').press('Enter');
  await expect(page.getByTestId('toast')).toContainText('between');
  expect(((await page.evaluate(() => (window as any).__planforge.getState())).project.floors[0].ceilingDrops[drop.id]).height).toBe(2.35);

  await page.getByTestId('view-3d').click(); await page.waitForTimeout(300);
  const partsAfter = Number((await page.getByTestId('viewer-stats').textContent())!.split(' ')[0]);
  expect(partsAfter).toBe(partsBefore + 1);
});
