import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { isDemoMode } from '../lib/env';
import { loadNotificationPrefs, notificationPermission, notificationsSupported, requestNotificationPermission, saveNotificationPrefs } from '../lib/notifications';
import { installedToHomeScreen, pushSupported, readPushHealth, syncPushSubscription } from '../lib/push';
import { isNative } from '../features/billing/platform';

/* NOTIFICATIONS ARE WHAT MAKE FORGE WORK WITHOUT BEING OPENED.

   They carry the morning workout and the "a partner trained" nudge, they are
   off for most athletes, and the switch lived only behind Profile, where
   nobody goes to look. So Today asks. "Not now" quiets the card for a few
   days rather than for good: an athlete who said no on a busy morning has not
   said no forever. It does not appear when there is nothing the athlete can
   do, such as a browser with no notifications at all.

   Connecting a watch is asked separately, on open, by GarminConnectPrompt. */

type Snoozes = { notifications?: string };
const snoozeKey = 'forge-today-nudges-v1';
const SNOOZE_DAYS = { notifications: 3 } as const;
const readSnoozes = (): Snoozes => { try { return JSON.parse(localStorage.getItem(snoozeKey) || '{}'); } catch { return {}; } };
const snoozed = (kind: keyof Snoozes) => { const until = readSnoozes()[kind]; return Boolean(until && new Date(until).getTime() > Date.now()); };
const snooze = (kind: keyof Snoozes) => {
  try { localStorage.setItem(snoozeKey, JSON.stringify({ ...readSnoozes(), [kind]: new Date(Date.now() + SNOOZE_DAYS[kind] * 86400000).toISOString() })); } catch { /* the card just comes back next visit */ }
};

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/* What this device can do about notifications right now. 'install' is iOS in
   a Safari tab, where push exists only once Forge is on the Home Screen. */
type NotifyState = 'ask' | 'blocked' | 'install' | null;
async function notifyState(): Promise<NotifyState> {
  /* The native shell's web view has no web push; it needs Apple's own push
     service, which is not wired yet. Asking there would promise nothing. */
  if (isDemoMode || isNative() || snoozed('notifications')) return null;
  /* Another device of theirs already gets the morning workout; nagging the
     laptop as well would be noise. */
  const health = await readPushHealth();
  if (health?.registered) return null;
  if (isIos() && !installedToHomeScreen()) return 'install';
  if (!notificationsSupported() || !pushSupported()) return null;
  const permission = notificationPermission();
  if (permission === 'denied') return 'blocked';
  return 'ask';
}


export function TodayNudges() {
  const [notify, setNotify] = useState<NotifyState>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    let live = true;
    void notifyState().then(state => {
      if (!live) return;
      setNotify(state);
    });
    return () => { live = false; };
  }, []);

  /* THE TAP IS THE PROMPT. iOS raises the permission sheet only from a real
     gesture, so the card's button asks, and a yes turns on both of the
     notifications this card promised. */
  const turnOn = async () => {
    setBusy(true); setNote('');
    try {
      const permission = await requestNotificationPermission();
      if (permission !== 'granted') { setNotify(permission === 'denied' ? 'blocked' : 'ask'); return; }
      const prefs = { ...loadNotificationPrefs(), morningWorkout: true, partnerTrained: true };
      saveNotificationPrefs(prefs);
      const ok = await syncPushSubscription({ morningWorkout: prefs.morningWorkout, partnerTrained: prefs.partnerTrained });
      if (ok) setNotify(null);
      else setNote('Notifications are allowed, but Forge could not register this device. Try again from Profile → Coach settings.');
    } finally { setBusy(false); }
  };
  const dismiss = (kind: keyof Snoozes) => { snooze(kind); setNotify(null); };

  if (notify) {
    const copy = {
      ask: ['Turn on notifications', 'Get today’s workout each morning, and a heads-up when a partner trains.'],
      blocked: ['Notifications are blocked', 'Allow notifications for Forge in your browser or phone settings to get your morning workout.'],
      install: ['Get your morning workout', 'Add Forge to your Home Screen (Share → Add to Home Screen), then open it from there to turn on notifications.'],
    }[notify];
    return <section className="buffer-banner td-nudge" aria-label={copy[0]}>
      <i className="buffer-banner-mark"><Icon name="bell" size={18} stroke={2.1} /></i>
      <span><small>{copy[0]}</small>{note || copy[1]}</span>
      <div className="td-nudge-actions">
        {notify === 'ask' && <button type="button" className="button" disabled={busy} onClick={() => void turnOn()}>Turn on</button>}
        <button type="button" className="td-nudge-later" onClick={() => dismiss('notifications')}>Not now</button>
      </div>
    </section>;
  }
  return null;
}
