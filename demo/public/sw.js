// بلّغ — service worker: shows Web Push notifications and opens the right screen when one is tapped.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'بلّغ', body: e.data?.text() || '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'بلّغ', {
    body: d.body || '',
    icon: '/img/icon-192.png',
    badge: '/img/badge-72.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    dir: 'rtl',
    lang: 'ar',
    data: { url: d.url || '/citizen.html' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/citizen.html', self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = wins.find(w => new URL(w.url).pathname === '/citizen.html');
    if (app) { await app.focus(); return app.navigate(url).catch(() => {}); }
    return self.clients.openWindow(url);
  })());
});
