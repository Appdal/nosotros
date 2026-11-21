// Service worker de "Nosotros": notificaciones y actualización automática
const CACHE = 'nosotros-v3';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Íconos: se sirven al instante desde la copia guardada y se refrescan por detrás.
// Todo lo demás (index.html): siempre la versión más nueva desde internet; si la red tarda más de 4 s
// o no hay conexión, abre con la copia guardada (y la nueva queda lista para la próxima vez).
self.addEventListener('fetch', e => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== location.origin) return;
  const save = r => { if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return r; };
  if (/\.(png|jpe?g|webp|svg|ico)$/i.test(u.pathname)) {
    e.respondWith(caches.match(req).then(hit => {
      const net = fetch(req).then(save).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  const fallback = () => caches.match(req).then(r => r || caches.match('./index.html'));
  e.respondWith(new Promise(resolve => {
    let done = false;
    const finish = r => { if (!done && r) { done = true; resolve(r); } };
    const timer = setTimeout(() => fallback().then(finish), 4000);
    fetch(req, { cache: 'reload' }).then(r => { clearTimeout(timer); finish(save(r)); })
      .catch(() => { clearTimeout(timer); fallback().then(r => { if (!done) { done = true; resolve(r || Response.error()); } }); });
  }));
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
