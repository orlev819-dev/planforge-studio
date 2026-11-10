import { test, expect, type Page } from 'playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';

function boxSTL(w: number, d: number, h: number) {
  const P = (x: number, y: number, z: number) => [x * w, y * d, z * h];
  const q = (a: number[], b: number[], c: number[], e: number[]) => [...a, ...b, ...c, ...a, ...c, ...e];
  const t = [
    ...q(P(0, 0, 0), P(1, 0, 0), P(1, 1, 0), P(0, 1, 0)), ...q(P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1)),
    ...q(P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1)), ...q(P(0, 1, 0), P(1, 1, 0), P(1, 1, 1), P(0, 1, 1)),
    ...q(P(0, 0, 0), P(0, 1, 0), P(0, 1, 1), P(0, 0, 1)), ...q(P(1, 0, 0), P(1, 1, 0), P(1, 1, 1), P(1, 0, 1)),
  ];
  const n = t.length / 9, buf = Buffer.alloc(84 + n * 50);
  buf.writeUInt32LE(n, 80);
  for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) buf.writeFloatLE(t[i * 9 + k], 84 + i * 50 + 12 + k * 4);
  return buf;
}
async function toScreen(page: Page, p: { x: number; y: number }) {
  const c = page.getByTestId('plan-canvas'); const box = (await c.boundingBox())!; const v = JSON.parse((await c.getAttribute('data-view'))!);
  return { x: box.x + p.x * v.scale + v.ox, y: box.y + p.y * v.scale + v.oy };
}

test('import an STL model, place it, see it in 3D, persists after reload', async ({ page }) => {
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/cabinet.stl', boxSTL(600, 400, 750)); // millimetres, Z-up
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-name-input').fill('Models');
  await page.getByTestId('project-submit').click();
  await page.getByTestId('room-dialog-open').click();
  await page.getByTestId('room-create').click();
  await page.getByTestId('tab-library').click();
  await page.getByTestId('model-import-open').click();
  await page.getByTestId('model-file').setInputFiles('test-results/cabinet.stl');
  await expect(page.getByTestId('model-unit')).toHaveValue('mm');
  await expect(page.getByTestId('model-dims')).toContainText('0.600 m × 0.400 m × 0.750 m');
  await page.getByTestId('model-add').click();
  const p = await toScreen(page, { x: 2, y: 1.5 });
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('inspector-furniture')).toBeVisible();
  await expect(page.getByTestId('furniture-width')).toHaveValue('0.6');
  let s = await page.evaluate(() => (window as any).__planforge.getState());
  const fu = Object.values(s.project.floors[0].furniture)[0] as any;
  expect(fu.meta.modelId).toBeTruthy();
  expect(s.project.assets[fu.meta.modelId].triangles).toBe(12);

  await page.getByTestId('view-3d').click(); await page.waitForTimeout(400);
  expect(Number((await page.getByTestId('viewer-stats').textContent())!.split(' ')[0])).toBe(6); // 1 floor + 4 walls + model
  await expect(page.getByTestId('save-state')).toHaveText('Saved');
  await page.reload();
  await expect(page.getByTestId('editor')).toBeVisible();
  s = await page.evaluate(() => (window as any).__planforge.getState());
  expect(Object.keys(s.project.assets)).toHaveLength(1);
});
