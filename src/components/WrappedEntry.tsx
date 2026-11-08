import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { useBilling } from '../features/billing/BillingProvider';
import { FIRST_WRAPPED_YEAR, wrappedWindow } from '../lib/wrapped';
import { Icon } from './Icon';

/* Whether last year has a Wrapped worth opening: a Forge year, with a few
   logged days in it. */
export function useWrappedYear(): number | null {
  const { records } = useWorkoutHistory();
  const { year } = wrappedWindow();
  return useMemo(() => {
    if (year < FIRST_WRAPPED_YEAR) return null;
    const days = new Set(records.filter(record => String(record.date || '').startsWith(`${year}-`)).map(record => record.date));
    return days.size >= 3 ? year : null;
  }, [records, year]);
}

/* THE CARD ON TODAY, through January. Free athletes see it too — it opens
   onto their headline number and the lock. It leaves once opened or closed. */
export function WrappedEntry() {
  const year = useWrappedYear();
  const { isPro } = useBilling();
  const key = `forge-wrapped-seen-${year}`;
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(key) === '1'; } catch { return false; } });
  if (!year || !wrappedWindow().featured || hidden) return null;
  const hide = () => { setHidden(true); try { localStorage.setItem(key, '1'); } catch { /* per-device */ } };
  return <div style={{ position: 'relative' }}>
    <Link className="wr-entry" to="/wrapped">
      <b className="wr-entry-year">{year}</b>
      <span>Your Forge Wrapped is here<small>{isPro ? 'Your year of training, told back to you' : 'Forge Pro · see your year'}</small></span>
      <Icon name={isPro ? 'arrow' : 'lock'} size={20} />
    </Link>
    <button type="button" className="wr-entry-close" aria-label="Hide Wrapped" onClick={hide}><Icon name="close" size={14} /></button>
  </div>;
}
