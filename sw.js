// Service worker de "Nosotros": notificaciones y actualización automática
const CACHE = 'nosotros-v3';
const SUPA = 'https://yqizexknwsrkngrtagoo.supabase.co', SUPA_KEY = 'sb_publishable_Fi7_MoZgTUucOWKTNaFDZA_32gZkJ1s';
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

// Notificaciones:
// - Zumbidos (con o sin texto): se muestran normal, con su texto.
// - Mensajes (texto, foto, audio, video): por privacidad NO se muestra el contenido,
//   solo "<Nombre> te envió N mensajes". El contador se reinicia al abrir la app.
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: 'Nosotros' }; }
  const buzz = !!d.buzz;
  const reg = self.registration;
  e.waitUntil((async () => {
    let body = d.body || 'Nuevo mensaje', tag = d.tag || 'chat', count = 0;
    // Llamada entrante: aviso insistente para contestar
    if (!buzz && /^(📞|🎥)/.test(d.body || '') && !/^(📞 Llamada|🎥 Videollamada)$/.test((d.body || '').trim())) {
      // la llamada ya terminó (perdida, cancelada, rechazada): reemplaza el aviso de "te está llamando"
      await reg.showNotification('📞 Llamada perdida de ' + (d.title || 'tu pareja'), {
        body: /🎥/.test(d.body) ? 'Videollamada perdida' : 'Llamada perdida', icon: 'icon-192.png', badge: 'icon-192.png', tag: 'call', renotify: false, data: { url: reg.scope }
      });
      return;
    }
    if (!buzz && /^(📞|🎥)/.test(d.body || '')) {
      await reg.showNotification((d.title || 'Tu pareja') + (/^🎥/.test(d.body) ? ' te está haciendo una videollamada' : ' te está llamando'), {
        body: 'Toca para contestar', icon: 'icon-192.png', badge: 'icon-192.png', tag: 'call', renotify: true,
        requireInteraction: true, vibrate: [700, 300, 700, 300, 700, 300, 700], data: { url: reg.scope }
      });
      // avisa a quien llama que el aviso llegó a este celular → allá pasa de "Llamando…" a "Timbrando…"
      try {
        await fetch(SUPA + '/realtime/v1/api/broadcast', { method: 'POST', headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [{ topic: 'llamada', event: 'sig', payload: { type: 'ringing', from: 'aviso' } }] }) });
      } catch (_) {}
      return;
    }
    if (!buzz) {
      tag = 'msgs';
      try {
        const prev = reg.getNotifications ? await reg.getNotifications({ tag }) : [];
        for (const n of prev) count = Math.max(count, (n.data && n.data.count) || 1);
      } catch (_) {}
      count += 1;
      const who = String(d.title || 'Tu pareja').trim() || 'Tu pareja';
      body = who + (count === 1 ? ' te envió 1 mensaje 💌' : ' te envió ' + count + ' mensajes 💌');
    }
    await reg.showNotification(buzz ? (d.title || 'Nosotros') : 'Nosotros', {
      body,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag,
      renotify: true,
      requireInteraction: buzz,
      vibrate: buzz ? [300, 100, 300, 100, 300, 100, 500] : [120, 60, 120],
      data: { url: reg.scope, count }
    });
    if (self.navigator.setAppBadge) { try { await (count ? self.navigator.setAppBadge(count) : self.navigator.setAppBadge()); } catch (_) {} }
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) { if (w.url.startsWith(self.registration.scope)) return w.focus(); }
    return self.clients.openWindow(url);
  }));
});
