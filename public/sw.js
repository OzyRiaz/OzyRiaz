// Minimal service worker: caches the app shell icon set and serves an offline page for failed navigations.
// It deliberately never caches API, checkout, account or dashboard responses.
const CACHE = 'bdfeast-v1';
const OFFLINE = '/offline.html';
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, '/icons/icon.svg']))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate') e.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
});
