// Service worker de "Nosotros": notificaciones y actualización automática
const CACHE = 'nosotros-v3';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Siempre la versión más nueva: pide a la red saltándose la caché del navegador; caché solo si no hay internet
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: 'reload' }).then(r => {
    const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: 'Nosotros', body: e.data && e.data.text() }; }
  const buzz = !!d.buzz;
  const opts = {
    body: d.body || 'Nuevo mensaje',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: d.tag || 'chat',
    renotify: true,
    requireInteraction: buzz,
    vibrate: buzz ? [300, 100, 300, 100, 300, 100, 500] : [120, 60, 120],
    data: { url: self.registration.scope }
  };
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.title || 'Nosotros', opts),
    self.navigator.setAppBadge ? self.navigator.setAppBadge().catch(() => {}) : null
  ]));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) { if (w.url.startsWith(self.registration.scope)) return w.focus(); }
    return self.clients.openWindow(url);
  }));
});
