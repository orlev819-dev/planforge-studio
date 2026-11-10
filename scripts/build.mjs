// Production build for apps/web using esbuild (Vite is the intended dev server; see README).
import { build } from 'esbuild';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'apps/web/dist');
const require = createRequire(import.meta.url);
const watch = process.argv.includes('--watch');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'assets'), { recursive: true });

let buildId = String(Date.now().toString(36));
try { buildId = `${execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim()}.${new Date().toISOString().slice(5, 16).replace(/[-:T]/g, '')}`; } catch { /* not a git checkout */ }

const result = await build({
  entryPoints: { main: join(root, 'apps/web/src/main.tsx') },
  bundle: true, format: 'esm', splitting: true, outdir: join(out, 'assets'), metafile: true,
  // content hashes in every filename: a new build can never be served from a stale cache entry
  entryNames: '[name]-[hash]', chunkNames: '[name]-[hash]', assetNames: '[name]-[hash]',
  minify: !watch, sourcemap: true, target: ['es2022', 'chrome100', 'safari16', 'firefox110'],
  jsx: 'automatic', loader: { '.css': 'css' }, logLevel: 'info',
  define: { 'process.env.NODE_ENV': '"production"', __BUILD_ID__: JSON.stringify(buildId) },
  nodePaths: [join(root, 'node_modules'), '/opt/npm-tools/node_modules'],
  plugins: [{ name: 'pdf-worker', setup(b) {
    b.onResolve({ filter: /^virtual:pdf-worker$/ }, () => ({ path: 'pdf-worker', namespace: 'v' }));
    b.onLoad({ filter: /.*/, namespace: 'v' }, () => ({ contents: "export const pdfWorkerUrl = () => new URL('./pdf.worker.min.mjs', location.href).toString();", loader: 'js' }));
  } }],
});

cpSync(join(root, 'apps/web/public'), out, { recursive: true });

// index.html is a template: point it at the hashed bundle of this build
const outputs = Object.keys(result.metafile.outputs).map((f) => f.replace(/.*apps\/web\/dist\//, './'));
const entryJs = outputs.find((f) => /assets\/main-[^/]+\.js$/.test(f));
const entryCss = outputs.find((f) => /assets\/main-[^/]+\.css$/.test(f));
if (!entryJs || !entryCss) { console.error('entry bundle not found in metafile'); process.exit(1); }
const html = readFileSync(join(root, 'apps/web/index.html'), 'utf8')
  .replace('./assets/main.css', entryCss)
  .replace('./assets/main.js', entryJs)
  .replace('</head>', `  <meta name="planforge-build" content="${buildId}" />\n</head>`);
writeFileSync(join(out, 'index.html'), html);
const worker = require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs', { paths: [root, '/opt/npm-tools/node_modules'] });
cpSync(worker, join(out, 'pdf.worker.min.mjs'));

// service worker with a precache list of every built file (offline PWA)
const files = [];
const walk = (d, rel = '') => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p, rel + f + '/'); else if (!f.endsWith('.map') && f !== 'sw.js') files.push(rel + f); } };
walk(out);
const hash = createHash('sha1').update(files.join('|') + Date.now()).digest('hex').slice(0, 10);
writeFileSync(join(out, 'sw.js'), `const CACHE='planforge-${buildId}-${hash}';
const FILES=${JSON.stringify(['./', ...files.map((f) => './' + f)])};
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  // the page itself is always fetched fresh when online, so a new build is picked up immediately
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(k=>k.put('./index.html',c));return r;}).catch(()=>caches.match('./index.html',{ignoreSearch:true}).then(r=>r||caches.match('./'))));
    return;
  }
  // every other file carries a content hash in its name, so the cache can never be stale
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request).then(res=>{const c=res.clone();if(res.ok)caches.open(CACHE).then(k=>k.put(e.request,c));return res;})));
});
`);
console.log(`built ${files.length} files -> ${out}`);
if (!existsSync(join(out, 'assets/main.js'))) process.exit(1);
