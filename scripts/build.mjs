// Production build for apps/web using esbuild (Vite is the intended dev server; see README).
import { build } from 'esbuild';
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'apps/web/dist');
const require = createRequire(import.meta.url);
const watch = process.argv.includes('--watch');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'assets'), { recursive: true });

await build({
  entryPoints: { main: join(root, 'apps/web/src/main.tsx') },
  bundle: true, format: 'esm', splitting: true, outdir: join(out, 'assets'),
  minify: !watch, sourcemap: true, target: ['es2022', 'chrome100', 'safari16', 'firefox110'],
  jsx: 'automatic', loader: { '.css': 'css' }, logLevel: 'info',
  define: { 'process.env.NODE_ENV': '"production"' },
  nodePaths: [join(root, 'node_modules'), '/opt/npm-tools/node_modules'],
});

cpSync(join(root, 'apps/web/public'), out, { recursive: true });
cpSync(join(root, 'apps/web/index.html'), join(out, 'index.html'));
const worker = require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs', { paths: [root, '/opt/npm-tools/node_modules'] });
cpSync(worker, join(out, 'pdf.worker.min.mjs'));

// service worker with a precache list of every built file (offline PWA)
const files = [];
const walk = (d, rel = '') => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p, rel + f + '/'); else if (!f.endsWith('.map') && f !== 'sw.js') files.push(rel + f); } };
walk(out);
const hash = createHash('sha1').update(files.join('|') + Date.now()).digest('hex').slice(0, 10);
writeFileSync(join(out, 'sw.js'), `const CACHE='planforge-${hash}';const FILES=${JSON.stringify(['./', ...files.map((f) => './' + f)])};
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request).catch(()=>caches.match('./'))))});
`);
console.log(`built ${files.length} files -> ${out}`);
if (!existsSync(join(out, 'assets/main.js'))) process.exit(1);
