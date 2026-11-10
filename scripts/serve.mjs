// Minimal static server for the built PWA (no external dependencies).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = join(dirname(fileURLToPath(import.meta.url)), '../apps/web/dist');
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.map': 'application/json', '.png': 'image/png' };
createServer(async (req, res) => {
  try {
    let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    let f = join(dir, p);
    if (!f.startsWith(dir)) { res.writeHead(403).end(); return; }
    if (!p || (await stat(f).catch(() => null))?.isDirectory()) f = join(dir, 'index.html');
    const body = await readFile(f);
    res.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' }).end(body);
  } catch { res.writeHead(404).end('not found'); }
}).listen(port, () => console.log(`PlanForge Studio on http://localhost:${port}`));
