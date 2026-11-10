// Single-file build: everything (JS, CSS, pdf.js worker, icon) inlined into one HTML that opens by double-click (file://).
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs', { paths: [root, '/opt/npm-tools/node_modules'] });
const r = await build({
  entryPoints: [join(root, 'apps/web/src/main.tsx')], bundle: true, format: 'esm', write: false, outdir: 'out', minify: true,
  target: ['es2022'], jsx: 'automatic', loader: { '.css': 'css' }, define: { 'process.env.NODE_ENV': '"production"' },
  nodePaths: [join(root, 'node_modules'), '/opt/npm-tools/node_modules'], logLevel: 'warning',
  plugins: [{ name: 'pdf-worker', setup(b) {
    b.onResolve({ filter: /^virtual:pdf-worker$/ }, () => ({ path: 'pdf-worker', namespace: 'v' }));
    b.onLoad({ filter: /.*/, namespace: 'v' }, () => ({ contents: `const src = ${JSON.stringify(readFileSync(workerPath, 'utf8'))}; let u; export const pdfWorkerUrl = () => (u ??= URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));`, loader: 'js' }));
  } }],
});
const js = r.outputFiles.find((f) => f.path.endsWith('.js')).text.replace(/<\/script/gi, '<\\/script');
const css = r.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? '';
const icon = 'data:image/svg+xml;base64,' + Buffer.from(readFileSync(join(root, 'apps/web/public/icon.svg'))).toString('base64');
const touch = 'data:image/png;base64,' + Buffer.from(readFileSync(join(root, 'apps/web/public/icon-180.png'))).toString('base64');
const html = `<!doctype html><html lang="en" dir="ltr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="PlanForge"><title>PlanForge Studio</title><link rel="icon" href="${icon}"><link rel="apple-touch-icon" href="${touch}"><style>${css}</style></head><body><div id="root"></div><script type="module">${js}</script></body></html>`;
mkdirSync(join(root, 'standalone'), { recursive: true });
writeFileSync(join(root, 'standalone/PlanForge Studio.html'), html);
console.log('standalone', (html.length / 1e6).toFixed(2), 'MB');
