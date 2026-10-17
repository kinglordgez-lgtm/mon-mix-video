// MON MIX VIDEO V1.2.9 — réseau prioritaire pour le code, secours hors ligne.
const CACHE='mon-mix-v129';
const ASSETS=['./','./index.html','./app.js','./manifest.webmanifest','./icon.png','./icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(p=>new Request(p,{cache:'reload'})))));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('mon-mix-')&&k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim()})())});
self.addEventListener('fetch',event=>{const req=event.request;if(req.method!=='GET')return;const url=new URL(req.url);if(url.origin!==self.location.origin)return;
const localAssets=['/index.html','/app.js','/sw.js','/manifest.webmanifest'];
const isCode=req.mode==='navigate'||localAssets.some(path=>url.pathname.endsWith(path));
if(isCode){event.respondWith((async()=>{try{const fresh=await fetch(new Request(req,{cache:'no-store'}));if(fresh.ok&&url.pathname.endsWith('/sw.js')===false){const cache=await caches.open(CACHE);await cache.put(req,fresh.clone())}return fresh}catch(err){const cached=await caches.match(req,{ignoreSearch:true});if(cached)return cached;throw err}})());return}
event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(async response=>{if(response.ok){const cache=await caches.open(CACHE);cache.put(req,response.clone()).catch(()=>{})}return response})))
});
