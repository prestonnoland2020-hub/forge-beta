import { supabase } from './supabase';
import { env, isDemoMode } from './env';
import { loadNotificationPrefs } from './notifications';

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
export async function syncPushSubscription(): Promise<boolean> {
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
    /* The settings toggles travel with the subscription. They were saved to
       localStorage and read by nothing, so the sender pushed both kinds to
       everyone regardless of what the athlete had chosen; the switch that
       turned nothing off is now the switch the server obeys. Every launch
       re-sends them, which is also how a change made offline eventually
       lands. */
    const prefs = loadNotificationPrefs();
    const { error } = await supabase.rpc('forge_save_push_subscription', {
      p_endpoint: subscription.endpoint, p_p256dh: p256dh, p_auth: auth,
      p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      p_wants_morning: prefs.morningWorkout, p_wants_partner: prefs.partnerTrained,
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
