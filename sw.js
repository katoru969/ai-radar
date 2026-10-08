const BASE = new URL('./',self.location.href);
const PREFIX = `ai-radar-${encodeURIComponent(BASE.pathname)}-`;
const CACHE = `${PREFIX}v1.3.1-refresh-20261008`;
const FILES = ['','index.html','styles.css','app.js','shared.js','article-details.js','feed-refresh.js','terms.js','manifest.webmanifest','icon-180.png','icon-192.png','icon-512.png'];
const ASSETS = FILES.map(name => new URL(name,BASE).href);
const FEED_URL = new URL('data/feed.json',BASE);
const PATHS = new Set([...ASSETS.map(url => new URL(url).pathname),FEED_URL.pathname]);
self.addEventListener('install',event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate',event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => (key.startsWith(PREFIX) && key !== CACHE) || (BASE.pathname === '/' && key.startsWith('ai-radar-v1-'))).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch',event => {
  const {request} = event,url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== BASE.origin || !PATHS.has(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // 確認用のクエリが変わっても、保存先は1つ。オフライン時は最後の正常データへ戻る。
    const isFeed = url.pathname === FEED_URL.pathname, key = isFeed ? FEED_URL.href : request;
    try {
      const response = await fetch(request,isFeed ? {cache:'no-store'} : undefined);
      if (response.status >= 500 || (isFeed && !response.ok)) throw new Error('server_unavailable');
      if (isFeed) {
        const data = await response.clone().json();
        if (!Array.isArray(data.articles) || !Array.isArray(data.sources) || !Number.isFinite(Date.parse(data.generatedAt))) throw new Error('invalid_feed');
        const saved = await cache.match(key);
        if (saved) {
          const previous = await saved.json();
          if (Date.parse(previous.generatedAt) > Date.parse(data.generatedAt)) throw new Error('older_feed');
        }
      }
      if (response.ok && response.type === 'basic') await cache.put(key, response.clone());
      return response;
    } catch {
      const cached = await cache.match(key);
      if (cached) {
        if (isFeed) {
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
