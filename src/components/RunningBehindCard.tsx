import { useMemo, useState } from 'react';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { runningBehind } from '../lib/runningBehind';
import { NumberInput } from './NumberInput';
import { tap } from '../lib/haptics';
import { Link } from 'react-router-dom';
import { readLocalAiPlan } from '../features/training/aiPlanService';

/* THE COACH SAYING THE MILEAGE IS TOO HIGH, WITH THE NUMBERS IN YOUR HANDS.

   runningBehind finds two completed weeks run well under the plan. This says
   so in miles, offers a new weekly range drawn from what was actually run,
   and puts that range in two fields the athlete can change before anything
   moves. "Save and rebuild" writes the range where the plan reads it and
   opens the rebuild with the reason already written; "Just save" changes the
   range and leaves the block to pick it up as it is. "Not now" holds until
   the weeks or the numbers change. */

const DISMISS_KEY = 'forge-running-behind-v1';
const dismissed = (fingerprint: string) => { try { return localStorage.getItem(DISMISS_KEY) === fingerprint; } catch { return false; } };
const remember = (fingerprint: string) => { try { localStorage.setItem(DISMISS_KEY, fingerprint); } catch { /* private mode */ } };

export function RunningBehindCard({ startDate, plannedMiles, onBounds, onRebuild }: {
  startDate?: string;
  plannedMiles: number[];
  /* Where the plan keeps its weekly range; the card changes it there. */
  onBounds: (min: number, max: number) => void;
  onRebuild: (instruction: string) => void;
}) {
  const { records } = useWorkoutHistory();
  const { setup } = useProfileSetup();
  const metric = setup?.units === 'Metric';
  const unit = metric ? 'km' : 'mi';
  const toShow = (miles: number) => Math.round(metric ? miles * 1.609344 : miles);
  const toMiles = (value: number) => metric ? value / 1.609344 : value;
  const behind = useMemo(() => runningBehind(startDate, plannedMiles, records), [startDate, plannedMiles, records]);
  const [hidden, setHidden] = useState(false);
  const [min, setMin] = useState<number | null>(null);
  const [max, setMax] = useState<number | null>(null);
  if (!behind || hidden || dismissed(behind.fingerprint)) return null;

  const shownMin = min ?? toShow(behind.suggestMin);
  const shownMax = max ?? toShow(behind.suggestMax);
  const valid = shownMax > 0 && shownMin >= 0 && shownMin <= shownMax;
  const commit = (rebuild: boolean) => {
    if (!valid) return;
    tap();
    const lo = Math.round(toMiles(shownMin)); const hi = Math.round(toMiles(shownMax));
    onBounds(lo, hi);
    remember(behind.fingerprint);
    setHidden(true);
    if (rebuild) onRebuild(`I have been running about ${toShow(behind.ranAvg)} ${unit} a week against ${toShow(behind.plannedAvg)} planned. Rebuild the running around ${shownMin}–${shownMax} ${unit} a week, keep the long run and one quality session, and build up gently from there. Keep the lifting as it is.`);
  };
  const notNow = () => { tap(); remember(behind.fingerprint); setHidden(true); };

  return <section className="card mileage-gate running-behind" aria-label="Running behind the plan">
    <span className="eyebrow">Coach · your running</span>
    <p className="mileage-gate-say">
      You ran <strong>{behind.weeks.map(week => toShow(week.ran)).join(' and ')} {unit}</strong> the last two weeks, against <strong>{behind.weeks.map(week => toShow(week.planned)).join(' and ')} {unit}</strong> planned.
      A plan built on miles that aren’t happening sets up every long run and quality day to fail — let’s lower it to what fits your week.
    </p>
    <div className="running-behind-fields">
      <label><span>From</span><NumberInput value={shownMin} onChange={value => setMin(value ?? 0)} allowDecimal={false} blankZero={false} inputMode="numeric" aria-label={`Lowest weekly ${unit}`} /></label>
      <label><span>To</span><NumberInput value={shownMax} onChange={value => setMax(value ?? 0)} allowDecimal={false} inputMode="numeric" aria-label={`Highest weekly ${unit}`} /></label>
      <small>{unit} a week</small>
    </div>
    {!valid && <p className="running-behind-error" role="alert">The first number has to be no more than the second.</p>}
    <div className="mileage-gate-actions">
      <button type="button" className="button" disabled={!valid} onClick={() => commit(true)}>Save and rebuild plan</button>
      <button type="button" className="text-button" disabled={!valid} onClick={() => commit(false)}>Just save the range</button>
    </div>
    <div className="mileage-gate-foot">
      <small>Suggested from what you actually ran. Forge still climbs no more than 10% a week.</small>
      <button type="button" className="text-button" onClick={notNow}>Not now</button>
    </div>
  </section>;
}

/* THE SAME CHECK, SAID ON TODAY. The card with the fields lives on Plan,
   where the rebuild is; Today is where the athlete actually looks, so the
   coach raises it there and points the way. Planned miles are the stored
   block's, held inside the athlete's own range — the same bounds the Plan tab
   resolves them with. */
export function RunningBehindNudge() {
  const { records } = useWorkoutHistory();
  const { setup } = useProfileSetup();
  const stored = useMemo(() => readLocalAiPlan(), []);
  const plannedMiles = useMemo(() => {
    const min = Number(setup?.minWeeklyMileage) || 0; const max = Number(setup?.maxWeeklyMileage) || Infinity;
    return (stored?.plan.weeks || []).map(week => Math.max(min, Math.min(max, Number(week.mileage) || 0)));
  }, [stored, setup?.minWeeklyMileage, setup?.maxWeeklyMileage]);
  const behind = useMemo(() => runningBehind(stored?.startDate, plannedMiles, records), [stored, plannedMiles, records]);
  if (!behind || dismissed(behind.fingerprint)) return null;
  const metric = setup?.units === 'Metric';
  const show = (miles: number) => Math.round(metric ? miles * 1.609344 : miles);
  const unit = metric ? 'km' : 'mi';
  return <section className="card running-behind-nudge" aria-label="Running behind the plan">
    <span className="eyebrow">Coach</span>
    <p>You’ve run about <strong>{show(behind.ranAvg)} {unit}</strong> a week against <strong>{show(behind.plannedAvg)}</strong> planned. Let’s lower your weekly mileage so the plan fits your week.</p>
    <Link className="button" to="/plan">Adjust my mileage</Link>
  </section>;
}
