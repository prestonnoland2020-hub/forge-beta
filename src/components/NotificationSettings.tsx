import { useState } from 'react';
import { loadNotificationPrefs, notificationPermission, notificationsSupported, requestNotificationPermission, saveNotificationPrefs, type NotificationPrefs } from '../lib/notifications';

export function NotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => loadNotificationPrefs());
  const [permission, setPermission] = useState(notificationPermission());
  const toggle = async (key: keyof NotificationPrefs) => {
    const next = { ...prefs, [key]: !prefs[key] };
    if (next[key] && permission === 'default') setPermission(await requestNotificationPermission());
    setPrefs(next); saveNotificationPrefs(next);
  };
  return <section className="card notification-settings">
    <header><span className="eyebrow">NOTIFICATIONS</span><h3>Check-ins from Forge</h3></header>
    <div className="toggle-row"><div><strong>Morning workout</strong><span>Your day's training, each morning you open Forge.</span></div><input type="checkbox" checked={prefs.morningWorkout} onChange={() => void toggle('morningWorkout')} /></div>
    <div className="toggle-row"><div><strong>Injury follow-ups</strong><span>A daily check-in while a body-log entry is active.</span></div><input type="checkbox" checked={prefs.injuryFollowUp} onChange={() => void toggle('injuryFollowUp')} /></div>
    {!notificationsSupported() && <small className="notification-note">This browser does not support system notifications; the Coach tab still shows every check-in.</small>}
    {notificationsSupported() && permission === 'denied' && (prefs.morningWorkout || prefs.injuryFollowUp) && <small className="notification-note">Notifications are blocked in your browser settings — the check-ins will appear here on the Coach tab instead.</small>}
  </section>;
}
