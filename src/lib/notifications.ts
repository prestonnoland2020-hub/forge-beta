/* Notification preferences and best-effort delivery. System notifications on
   the web fire while Forge is open (or installed) and permission is granted;
   the Coach tab is the always-reliable in-app surface for the same messages. */

export type NotificationPrefs = { morningWorkout: boolean; injuryFollowUp: boolean };
const prefsKey = 'forge-notification-prefs-v1';
const sentKey = 'forge-notifications-sent-v1';

export const loadNotificationPrefs = (): NotificationPrefs => {
  try { return { morningWorkout: false, injuryFollowUp: false, ...JSON.parse(localStorage.getItem(prefsKey) || '{}') }; }
  catch { return { morningWorkout: false, injuryFollowUp: false }; }
};
export const saveNotificationPrefs = (prefs: NotificationPrefs) => localStorage.setItem(prefsKey, JSON.stringify(prefs));

export const notificationsSupported = () => typeof Notification !== 'undefined';
export const notificationPermission = () => notificationsSupported() ? Notification.permission : 'denied';
export const requestNotificationPermission = async () => notificationsSupported() ? Notification.requestPermission() : 'denied';

const todayIso = () => new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const alreadySent = (tag: string) => {
  try { const sent = JSON.parse(localStorage.getItem(sentKey) || '{}'); return sent[tag] === todayIso(); } catch { return false; }
};
const markSent = (tag: string) => {
  try { const sent = JSON.parse(localStorage.getItem(sentKey) || '{}'); sent[tag] = todayIso(); localStorage.setItem(sentKey, JSON.stringify(sent)); } catch { /* best effort */ }
};

const show = (tag: string, title: string, body: string) => {
  if (!notificationsSupported() || Notification.permission !== 'granted' || alreadySent(tag)) return;
  try { new Notification(title, { body, tag: `forge-${tag}`, icon: '/forge-icon-192.png' }); markSent(tag); } catch { /* some platforms need a service worker; the in-app card still shows */ }
};

/* Morning brief: once per day, in the morning, when the day isn't logged yet. */
export const maybeNotifyMorningWorkout = (summary: string) => {
  const hour = new Date().getHours();
  if (hour < 5 || hour >= 12) return;
  show('morning-workout', 'Today’s training', summary);
};

export const maybeNotifyFollowUp = (label: string) => {
  show(`follow-up-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, 'Forge check-in', `How is the ${label} feeling today? Open Coach to check in.`);
};
