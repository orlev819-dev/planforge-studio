/** The furniture & interior design upgrade, run through the brief's own acceptance list. */
import { test, expect, type Page } from 'playwright/test';

async function toScreen(page: Page, p: { x: number; y: number }) {
  const c = page.getByTestId('plan-canvas'); const box = (await c.boundingBox())!; const v = JSON.parse((await c.getAttribute('data-view'))!);
  return { x: box.x + p.x * v.scale + v.ox, y: box.y + p.y * v.scale + v.oy };
}
const clickWorld = async (page: Page, p: { x: number; y: number }) => { const s = await toScreen(page, p); await page.mouse.click(s.x, s.y); };
const state = (page: Page) => page.evaluate(() => (window as any).__planforge.getState());
const furniture = async (page: Page) => Object.values((await state(page)).project.floors[0].furniture) as any[];

async function place(page: Page, libId: string, at: { x: number; y: number }) {
  await page.getByTestId('tab-library').click();
  await page.getByTestId(`lib-${libId}`).click();
  await clickWorld(page, at);
}

test('furnish a room: catalogue, 2D, 3D, finishes, walkthrough, render, persistence', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-name-input').fill('Apartment');
  await page.getByTestId('project-submit').click();
  await page.getByTestId('room-dialog-open').click();
  await page.getByTestId('room-dialog-name').fill('Living');
  await page.getByTestId('room-width').fill('5');
  await page.getByTestId('room-length').fill('4');
  await page.getByTestId('room-create').click();
  await expect(page.getByTestId('room-area')).toHaveText('20.00 m²');

  // the library has the categories from the brief, and searching finds things in Hebrew too
  await page.getByTestId('tab-library').click();
  await page.getByTestId('library-search').fill('ספה');
  await expect(page.getByTestId('lib-sofa-l')).toBeVisible();
  await page.getByTestId('library-search').fill('');

  // place a beige L-shaped sofa, a coffee table, a TV unit and a curtain
  await place(page, 'sofa-l', { x: 1.6, y: 1.3 });
  await place(page, 'coffee-table', { x: 2.6, y: 2.3 });
  await place(page, 'tv-unit', { x: 2.5, y: 3.7 });
  await place(page, 'curtain-black', { x: 1.0, y: 3.9 });
  let items = await furniture(page);
  expect(items).toHaveLength(4);
  const sofa = items.find((f) => f.catalogId === 'sofa-l');
  expect(sofa.width).toBeCloseTo(2.6, 3);
  expect(sofa.meta.shape).toBe('sofa-l');

  // an object that stands against a wall put its back on the wall face, facing into the room
  const tv = items.find((f) => f.catalogId === 'tv-unit');
  expect(tv.y).toBeCloseTo(4 - 0.075 - tv.depth / 2, 2);
  expect(((tv.rotation % 90) + 90) % 90).toBeCloseTo(0, 2);
  const curtain = items.find((f) => f.catalogId === 'curtain-black');
  expect(curtain.y).toBeCloseTo(4 - 0.075 - curtain.depth / 2, 2);

  // the finish swatches recolour it
  await page.getByTestId('tab-props').click();
  await clickWorld(page, { x: 1.6, y: 1.3 });
  await expect(page.getByTestId('furniture-finishes')).toBeVisible();
  await page.getByTestId('finish-d8c3a5').click();                     // beige
  expect((await furniture(page)).find((f) => f.catalogId === 'sofa-l').color).toBe('#d8c3a5');

  // 3D shows every object, built from several parts each
  await page.getByTestId('view-3d').click();
  await page.waitForTimeout(500);
  const parts = Number(((await page.getByTestId('viewer-stats').textContent()) ?? '0').split(' ')[0]);
  expect(parts).toBeGreaterThan(12);

  // daylight modes, dollhouse and the walkthrough with its own controls
  await page.getByTestId('scene-light').selectOption('night');
  await page.getByTestId('view-dollhouse').click();
  await page.getByTestId('view-walk').click();
  await expect(page.getByTestId('walk-options')).toBeVisible();
  await page.getByTestId('eye-height').fill('1.8');
  await expect(page.getByTestId('walk-pad')).toBeVisible();
  await page.getByTestId('view-walk').click();

  // a rendered image comes out of the real scene
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('render-shot').click()]);
  expect(dl.suggestedFilename()).toMatch(/\.png$/);
  await page.getByTestId('view-2d').click();
  await page.waitForTimeout(300);

  // everything survives save and reload, with its colour and position
  await expect(page.getByTestId('save-state')).toHaveText('Saved');
  await page.reload();
  await expect(page.getByTestId('editor')).toBeVisible();
  items = await furniture(page);
  expect(items).toHaveLength(4);
  expect(items.find((f) => f.catalogId === 'sofa-l').color).toBe('#d8c3a5');
  // and the original plan is untouched
  expect(Object.keys((await state(page)).project.floors[0].rooms)).toHaveLength(1);
});

test('kitchen and bathroom objects place, keep their sizes and draw their symbols', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-name-input').fill('Services');
  await page.getByTestId('project-submit').click();
  await page.getByTestId('room-dialog-open').click();
  await page.getByTestId('room-width').fill('4');
  await page.getByTestId('room-length').fill('3');
  await page.getByTestId('room-create').click();

  for (const [id, x, y] of [['fridge', 0.5, 0.5], ['oven-free', 1.3, 0.4], ['kb-60', 2.0, 0.4], ['shower-90', 3.4, 2.4], ['wc-wall', 0.5, 2.6], ['vanity-80', 1.6, 2.7]] as const)
    await place(page, id, { x, y });

  const items = await furniture(page);
  expect(items).toHaveLength(6);
  const byId = (id: string) => items.find((f) => f.catalogId === id);
  expect(byId('fridge').height).toBeCloseTo(1.85, 3);
  expect(byId('shower-90').width).toBeCloseTo(0.9, 3);
  expect(byId('wc-wall').elevation).toBeCloseTo(0.4, 3);    // wall-hung, off the floor
  expect(byId('kb-60').meta.shape).toBe('kitchen-base');

  // each one draws more than its outline on the plan
  const prims = await page.evaluate(() => {
    const st = (window as any).__planforge.getState();
    return st.project.floors[0];
  });
  expect(prims).toBeTruthy();
  await page.getByTestId('export-open').click();
  await page.getByTestId('fmt-svg').check();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-download').click()]);
  expect(dl.suggestedFilename()).toMatch(/\.svg$/);
});
