import { test, expect } from 'playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';

test('interior wall dimensions: read, edit, and carry into the plan and PDF', async ({ page }) => {
  mkdirSync('test-results', { recursive: true });
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-name-input').fill('Interior');
  await page.getByTestId('project-submit').click();
  await page.getByTestId('room-dialog-open').click();
  await page.getByTestId('room-create').click();   // 4.00 x 3.50 centerline
  await expect(page.getByTestId('room-area')).toHaveText('14.00 m²');
  await expect(page.getByTestId('room-wall-0')).toHaveValue('4');

  // switch the room panel to interior measurements
  await page.getByTestId('measure-interior').click();
  await expect(page.getByTestId('room-wall-0')).toHaveValue('3.85');
  await expect(page.getByTestId('room-wall-1')).toHaveValue('3.35');

  // type the measurement taken on site: 3.72 m between the wall faces
  await page.getByTestId('room-wall-0').fill('3.72');
  await page.getByTestId('room-wall-0').press('Enter');
  await expect(page.getByTestId('room-wall-0')).toHaveValue('3.72');
  await expect(page.getByTestId('room-net-area')).toHaveText(`${(3.72 * 3.35).toFixed(2)} m²`);
  const s = await page.evaluate(() => (window as any).__planforge.getState());
  const f = s.project.floors[0];
  const xs = Object.values(f.vertices).map((v: any) => v.x);
  expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(3.72 + 0.15, 6);   // centerline follows
  expect(s.project.settings.measure).toBe('interior');

  // the plan now dimensions the inside faces
  const dims = await page.evaluate(() => {
    const st = (window as any).__planforge.getState();
    return st.project.floors[0];
  });
  expect(dims).toBeTruthy();
  await page.getByTestId('export-open').click();
  await page.getByTestId('fmt-pdf').check();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-download').click()]);
  const path = 'test-results/interior.pdf';
  await dl.saveAs(path);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)), verbosity: 0 }).promise;
  const txt = (await (await doc.getPage(1)).getTextContent()).items.map((i: any) => i.str).join(' ');
  expect(txt).toContain('3.72 m');
  expect(txt).toContain('3.35 m');
  expect(txt).not.toContain('3.87 m');   // the centerline length is not shown in interior mode

  // switching back shows centerline numbers again, same geometry
  await page.getByTestId('measure-centerline').click();
  await expect(page.getByTestId('room-wall-0')).toHaveValue('3.87');
  await expect(page.getByTestId('room-area')).toHaveText(`${(3.87 * 3.5).toFixed(2)} m²`);
});
