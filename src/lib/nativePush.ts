import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from './supabase';

/* NOTIFICATIONS IN THE IPHONE APP.

   Forge's push was Web Push: a service worker and a subscription minted by
   Safari for the Home Screen web app. The TestFlight/App Store build is the
   same React app in a Capacitor WebView, and a WebView has neither — so the
   app never registered, and every morning brief, partner nudge and "Garmin
   synced" went to an old Home Screen install the athlete no longer opened.
   Apple's server took each one (201) and delivered it nowhere.

   In the native app the device registers with APNs instead. The token is
   stored in the same push_subscriptions table, its endpoint written as
   `apns:<token>`, so every kind of notification forge-push already composes
   — and every preference switch — reaches the iPhone app without a second
   code path on the server; forge-push sends rows with that prefix to Apple
   directly. */

export const isNativeApp = () => Capacitor.isNativePlatform();
const PERMISSION_KEY = 'forge-native-push-permission';
export const APNS_PREFIX = 'apns:';

type Permission = 'granted' | 'denied' | 'default';
const mapPermission = (value: string): Permission => value === 'granted' ? 'granted' : value === 'denied' ? 'denied' : 'default';

/* The settings screen reads permission synchronously; the plugin answers
   asynchronously. The last answer is kept so the screen can draw at once,
   and refreshed on every launch. */
export const nativePermission = (): Permission => {
  try { return mapPermission(localStorage.getItem(PERMISSION_KEY) || 'default'); } catch { return 'default'; }
};
const remember = (value: Permission) => { try { localStorage.setItem(PERMISSION_KEY, value); } catch { /* best effort */ } };

export async function refreshNativePermission(): Promise<Permission> {
  const { receive } = await PushNotifications.checkPermissions();
  const value = mapPermission(receive);
  remember(value);
  return value;
}

/* Only from a tap: iOS shows the prompt once, and it should come with a
   reason on screen. */
export async function requestNativePermission(): Promise<Permission> {
  const { receive } = await PushNotifications.requestPermissions();
  const value = mapPermission(receive);
  remember(value);
  return value;
}

let tokenWaiters: Array<(token: string | null) => void> = [];
let listening = false;
const listen = () => {
  if (listening) return;
  listening = true;
  void PushNotifications.addListener('registration', token => { tokenWaiters.forEach(done => done(token.value)); tokenWaiters = []; });
  void PushNotifications.addListener('registrationError', () => { tokenWaiters.forEach(done => done(null)); tokenWaiters = []; });
};

/* Register with APNs and get this device's token. iOS hands the same token
   back on every launch until it rotates, so asking each launch is how a
   rotated token is noticed. */
async function deviceToken(): Promise<string | null> {
  listen();
  const token = new Promise<string | null>(resolve => {
    tokenWaiters.push(resolve);
    setTimeout(() => resolve(null), 15_000);
  });
  await PushNotifications.register();
  return token;
}

/* The native twin of syncPushSubscription: same RPC, same rule that only an
   explicit change carries preference values (null leaves the stored ones). */
export async function syncNativePush(prefs?: { morningWorkout: boolean; partnerTrained: boolean; watchSynced?: boolean }): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    if (await refreshNativePermission() !== 'granted') return false;
    const token = await deviceToken();
    if (!token) return false;
    try { localStorage.setItem('forge-native-push-token', token); } catch { /* best effort */ }
    const { error } = await supabase.rpc('forge_save_push_subscription', {
      p_endpoint: `${APNS_PREFIX}${token}`, p_p256dh: 'apns', p_auth: 'apns',
      p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      p_wants_morning: prefs ? prefs.morningWorkout : null,
      p_wants_partner: prefs ? prefs.partnerTrained : null,
      ...(prefs?.watchSynced !== undefined ? { p_wants_sync: prefs.watchSynced } : {}),
    });
    return !error;
  } catch { return false; }
}

export async function disableNativePush(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const token = localStorage.getItem('forge-native-push-token');
    if (token) await Promise.resolve(supabase.rpc('forge_delete_push_subscription', { p_endpoint: `${APNS_PREFIX}${token}` })).catch(() => undefined);
    await PushNotifications.unregister();
  } catch { /* best effort */ }
}

/* A tapped notification opens the screen it is about. forge-push sends the
   same `url` it gives Web Push ("./#/goals"); only the hash matters here. */
export function openNotificationTaps(navigate: (path: string) => void) {
  if (!isNativeApp()) return;
  void PushNotifications.addListener('pushNotificationActionPerformed', action => {
    const url = String((action.notification.data as { url?: string } | undefined)?.url || '');
    const hash = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
    navigate(hash.startsWith('/') ? hash : '/');
  });
}
