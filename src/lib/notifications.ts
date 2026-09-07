import { localDayIso } from './time';
/* Notification preferences and best-effort delivery. System notifications on
   the web fire while Forge is open (or installed) and permission is granted;
   the Coach tab is the always-reliable in-app surface for the same messages. */

export type NotificationPrefs = { morningWorkout: boolean; injuryFollowUp: boolean; partnerTrained: boolean };
const prefsKey = 'forge-notification-prefs-v1';
const sentKey = 'forge-notifications-sent-v1';

export const loadNotificationPrefs = (): NotificationPrefs => {
  try { return { morningWorkout: false, injuryFollowUp: false, partnerTrained: false, ...JSON.parse(localStorage.getItem(prefsKey) || '{}') }; }
  catch { return { morningWorkout: false, injuryFollowUp: false, partnerTrained: false }; }
};
export const saveNotificationPrefs = (prefs: NotificationPrefs) => localStorage.setItem(prefsKey, JSON.stringify(prefs));

export const notificationsSupported = () => typeof Notification !== 'undefined';
export const notificationPermission = () => notificationsSupported() ? Notification.permission : 'denied';
export const requestNotificationPermission = async () => notificationsSupported() ? Notification.requestPermission() : 'denied';

const todayIso = () => localDayIso();
const alreadySent = (tag: string) => {
  try { const sent = JSON.parse(localStorage.getItem(sentKey) || '{}'); return sent[tag] === todayIso(); } catch { return false; }
};
const markSent = (tag: string) => {
  try { const sent = JSON.parse(localStorage.getItem(sentKey) || '{}'); sent[tag] = todayIso(); localStorage.setItem(sentKey, JSON.stringify(sent)); } catch { /* best effort */ }
};

const show = (tag: string, title: string, body: string) => {
  if (!notificationsSupported() || Notification.permission !== 'granted' || alreadySent(tag)) return;
  try { new Notification(title, { body, tag: `forge-${tag}`, icon: './forge-icon-192.png' }); markSent(tag); } catch { /* some platforms need a service worker; the in-app card still shows */ }
};

/* Morning brief: once per day, in the morning, when the day isn't logged yet. */
export const maybeNotifyMorningWorkout = (summary: string) => {
  const hour = new Date().getHours();
  if (hour < 5 || hour >= 12) return;
  show('morning-workout', 'Today’s training', summary);
};

/* THE NUDGE. One line, once a day, and only when it can still change
   something: a partner has trained and you have not. This is the whole of
   Forge's social mechanic — a specific person who is already done does more
   for adherence than any feed of strangers. */
export const maybeNotifyPartnerTrained = (names: string[]) => {
  if (!names.length) return;
  const hour = new Date().getHours();
  if (hour < 9 || hour >= 21) return;
  const who = names.length === 1 ? names[0]
    : names.length === 2 ? `${names[0]} and ${names[1]}`
    : `${names[0]} and ${names.length - 1} others`;
  show('partner-trained', 'Your turn', `${who} trained today. You haven’t logged yet.`);
};

export const maybeNotifyFollowUp = (label: string) => {
  show(`follow-up-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, 'Forge check-in', `How is the ${label} feeling today? Open Coach to check in.`);
};
