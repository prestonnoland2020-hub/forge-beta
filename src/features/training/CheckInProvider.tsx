import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadCheckIns, loadLocalCheckIns, saveCheckIn } from './checkInService';
import { isStruggling, strugglingStreak, readinessFromCheckIn, liveCheckIn, type CheckIn } from '../../lib/readiness';
import { localDayIso } from '../../lib/time';

/* ONE COPY OF THE ANSWERS, because three surfaces read them: the recovery
   state that steers training, the coach that has to know what was said, and
   the card that decides whether to ask again. A hook per consumer would give
   each of them its own state and let them disagree about whether today has
   been answered. */

type Value = {
  checkIns: CheckIn[];
  loading: boolean;
  /* The one still allowed to steer today, or null. */
  live: CheckIn | null;
  answer: (checkIn: CheckIn) => void;
  /* Three or more rough mornings out of the last five: the block is asking for
     more than is being absorbed. */
  struggling: boolean;
  strugglingCount: number;
};

const Context = createContext<Value | null>(null);

export function CheckInProvider({ children }: { children: ReactNode }) {
  const [checkIns, setCheckIns] = useState<CheckIn[]>(() => loadLocalCheckIns());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void loadCheckIns().then(loaded => { if (active) { setCheckIns(loaded); setLoading(false); } });
    return () => { active = false; };
  }, []);

  const answer = useCallback((checkIn: CheckIn) => {
    setCheckIns(current => {
      const without = current.filter(item => item.date !== checkIn.date);
      return [checkIn, ...without].sort((a, b) => b.date.localeCompare(a.date));
    });
    void saveCheckIn(checkIn);
  }, []);

  const value = useMemo<Value>(() => ({
    checkIns,
    loading,
    live: liveCheckIn(checkIns, localDayIso()),
    answer,
    struggling: isStruggling(checkIns),
    strugglingCount: strugglingStreak(checkIns),
  }), [checkIns, loading, answer]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useCheckIns() {
  const value = useContext(Context);
  if (!value) throw new Error('useCheckIns must be used inside CheckInProvider');
  return value;
}

export { readinessFromCheckIn };
export type { CheckIn };
