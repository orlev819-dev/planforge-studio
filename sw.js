const CACHE='planforge-2105675.11111903-b7028fc3c3';
const FILES=["./","./assets/chunk-XUZ42QKC.js","./assets/main-4TAEOJSG.js","./assets/main-E23QCZSB.css","./assets/pdf-VQL5POWR.js","./icon-180.png","./icon-192.png","./icon-512.png","./icon.svg","./index.html","./manifest.webmanifest","./pdf.worker.min.mjs"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  if(new URL(e.request.url).pathname.endsWith('/update.html'))return;   // always from the network
  // the page itself is always fetched fresh when online, so a new build is picked up immediately
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(k=>k.put('./index.html',c));return r;}).catch(()=>caches.match('./index.html',{ignoreSearch:true}).then(r=>r||caches.match('./'))));
    return;
  }
  // every other file carries a content hash in its name, so the cache can never be stale
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request).then(res=>{const c=res.clone();if(res.ok)caches.open(CACHE).then(k=>k.put(e.request,c));return res;})));
});
