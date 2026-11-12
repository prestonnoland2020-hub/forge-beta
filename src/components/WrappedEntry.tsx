import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { useBilling } from '../features/billing/BillingProvider';
import { FIRST_WRAPPED_YEAR, wrappedWindow } from '../lib/wrapped';
import { Icon } from './Icon';
import { askWrappedReminder, keepWrappedReminder, wrappedReminderState, type ReminderState } from '../lib/wrappedReminder';

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

/* THE WEEKS BEFORE: from Dec 1, a card on Today in the iPhone app — "Your
   2026 Wrapped drops Jan 1 · Remind me" — so the permission prompt comes
   from a tap that says what it is for. Only for someone with a year to wrap
   (3+ training days); gone once the reminder is set, declined, or closed. */
export function WrappedReminderCard() {
  const { records } = useWorkoutHistory();
  const now = new Date();
  const year = now.getFullYear();
  const december = now.getMonth() === 11;
  const enough = useMemo(() => new Set(records.filter(record => String(record.date || '').startsWith(`${year}-`)).map(record => record.date)).size >= 3, [records, year]);
  const key = `forge-wrapped-remind-${year}`;
  const [state, setState] = useState<ReminderState | null>(null);
  const [closed, setClosed] = useState(() => { try { return localStorage.getItem(key) === '1'; } catch { return false; } });
  useEffect(() => {
    if (year < FIRST_WRAPPED_YEAR || !enough) return;
    void keepWrappedReminder(year);
    if (december) void wrappedReminderState(year).then(setState);
  }, [year, enough, december]);
  if (!december || !enough || closed || state !== 'can-ask') return null;
  const close = () => { setClosed(true); try { localStorage.setItem(key, '1'); } catch { /* per-device */ } };
  return <div style={{ position: 'relative' }}>
    <button type="button" className="wr-entry wr-remind" onClick={() => { void askWrappedReminder(year).then(next => { setState(next); if (next !== 'can-ask') close(); }); }}>
      <b className="wr-entry-year">{year}</b>
      <span>Your Forge Wrapped drops Jan 1<small>Remind me when it's out</small></span>
      <Icon name="arrow" size={20} />
    </button>
    <button type="button" className="wr-entry-close" aria-label="No reminder" onClick={close}><Icon name="close" size={14} /></button>
  </div>;
}
