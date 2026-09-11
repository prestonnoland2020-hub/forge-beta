import { supabase } from './supabase';
import { env, isDemoMode } from './env';

/* REAL PUSH, THE ONE WAY IOS ALLOWS IT.

   Forge's older notifications were `new Notification(...)` from the page,
   which can only fire while the page is alive — so a "morning brief" arrived
   when the athlete opened the app, which is precisely when they did not need
   telling. A push that arrives with the app closed needs a service worker,
   and on iOS it needs three things besides: a home-screen install, a manifest
   that declares `display: standalone`, and a permission prompt raised from a
   real tap. All three are true here; the tap is the toggle in Settings.

   iOS also retires subscriptions after a long quiet spell, without telling
   anyone. `syncPushSubscription` therefore runs on every launch rather than
   once at opt-in: re-subscribing an endpoint that is still good is free, and
   it is the only way to notice one that is not. */

/* WHICH KEY, AND WHERE IT COMES FROM.

   The application server key was a build-time constant, which made rotating
   it a repository secret plus a rebuild plus a redeploy — and made a fresh
   clone of Forge unable to subscribe at all until someone found the value.
   The public half of a VAPID pair is not a secret (it is handed to Apple with
   every subscription), so the server can simply say what it is. The build-time
   value is kept as a fallback for the moment the database is unreachable. */
const BUILT_IN_VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
let resolvedKey: string | null | undefined;
async function applicationServerKey(): Promise<string | null> {
  if (resolvedKey !== undefined) return resolvedKey;
  try {
    const { data, error } = await supabase.rpc('forge_push_public_key');
    resolvedKey = (!error && typeof data === 'string' && data.length > 80 ? data : BUILT_IN_VAPID) || null;
  } catch { resolvedKey = BUILT_IN_VAPID || null; }
  return resolvedKey;
}

export const pushSupported = () =>
  typeof navigator !== 'undefined' && 'serviceWorker' in navigator
  && typeof window !== 'undefined' && 'PushManager' in window;

/* On iOS the API exists only inside the installed app, so the honest question
   is not "can this browser push" but "is this athlete in a position to be
   pushed to". A Safari tab is not. */
export const installedToHomeScreen = () =>
  typeof window !== 'undefined'
  && (window.matchMedia?.('(display-mode: standalone)').matches
    || (window.navigator as { standalone?: boolean }).standalone === true);

const urlBase64ToUint8Array = (base64: string) => {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from([...raw].map(char => char.charCodeAt(0)));
};
const keyToBase64 = (key: ArrayBuffer | null) =>
  key ? btoa(String.fromCharCode(...new Uint8Array(key))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '';

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    /* The worker needs to reach the database on its own when the push service
       rotates an endpoint, and it has no bundler and no session to get there
       with. Both of these already ship in the client bundle and neither is a
       secret, so they ride along on the worker's own URL. */
    const url = new URL('sw.js', document.baseURI);
    url.searchParams.set('u', env.VITE_SUPABASE_URL);
    url.searchParams.set('k', env.VITE_SUPABASE_PUBLISHABLE_KEY);
    return await navigator.serviceWorker.register(url.href, { scope: './' });
  }
  catch { return null; }
}

/* Called on every launch once the athlete has said yes. Returns true while a
   live subscription is on file, so the settings toggle can tell the truth. */
/* `prefs` is sent ONLY when the athlete just changed a switch. The launch
   sync omits it, so the choice stored on their account survives a cleared
   localStorage — see forge_save_push_subscription, where null means "leave it
   as it is". Sending the local copy on every launch turned both notifications
   off for anyone whose device cache had been wiped, silently, while the app
   still drew the switches as on. */
export async function syncPushSubscription(prefs?: { morningWorkout: boolean; partnerTrained: boolean }): Promise<boolean> {
  if (isDemoMode || !pushSupported()) return false;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  const vapidPublic = await applicationServerKey();
  if (!vapidPublic) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    /* A SUBSCRIPTION OUTLIVES THE KEY IT WAS MINTED WITH, AND GOES QUIET.

       An existing subscription is bound to whichever application server key
       created it. Rotate the pair and every install keeps a subscription that
       looks perfectly healthy, reports itself as enabled, and can never be
       pushed to again — the push service rejects the new key's signature. The
       only way to notice is to compare, so this compares, and re-mints when
       they differ. */
    if (subscription && keyToBase64(subscription.options.applicationServerKey) !== vapidPublic) {
      await Promise.resolve(supabase.rpc('forge_delete_push_subscription', { p_endpoint: subscription.endpoint })).catch(() => undefined);
      await subscription.unsubscribe().catch(() => undefined);
      subscription = null;
    }
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublic),
      });
    }
    const p256dh = keyToBase64(subscription.getKey('p256dh'));
    const auth = keyToBase64(subscription.getKey('auth'));
    if (!p256dh || !auth) return false;
    /* The toggles the server obeys. Passing null leaves the stored choice
       alone, which is what a launch does; only a deliberate change carries
       new values. */
    const { error } = await supabase.rpc('forge_save_push_subscription', {
      p_endpoint: subscription.endpoint, p_p256dh: p256dh, p_auth: auth,
      p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      p_wants_morning: prefs ? prefs.morningWorkout : null,
      p_wants_partner: prefs ? prefs.partnerTrained : null,
    });
    return !error;
  } catch { return false; }
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    await Promise.resolve(supabase.rpc('forge_delete_push_subscription', { p_endpoint: subscription.endpoint })).catch(() => undefined);
    await subscription.unsubscribe();
  } catch { /* best effort */ }
}

/* SEND ME ONE NOW, AND TELL ME WHAT BECAME OF IT.

   Four different failures look the same from the athlete's side: the switch is
   off in the database, the install is gone and the push service has not
   noticed, the permission was revoked in iOS Settings, or the send genuinely
   failed. Every one of them reads as "I'm not getting notifications", and
   until now the only way to tell them apart was someone with the SQL editor
   open.

   The receipt is what makes this worth anything. The service worker stamps the
   log row when it puts a notification on the screen, so "accepted by Apple"
   and "shown on your phone" are different answers and the athlete is told
   which one they got. */
export async function sendTestPush(): Promise<string> {
  if (isDemoMode) return 'Notifications are off in the demo.';
  if (!pushSupported()) return 'This browser cannot receive notifications.';
  const { data, error } = await supabase.rpc('forge_send_test_push');
  if (error) return 'Forge could not send a test just now. Try again in a moment.';
  const result = (data || {}) as { ok?: boolean; reason?: string };
  if (!result.ok) {
    if (result.reason === 'no subscription') return 'This device is not registered yet. Turn a switch off and on again to register it.';
    if (result.reason === 'too many') return 'That is a few tests in a row — give it a minute.';
    return 'Forge could not send a test just now. Try again in a moment.';
  }
  /* A push crosses Apple and wakes a worker; it is not instant, and the answer
     is worth waiting a few seconds for. */
  for (const wait of [1500, 2000, 2500, 3000]) {
    await new Promise(resolve => setTimeout(resolve, wait));
    const { data: rows } = await supabase.rpc('forge_push_last');
    const last = (Array.isArray(rows) ? rows[0] : rows) as { outcome?: string; status?: number; delivered?: boolean; note?: string } | undefined;
    if (!last) continue;
    if (last.delivered) return 'Delivered — that one reached your phone.';
    if (last.outcome === 'retired') return 'Your install is no longer registered with Apple. Delete Forge from your Home Screen, add it again, and allow notifications.';
    if (last.outcome === 'failed') return `Forge could not send it${last.status ? ` (${last.status})` : ''}. ${last.note || ''}`.trim();
  }
  return 'Apple accepted it but your phone has not shown it. Check Notifications for Forge in iOS Settings — and if that looks right, delete Forge from your Home Screen and add it again.';
}


/* WHAT THIS PHONE'S NOTIFICATIONS ARE ACTUALLY DOING. One line an athlete can
   read, and one an owner can be told over a text message, instead of a silence
   that takes three weeks and a database query to explain. */
export type PushHealth = { registered: boolean; lastDelivered: string | null; lastAttempt: string | null; lastOutcome: string | null; installs: number };

export async function readPushHealth(): Promise<PushHealth | null> {
  if (isDemoMode) return null;
  const { data, error } = await supabase.rpc('forge_push_health');
  if (error) return null;
  const rows = (Array.isArray(data) ? data : []) as Array<{
    last_delivered_at: string | null; last_attempt_at: string | null; last_attempt_outcome: string | null;
  }>;
  if (!rows.length) return { registered: false, lastDelivered: null, lastAttempt: null, lastOutcome: null, installs: 0 };
  const newest = (pick: (row: typeof rows[number]) => string | null) =>
    rows.map(pick).filter((value): value is string => Boolean(value)).sort().at(-1) || null;
  const lastAttempt = newest(row => row.last_attempt_at);
  return {
    registered: true,
    lastDelivered: newest(row => row.last_delivered_at),
    lastAttempt,
    lastOutcome: rows.find(row => row.last_attempt_at === lastAttempt)?.last_attempt_outcome || null,
    installs: rows.length,
  };
}

export function describePushHealth(health: PushHealth | null): string {
  if (!health) return '';
  if (!health.registered) return 'This device is not registered for notifications yet.';
  const when = (iso: string) => {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 14) return `${days} days ago`;
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  if (health.lastDelivered) {
    const stale = Date.now() - new Date(health.lastDelivered).getTime() > 7 * 86400000;
    return `A notification last reached this account ${when(health.lastDelivered)}.${stale ? ' That is a while — send a test to check this phone is still registered.' : ''}`;
  }
  if (health.lastAttempt) return `Forge has tried to send since ${when(health.lastAttempt)} and nothing has been confirmed as arriving${health.lastOutcome === 'retired' ? ' — this install is no longer registered with Apple' : ''}. Send a test.`;
  return 'Registered, but Forge has not sent anything to this account yet.';
}
