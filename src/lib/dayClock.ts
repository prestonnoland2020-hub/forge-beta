import { useSyncExternalStore } from 'react';
import { localDayIso } from './time';

/* THE APP'S "TODAY", KEPT CURRENT. A phone keeps the app alive in the
   background for days. Opened the morning after, nothing had re-rendered
   since the night before, so History still sat on the 31st and Today could
   still be yesterday's plan. Today is re-read whenever the app comes back to
   the front, gains focus, or a minute passes, and anything reading it
   re-renders the moment the date changes. */
let current = localDayIso();
const listeners = new Set<() => void>();
const check = () => {
  const next = localDayIso();
  if (next === current) return;
  current = next;
  listeners.forEach(listener => listener());
};
let started = false;
const start = () => {
  if (started || typeof window === 'undefined') return;
  started = true;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  window.addEventListener('focus', check);
  window.addEventListener('pageshow', check);
  window.setInterval(check, 60_000);
};

export function subscribeToDay(listener: () => void) {
  start();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const currentDay = () => current;

/* Today's local date (YYYY-MM-DD), re-rendering the caller when it changes. */
export const useToday = () => useSyncExternalStore(subscribeToDay, currentDay, currentDay);
