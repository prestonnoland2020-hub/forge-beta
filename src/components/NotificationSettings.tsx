import { useState } from 'react';
import { loadNotificationPrefs, notificationPermission, notificationsSupported, requestNotificationPermission, saveNotificationPrefs, type NotificationPrefs } from '../lib/notifications';
import { installedToHomeScreen, syncPushSubscription, disablePush } from '../lib/push';

/* iOS is the only platform where an install is the difference between a
   notification and nothing, so it is the only one told to install. */
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function NotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => loadNotificationPrefs());
  const [permission, setPermission] = useState(notificationPermission());
  /* WHETHER THE DEVICE IS ACTUALLY REGISTERED, WHICH IS NOT THE SAME QUESTION
     AS WHETHER THE SWITCH IS ON. syncPushSubscription already returned this
     and the answer was thrown away, so a device that accepted the iOS prompt
     but failed to reach the server looked identical to one that worked, and
     the athlete found out weeks later by never being notified. */
  const [registered, setRegistered] = useState<boolean | null>(null);
  /* THE TAP IS THE POINT. iOS only raises the permission prompt from a real
     user gesture, and only subscribes to push after that — so the toggle both
     asks and subscribes, here, rather than anything happening on page load.
     Turning the last one off gives the subscription back. */
  const toggle = async (key: keyof NotificationPrefs) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next); saveNotificationPrefs(next);
    if (!next.morningWorkout && !next.injuryFollowUp && !next.partnerTrained) {
      await disablePush();
      return;
    }
    const granted = next[key] && permission !== 'granted' ? await requestNotificationPermission() : permission;
    setPermission(granted);
    /* Every change re-syncs, not just the ones that switch something on: the
       server reads these preferences off the subscription now, so turning the
       morning brief OFF is a message the server has to receive too. */
    /* An explicit change, so the new values travel — this is the only call
       that may alter what the server has stored. */
    if (granted === 'granted') setRegistered(await syncPushSubscription({ morningWorkout: next.morningWorkout, partnerTrained: next.partnerTrained }));
  };
  return <section className="card notification-settings">
    <header><span className="eyebrow">NOTIFICATIONS</span><h3>Check-ins from Forge</h3></header>
    <div className="toggle-row"><div><strong>Morning workout</strong><span>Your day's training, each morning.</span></div><input type="checkbox" aria-label="Morning workout notifications" checked={prefs.morningWorkout} onChange={() => void toggle('morningWorkout')} /></div>
    <div className="toggle-row"><div><strong>Injury follow-ups</strong><span>A daily check-in while a body-log entry is active.</span></div><input type="checkbox" aria-label="Injury follow-up notifications" checked={prefs.injuryFollowUp} onChange={() => void toggle('injuryFollowUp')} /></div>
    <div className="toggle-row"><div><strong>A partner trained</strong><span>Once a day, when a training partner logs a session.</span></div><input type="checkbox" aria-label="Training partner notifications" checked={prefs.partnerTrained} onChange={() => void toggle('partnerTrained')} /></div>
    {!notificationsSupported() && <small className="notification-note">This browser does not support system notifications; Ask Forge still shows every check-in.</small>}
    {/* THE ONE THING IOS WILL NOT DO FROM A BROWSER TAB. Web push reaches an
        iPhone only when Forge has been added to the Home Screen, so anyone
        reading this in Safari is told what to do about it rather than left
        wondering why the toggles change nothing. */}
    {notificationsSupported() && !installedToHomeScreen() && isIos() && <small className="notification-note">
      On iPhone, notifications only arrive when Forge is on your Home Screen. Tap Share, then <strong>Add to Home Screen</strong>, and open it from there.
    </small>}
    {registered === false && permission === 'granted' && <small className="notification-note">This device could not be registered for notifications — check your connection and tap a switch again.</small>}
    {registered === true && <small className="notification-note">This device is registered. Notifications will arrive with Forge closed.</small>}
    {notificationsSupported() && permission === 'denied' && (prefs.morningWorkout || prefs.injuryFollowUp) && <small className="notification-note">Notifications are blocked in your browser settings — the check-ins will appear here on the Coach tab instead.</small>}
  </section>;
}
