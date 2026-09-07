import { supabase } from './supabase';
import { isDemoMode } from './env';

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

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

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
  try { return await navigator.serviceWorker.register(new URL('sw.js', document.baseURI).href, { scope: './' }); }
  catch { return null; }
}

/* Called on every launch once the athlete has said yes. Returns true while a
   live subscription is on file, so the settings toggle can tell the truth. */
export async function syncPushSubscription(): Promise<boolean> {
  if (isDemoMode || !VAPID_PUBLIC || !pushSupported()) return false;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      });
    }
    const p256dh = keyToBase64(subscription.getKey('p256dh'));
    const auth = keyToBase64(subscription.getKey('auth'));
    if (!p256dh || !auth) return false;
    const { error } = await supabase.rpc('forge_save_push_subscription', {
      p_endpoint: subscription.endpoint, p_p256dh: p256dh, p_auth: auth,
      p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
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
