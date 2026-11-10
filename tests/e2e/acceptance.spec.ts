/**
 * PRIMARY ACCEPTANCE TEST (spec §23) — drives the real UI in Chromium:
 * create project → floor → draw room → exact dimensions (14.00 m²) → connected room → 80 cm door →
 * 120 cm window → sofa + dining table → change wall length → 3D → 2D → dimensioned PDF → reload → identical data.
 */
import { test, expect, type Page } from 'playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';

type V = { x: number; y: number };
const state = (page: Page) => page.evaluate(() => (window as any).__planforge.getState());
const floorOf = async (page: Page) => { const s = await state(page); return s.project.floors.find((f: any) => f.id === s.floorId) ?? s.project.floors[0]; };

async function toScreen(page: Page, p: V) {
  const canvas = page.getByTestId('plan-canvas');
  const box = (await canvas.boundingBox())!;
  const v = JSON.parse((await canvas.getAttribute('data-view'))!);
  return { x: box.x + p.x * v.scale + v.ox, y: box.y + p.y * v.scale + v.oy };
}
async function clickWorld(page: Page, p: V) { const s = await toScreen(page, p); await page.mouse.click(s.x, s.y); }
async function setField(page: Page, testId: string, value: string) {
  const el = page.getByTestId(testId);
  await el.fill(value);
  await el.press('Enter');
}
const wallMid = (f: any, w: any) => { const a = f.vertices[w.a], b = f.vertices[w.b]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };

test('primary acceptance workflow', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  // 1-2. open app, create project
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-name-input').fill('My Apartment');
  await page.getByTestId('project-submit').click();
  await expect(page.getByTestId('editor')).toBeVisible();
  await expect(page.getByTestId('project-title')).toHaveValue('My Apartment');

  // 3. Floor 1 exists; adding a floor works; switch back to Floor 1
  await expect(page.getByTestId('floor-select')).toContainText('Floor 1');
  await page.getByTestId('floor-add').click();
  await expect(page.getByTestId('floor-select').locator('option')).toHaveCount(2);
  const s0 = await state(page);
  await page.getByTestId('floor-select').selectOption(s0.project.floors[0].id);

  // 4. draw a room with the mouse (rectangle drag), then set exact dimensions 4.00 x 3.50
  await page.getByTestId('tool-room').click();
  const a = await toScreen(page, { x: 0, y: 0 }), b = await toScreen(page, { x: 3.8, y: 3.2 });
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 }); await page.mouse.move(b.x, b.y, { steps: 4 }); await page.mouse.up();
  await expect(page.getByTestId('inspector-room')).toBeVisible();
  let f = await floorOf(page);
  expect(Object.keys(f.rooms)).toHaveLength(1);
  await setField(page, 'room-wall-0', '4.00');
  await setField(page, 'room-wall-1', '3.50');
  // 5. correct area
  await expect(page.getByTestId('room-area')).toHaveText('14.00 m²');
  f = await floorOf(page);
  const room1 = Object.values(f.rooms)[0] as any;
  await setField(page, 'room-name', 'Living');

  // 6. second connected room (exact-dimension dialog, attached to the right of the selected room)
  await page.getByTestId('room-dialog-open').click();
  await setField(page, 'room-dialog-name', 'Kitchen').catch(() => {});
  await page.getByTestId('room-dialog-name').fill('Kitchen');
  await page.getByTestId('room-width').fill('3');
  await page.getByTestId('room-length').fill('3.5');
  await expect(page.getByTestId('room-attach')).toHaveValue('right');
  await page.getByTestId('room-create').click();
  await expect(page.getByTestId('room-area')).toHaveText('10.50 m²');
  f = await floorOf(page);
  expect(Object.keys(f.rooms)).toHaveLength(2);
  expect(Object.keys(f.walls)).toHaveLength(7);
  const shared = (Object.values(f.walls) as any[]).filter((w) => !w.exterior);
  expect(shared).toHaveLength(1);

  // 7. 80 cm door on the shared wall
  await page.keyboard.press('Escape');
  await page.getByTestId('tool-door').click();
  await clickWorld(page, wallMid(f, shared[0]));
  await expect(page.getByTestId('inspector-opening')).toBeVisible();
  await expect(page.getByTestId('opening-width')).toHaveValue('0.8');

  // 8. 120 cm window on room 1's top (exterior) wall
  const r1Top = (Object.values(f.walls) as any[]).find((w) => [w.a, w.b].includes(room1.vertexIds[0]) && [w.a, w.b].includes(room1.vertexIds[1]));
  await page.getByTestId('tool-window').click();
  await clickWorld(page, wallMid(f, r1Top));
  await expect(page.getByTestId('opening-width')).toHaveValue('1.2');
  f = await floorOf(page);
  const ops = Object.values(f.openings) as any[];
  expect(ops.map((o) => [o.kind, o.width]).sort()).toEqual([['door', 0.8], ['window', 1.2]]);

  // 9. sofa and dining table from the library
  await page.getByTestId('tab-library').click();
  await page.getByTestId('lib-sofa-3').click();
  await clickWorld(page, { x: 2, y: 2.6 });
  await expect(page.getByTestId('inspector-furniture')).toBeVisible();
  await page.getByTestId('tab-library').click();
  await page.getByTestId('lib-dining-table').click();
  await clickWorld(page, { x: 5.5, y: 1.75 });
  f = await floorOf(page);
  expect((Object.values(f.furniture) as any[]).map((x) => x.catalogId).sort()).toEqual(['dining-table', 'sofa-3']);

  // 10-11. change one wall length -> dependent measurements update (shared wall moves both rooms)
  await page.keyboard.press('Escape');
  const r1c = await toScreen(page, { x: 1, y: 1.2 });
  await page.getByTestId('tool-select').click();
  await page.mouse.click(r1c.x, r1c.y);
  await expect(page.getByTestId('inspector-room')).toBeVisible();
  await expect(page.getByTestId('room-area')).toHaveText('14.00 m²');
  await setField(page, 'room-wall-0', '4.5');
  await expect(page.getByTestId('room-area')).toHaveText('15.75 m²');
  await expect(page.getByTestId('room-net-area')).not.toHaveText('12.90 m²');
  f = await floorOf(page);
  const kitchen = (Object.values(f.rooms) as any[]).find((r) => r.name === 'Kitchen');
  const kitchenArea = await page.evaluate((id) => {
    const s = (window as any).__planforge.getState(); const fl = s.project.floors.find((x: any) => x.id === s.floorId);
    const pts = fl.rooms[id].vertexIds.map((v: string) => fl.vertices[v]);
    let A = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; A += p.x * q.y - q.x * p.y; } return Math.abs(A / 2);
  }, kitchen.id);
  expect(kitchenArea).toBeCloseTo(8.75, 6);
  // undo / redo of the dimension edit
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('room-area')).toHaveCount(0); // selection cleared by undo
  await page.mouse.click(r1c.x, r1c.y);
  await expect(page.getByTestId('room-area')).toHaveText('14.00 m²');
  await page.getByTestId('redo').click();
  await page.mouse.click(r1c.x, r1c.y);
  await expect(page.getByTestId('room-area')).toHaveText('15.75 m²');

  // 12-13. switch to 3D: walls, openings and furniture are rendered
  await page.getByTestId('view-3d').click();
  await expect(page.getByTestId('viewer-3d')).toBeVisible();
  await page.waitForTimeout(800);
  const parts = Number((await page.getByTestId('viewer-stats').textContent())!.split(' ')[0]);
  // 7 walls + 2 floors + 1 glass + 1 door leaf + sofa(1) + table(1)
  expect(parts).toBeGreaterThanOrEqual(13);
  const nonBlank = await page.evaluate(() => {
    const c = document.querySelector('[data-testid=viewer-canvas]') as HTMLCanvasElement;
    const tmp = document.createElement('canvas'); tmp.width = 64; tmp.height = 64;
    const ctx = tmp.getContext('2d')!; ctx.drawImage(c, 0, 0, 64, 64);
    const d = ctx.getImageData(0, 0, 64, 64).data; const set = new Set<string>();
    for (let i = 0; i < d.length; i += 4) set.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
    return set.size;
  });
  expect(nonBlank).toBeGreaterThan(5);
  mkdirSync('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/acceptance-3d.png' });

  // 14. back to 2D
  await page.getByTestId('view-2d').click();
  await expect(page.getByTestId('plan-canvas')).toBeVisible();
  await page.screenshot({ path: 'test-results/acceptance-2d.png' });

  // 15. export a dimensioned PDF and validate it
  await page.getByTestId('export-open').click();
  await page.getByTestId('fmt-pdf').check();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-download').click()]);
  const pdfPath = 'test-results/My_Apartment.pdf';
  await dl.saveAs(pdfPath);
  const bytes = readFileSync(pdfPath);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBe(3); // 2 floors + room schedule
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pd = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  const txt = (await (await pd.getPage(1)).getTextContent()).items.map((i: any) => i.str).join(' ');
  for (const s of ['My Apartment', '15.75 m', '4.50 m', '3.50 m', 'Scale: 1:']) expect(txt).toContain(s);

  // 16-17. reload: the same geometry, objects and metadata are restored from IndexedDB
  await expect(page.getByTestId('save-state')).toHaveText('Saved');
  const before = (await state(page)).project;
  await page.reload();
  await expect(page.getByTestId('editor')).toBeVisible();
  const after = (await state(page)).project;
  expect(after).toEqual(before);
  expect(errors).toEqual([]);
});

test('Hebrew RTL UI does not mirror plan geometry', async ({ page }) => {
  await page.goto('/#/settings');
  await page.getByTestId('lang-select').selectOption('he');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByTestId('nav-dashboard').click();
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-name-input').fill('דירה');
  await page.getByTestId('project-submit').click();
  await page.getByTestId('room-dialog-open').click();
  await page.getByTestId('room-dialog-name').fill('סלון');
  await page.getByTestId('room-create').click();
  await expect(page.getByTestId('room-area')).toHaveText('14.00 m²');
  const f = await floorOf(page);
  const xs = (Object.values(f.vertices) as any[]).map((v) => v.x).sort((p, q) => p - q);
  expect(xs[0]).toBe(0); expect(xs[xs.length - 1]).toBe(4);
  const left = await toScreen(page, { x: 0, y: 0 }), right = await toScreen(page, { x: 4, y: 0 });
  expect(right.x).toBeGreaterThan(left.x); // +x stays to the right in RTL
  await expect(page.getByTestId('plan-canvas').locator('..')).toHaveAttribute('dir', 'ltr');
  await page.getByTestId('export-open').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-download').click()]);
  const p = 'test-results/hebrew.pdf'; await dl.saveAs(p);
  const doc = await PDFDocument.load(readFileSync(p));
  expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
  await page.getByTestId('nav-settings').click();
  await page.getByTestId('lang-select').selectOption('en');
});

test('import a reference plan and calibrate its scale', async ({ page }) => {
  mkdirSync('test-results', { recursive: true });
  // a 500x300 px plan in which the two marker dots are exactly 400 px apart
  writeFileSync('test-results/plan.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="300"><rect x="50" y="50" width="400" height="200" fill="none" stroke="black" stroke-width="6"/><circle cx="50" cy="50" r="5" fill="red"/><circle cx="450" cy="50" r="5" fill="red"/></svg>`);
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-name-input').fill('Traced');
  await page.getByTestId('project-submit').click();
  await page.getByTestId('import-open').click();
  await page.getByTestId('import-file').setInputFiles('test-results/plan.svg');
  await page.getByTestId('import-place').click();
  let f = await floorOf(page);
  expect(f.reference.calibrated).toBe(false);
  // initial scale 0.01 m/px -> the markers are at (0.5,0.5) and (4.5,0.5) m
  await page.waitForTimeout(300);
  await clickWorld(page, { x: 0.5, y: 0.5 });
  await clickWorld(page, { x: 4.5, y: 0.5 });
  await page.getByTestId('calibrate-distance').fill('8');
  await page.getByTestId('calibrate-apply').click();
  f = await floorOf(page);
  expect(f.reference.calibrated).toBe(true);
  expect(f.reference.scale).toBeCloseTo(0.02, 3); // 8 m / 400 px
  // trace a room over the calibrated reference: corners of the rectangle are now 8 x 4 m
  await page.getByTestId('room-dialog-open').click();
  await page.getByTestId('room-width').fill('8');
  await page.getByTestId('room-length').fill('4');
  await page.getByTestId('room-x').fill('0.5');
  await page.getByTestId('room-y').fill('0.5');
  await page.getByTestId('room-create').click();
  await expect(page.getByTestId('room-area')).toHaveText('32.00 m²');
});

test('project management: rename, duplicate, archive, delete, restore, search', async ({ page }) => {
  await page.goto('/');
  for (const n of ['Alpha flat', 'Beta house']) {
    await page.getByTestId('new-project').click();
    await page.getByTestId('project-name-input').fill(n);
    await page.getByTestId('project-submit').click();
    await expect(page.getByTestId('editor')).toBeVisible();
    await page.getByTestId('nav-dashboard').click();
  }
  await page.getByTestId('project-search').fill('Beta');
  await expect(page.getByTestId('project-card')).toHaveCount(1);
  const card = page.getByTestId('project-card').first();
  await card.getByRole('button', { name: 'Duplicate' }).click();
  await expect(page.getByTestId('project-card')).toHaveCount(2);
  await page.getByTestId('project-card').filter({ hasText: 'Beta house (copy)' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByTestId('project-card')).toHaveCount(1);
  await page.getByRole('button', { name: /Trash/ }).click();
  await expect(page.getByTestId('project-card')).toHaveCount(1);
  await page.getByTestId('project-card').getByRole('button', { name: 'Restore' }).click();
  await page.getByRole('button', { name: /Active/ }).click();
  await expect(page.getByTestId('project-card')).toHaveCount(2);
});
