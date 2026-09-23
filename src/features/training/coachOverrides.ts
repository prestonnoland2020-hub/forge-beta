import { useEffect, useState } from 'react';
import type { TodayOverride } from '../../lib/coachActions';

/* WHERE A COACH ACTION LANDS. One day's override — rest, a different split
   day, a time cap — dated so it expires on its own; there is nothing to
   clean up tomorrow. Local storage, like the body log's cache: it is read by
   the Today card on this device and does not need to outlive the day. */

const KEY = 'forge-coach-override-v1';
const EVENT = 'forge-coach-override-changed';

export const readTodayOverride = (todayIso: string): TodayOverride | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TodayOverride;
    return parsed && parsed.date === todayIso ? parsed : null;
  } catch { return null; }
};

export const writeTodayOverride = (override: TodayOverride | null) => {
  try {
    if (override) localStorage.setItem(KEY, JSON.stringify(override)); else localStorage.removeItem(KEY);
  } catch { /* storage unavailable: the action still applied for this render */ }
  window.dispatchEvent(new Event(EVENT));
};

export function useTodayOverride(todayIso: string): TodayOverride | null {
  const [override, setOverride] = useState<TodayOverride | null>(() => readTodayOverride(todayIso));
  useEffect(() => {
    const refresh = () => setOverride(readTodayOverride(todayIso));
    refresh();
    window.addEventListener(EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(EVENT, refresh); window.removeEventListener('storage', refresh); };
  }, [todayIso]);
  return override;
}

/* EVERY ACTION THE ATHLETE APPROVED, appended for the coach to read back —
   "you asked me to rest on Tuesday" is only possible if Tuesday was written
   down. Capped, oldest dropped. */
const LOG_KEY = 'forge-coach-actions-v1';
export type AppliedAction = { date: string; type: string; label: string };
export const readAppliedActions = (): AppliedAction[] => {
  try { const raw = localStorage.getItem(LOG_KEY); const parsed = raw ? JSON.parse(raw) as AppliedAction[] : []; return Array.isArray(parsed) ? parsed : []; } catch { return []; }
};
export const appendAppliedActions = (entries: AppliedAction[]) => {
  try { localStorage.setItem(LOG_KEY, JSON.stringify([...readAppliedActions(), ...entries].slice(-60))); } catch { /* best effort */ }
};
