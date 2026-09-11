import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

/* WHAT HAS NOT REACHED THE ACCOUNT, IN ONE PLACE.

   Every provider wrote its own answer to "did that save?" — the workout history
   had a banner, goals had a line on their own page, and the exercise library,
   the split and athlete settings had a console.warn nobody reads. So an athlete
   whose account write failed looked exactly like one whose succeeded, and the
   only way to find out was to sign in somewhere else and notice the work was
   gone. That is how a goals table which had been rejecting every write since
   the day it was created went unnoticed for months.

   A failure is named by WHAT failed rather than by which provider reported it,
   so the same thing failing twice is one message and a success clears it. */

export type SyncFailure = { key: string; label: string; message: string; retry?: () => void };
type Value = {
  failures: SyncFailure[];
  /* Pass a failure to record it, or null to say that thing is saving again. */
  report: (key: string, failure: Omit<SyncFailure, 'key'> | null) => void;
  retryAll: () => void;
};
const Context = createContext<Value | null>(null);

export function SyncStatusProvider({ children }: { children: ReactNode }) {
  const [failures, setFailures] = useState<SyncFailure[]>([]);
  /* `report` has to be stable — providers call it from effects, and a new
     identity on every render would re-run them forever. */
  const held = useRef<SyncFailure[]>([]);
  const report = useCallback((key: string, failure: Omit<SyncFailure, 'key'> | null) => {
    const without = held.current.filter(item => item.key !== key);
    const next = failure ? [...without, { key, ...failure }] : without;
    /* Nothing changed: do not re-render every screen because a save that was
       already fine is still fine. */
    const same = next.length === held.current.length
      && next.every((item, index) => item.key === held.current[index]?.key && item.message === held.current[index]?.message);
    if (same) return;
    held.current = next;
    setFailures(next);
  }, []);
  const retryAll = useCallback(() => { held.current.forEach(item => item.retry?.()); }, []);
  const value = useMemo(() => ({ failures, report, retryAll }), [failures, report, retryAll]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSyncStatus(): Value {
  const value = useContext(Context);
  /* Deliberately not a throw. This is a reporting channel, not a data source —
     a provider mounted outside it should keep working, silently, rather than
     take the whole app down over a banner. */
  return value || { failures: [], report: () => undefined, retryAll: () => undefined };
}
