const BASE = new URL('./',self.location.href);
const PREFIX = `ai-radar-${encodeURIComponent(BASE.pathname)}-`;
const CACHE = `${PREFIX}v1.2-consumer-20261007`;
const FILES = ['','index.html','styles.css','app.js','shared.js','terms.js','manifest.webmanifest','icon-180.png','icon-192.png','icon-512.png'];
const ASSETS = FILES.map(name => new URL(name,BASE).href);
const PATHS = new Set([...ASSETS.map(url => new URL(url).pathname),new URL('data/feed.json',BASE).pathname]);
self.addEventListener('install',event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate',event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => (key.startsWith(PREFIX) && key !== CACHE) || (BASE.pathname === '/' && key.startsWith('ai-radar-v1-'))).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch',event => {
  const {request} = event,url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== BASE.origin || !PATHS.has(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (response.status >= 500) throw new Error('server_unavailable');
      if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
      return response;
    } catch {
      const cached = await cache.match(request);
      if (cached) {
        if (url.pathname === new URL('data/feed.json',BASE).pathname) {
          const headers = new Headers(cached.headers);
          headers.set('X-AI-Radar-Cached','1');
          return new Response(cached.body,{status:cached.status,statusText:cached.statusText,headers});
        }
        return cached;
      }
      if (request.mode === 'navigate') return (await cache.match(new URL('index.html',BASE).href)) || Response.error();
      return Response.error();
    }
  })());
});
