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

test('import a .glb model with its own materials, place it, see it in 3D', async ({ page }) => {
  // a two-material cube, written as a real GLB here
  const glb = (() => {
    const pos = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1.8, 0, 0, 1.8, 0, 0, 0, 0.6, 1, 0, 0.6, 1, 1.8, 0.6, 0, 1.8, 0.6]);
    const idx = new Uint16Array([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 3, 2, 6, 3, 6, 7, 0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2]);
    const pb = new Uint8Array(pos.buffer), ib = new Uint8Array(idx.buffer);
    const bin = new Uint8Array(pb.length + ib.length);
    bin.set(pb, 0); bin.set(ib, pb.length);
    const json = {
      asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }, { attributes: { POSITION: 0 }, indices: 2, material: 1 }] }],
      materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.8, 0.2, 0.2, 1] } }, { pbrMetallicRoughness: { baseColorFactor: [0.1, 0.1, 0.12, 1] } }],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 8, type: 'VEC3' },
        { bufferView: 1, componentType: 5123, count: 18, type: 'SCALAR' },
        { bufferView: 1, byteOffset: 36, componentType: 5123, count: 18, type: 'SCALAR' },
      ],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pb.length }, { buffer: 0, byteOffset: pb.length, byteLength: ib.length }],
      buffers: [{ byteLength: bin.length }],
    };
    const jb = Buffer.from(JSON.stringify(json), 'utf8');
    const pad = (4 - (jb.length % 4)) % 4;
    const total = 12 + 8 + jb.length + pad + 8 + bin.length;
    const out = Buffer.alloc(total);
    out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(total, 8);
    out.writeUInt32LE(jb.length + pad, 12); out.writeUInt32LE(0x4e4f534a, 16);
    jb.copy(out, 20); out.fill(0x20, 20 + jb.length, 20 + jb.length + pad);
    const at = 20 + jb.length + pad;
    out.writeUInt32LE(bin.length, at); out.writeUInt32LE(0x004e4942, at + 4);
    Buffer.from(bin).copy(out, at + 8);
    return out;
  })();
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/armchair.glb', glb);

  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-name-input').fill('GLB');
  await page.getByTestId('project-submit').click();
  await page.getByTestId('tab-library').click();
  await page.getByTestId('model-import-open').click();
  await page.getByTestId('model-file').setInputFiles('test-results/armchair.glb');
  await expect(page.getByTestId('model-info')).toContainText('GLB');
  await expect(page.getByTestId('model-info')).toContainText('2 ');            // two materials
  await expect(page.getByTestId('model-materials')).toBeVisible();
  await page.getByTestId('model-name').fill('Armchair');
  await page.getByTestId('model-add').click();

  const c = page.getByTestId('plan-canvas');
  const box = (await c.boundingBox())!; const v = JSON.parse((await c.getAttribute('data-view'))!);
  await page.mouse.click(box.x + 2 * v.scale + v.ox, box.y + 2 * v.scale + v.oy);
  const s = await page.evaluate(() => (window as any).__planforge.getState());
  const asset = Object.values(s.project.assets)[0] as any;
  expect(asset.format).toBe('glb');
  expect(asset.groups).toHaveLength(2);
  expect(asset.size.y).toBeCloseTo(1.8, 1);                                    // metres, as glTF stores them
  expect(Object.values(s.project.floors[0].furniture)).toHaveLength(1);

  await page.getByTestId('view-3d').click();
  await page.waitForTimeout(400);
  expect(Number(((await page.getByTestId('viewer-stats').textContent()) ?? '0').split(' ')[0])).toBeGreaterThanOrEqual(2);
  await page.getByTestId('view-2d').click();
  await expect(page.getByTestId('save-state')).toHaveText('Saved');
  await page.reload();
  await expect(page.getByTestId('editor')).toBeVisible();
  const back = await page.evaluate(() => (window as any).__planforge.getState());
  expect((Object.values(back.project.assets)[0] as any).groups).toHaveLength(2);
});
