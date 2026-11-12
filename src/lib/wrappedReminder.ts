import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

/* "YOUR WRAPPED IS HERE", ON THE IPHONE APP. The web app's Jan 1 message is
   a server push (forge-push, kind "wrapped"); the iPhone app has no server
   push, so the phone schedules it for itself: Jan 1, 9 am on its own clock.
   Nothing to send, nothing to miss if the server is busy that morning. */

const native = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
const idFor = (year: number) => 900000 + year;
export const wrappedReminderAt = (year: number) => new Date(year + 1, 0, 1, 9, 0, 0);

export type ReminderState = 'unsupported' | 'scheduled' | 'can-ask' | 'denied';

export async function wrappedReminderState(year: number): Promise<ReminderState> {
  if (!native()) return 'unsupported';
  try {
    const { display } = await LocalNotifications.checkPermissions();
    if (display === 'denied') return 'denied';
    const { notifications } = await LocalNotifications.getPending();
    if (notifications.some(item => item.id === idFor(year))) return 'scheduled';
    return 'can-ask';
  } catch { return 'unsupported'; }
}

async function schedule(year: number) {
  const at = wrappedReminderAt(year);
  if (at.getTime() <= Date.now()) return false;
  await LocalNotifications.schedule({ notifications: [{
    id: idFor(year),
    title: `Your ${year} Forge Wrapped is here`,
    body: 'Your year in training, told back to you. Tap to see it.',
    schedule: { at, allowWhileIdle: true },
    extra: { route: '/wrapped' },
  }] });
  return true;
}

/* Quietly (re)schedule when she already allowed notifications — run on launch. */
export async function keepWrappedReminder(year: number) {
  if (!native()) return;
  try {
    const { display } = await LocalNotifications.checkPermissions();
    if (display !== 'granted') return;
    const { notifications } = await LocalNotifications.getPending();
    if (!notifications.some(item => item.id === idFor(year))) await schedule(year);
  } catch { /* the reminder is a nicety */ }
}

/* From her tap: ask iPhone, then schedule. */
export async function askWrappedReminder(year: number): Promise<ReminderState> {
  if (!native()) return 'unsupported';
  try {
    const { display } = await LocalNotifications.requestPermissions();
    if (display !== 'granted') return 'denied';
    return (await schedule(year)) ? 'scheduled' : 'can-ask';
  } catch { return 'unsupported'; }
}

/* A tap on the notification opens Wrapped. */
export function onWrappedReminderTap(go: (route: string) => void) {
  if (!native()) return () => {};
  const handle = LocalNotifications.addListener('localNotificationActionPerformed', event => {
    const route = (event.notification.extra as { route?: string } | undefined)?.route;
    if (route) go(route);
  });
  return () => { void handle.then(item => item.remove()); };
}
