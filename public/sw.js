// FeastQuarter service worker. It does ONE job: when a page navigation fails because there is no connection,
// show the friendly /offline page. It never caches pages, accounts, dashboards, checkout/payment or API responses —
// online users always get the live network response exactly as before.
const CACHE = 'feastquarter-v2';
const OFFLINE = '/offline';
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE]))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return; // only top-level page loads; everything else goes straight to the network
  e.respondWith(fetch(req).catch(async () => (await caches.match(OFFLINE)) || Response.error()));
});
