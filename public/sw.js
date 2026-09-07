/* FORGE'S SERVICE WORKER — one job: notifications that arrive when the app is
   closed. It caches nothing. Forge already tells the athlete when a new build
   is live (version.json, see AppShell) and an offline cache on top of that is
   a second, slower way to serve yesterday's app.

   iOS only wakes this for a home-screen install, and it will quietly cancel
   the subscription if a push ever arrives without a visible notification —
   so every push path here ends in showNotification, including the ones that
   arrive malformed. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const title = payload.title || 'Forge';
  const options = {
    body: payload.body || 'Open Forge to see today’s training.',
    icon: './forge-icon-192.png',
    badge: './forge-icon-192.png',
    tag: payload.tag || 'forge',
    data: { url: payload.url || './#/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

/* Tapping the notification raises the app if it is already running, rather
   than opening a second copy of it. */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './#/', self.location.href).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.registration.scope)) { await client.focus(); return client.navigate(target).catch(() => undefined); }
    }
    return self.clients.openWindow(target);
  })());
});
