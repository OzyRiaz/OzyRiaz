// FeastQuarter service worker. It does ONE job: when a page navigation fails because there is no connection,
// show the friendly /offline page. It never caches pages, accounts, dashboards, checkout/payment or API responses —
// online users always get the live network response exactly as before.
const CACHE = 'feastquarter-v3';
const OFFLINE = '/offline';
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE]))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return; // only top-level page loads; everything else goes straight to the network
  e.respondWith(fetch(req).catch(async () => (await caches.match(OFFLINE)) || Response.error()));
});

// Push notifications. The server sends only a short title/body and a link (never card or personal details).
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (_) {}
  const url = typeof d.url === 'string' && d.url.startsWith('/') ? d.url : '/';
  e.waitUntil(self.registration.showNotification(String(d.title || 'FeastQuarter').slice(0, 80), { body: String(d.body || '').slice(0, 160), icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: d.tag || undefined, renotify: !!d.tag, data: { url } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    for (const c of cs) { if ('focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
