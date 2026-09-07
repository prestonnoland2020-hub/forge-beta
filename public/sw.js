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

/* THE SUBSCRIPTION MOVES, AND NOBODY IS WATCHING.

   A push service may retire an endpoint and issue a replacement whenever it
   likes — iOS does it after a long quiet spell, and after some OS updates.
   It announces this here, with the app closed and no session to speak of, and
   if nothing answers, the server keeps posting to an address that no longer
   exists and the athlete simply stops being notified. Nothing tells them.

   So this re-subscribes with the SAME application server key (taken off the
   old subscription, so no network round trip and no key baked in twice) and
   asks the database to move the row from the old endpoint to the new one.
   The old endpoint is the proof of ownership — see forge_rotate_push_-
   subscription. If any of it fails, the next app launch repairs it the
   ordinary way; this is what covers the weeks in between. */
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil((async () => {
    const previous = event.oldSubscription || await self.registration.pushManager.getSubscription();
    const applicationServerKey = previous?.options?.applicationServerKey;
    if (!previous?.endpoint || !applicationServerKey) return;

    const next = event.newSubscription
      || await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
        .catch(() => null);
    if (!next) return;

    const b64 = key => key
      ? btoa(String.fromCharCode(...new Uint8Array(key))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      : '';
    /* Handed to the worker at registration time; both values are public and
       already ship inside the client bundle. */
    const params = new URLSearchParams(self.location.search);
    const url = params.get('u');
    const key = params.get('k');
    if (!url || !key) return;

    await fetch(`${url}/rest/v1/rpc/forge_rotate_push_subscription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        p_old_endpoint: previous.endpoint, p_new_endpoint: next.endpoint,
        p_p256dh: b64(next.getKey('p256dh')), p_auth: b64(next.getKey('auth')),
      }),
    }).catch(() => undefined);
  })());
});
