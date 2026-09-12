import { useMemo, useState } from 'react';
import { useGoals } from '../features/goals/GoalsProvider';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { mileageGap, applyMileageGap } from '../lib/mileageGap';

/* AN ENDURANCE GOAL THE PLAN IS NOT BUILDING FOR SHOULD SAY SO, AND OFFER THE FIX.

   Preston asked for a sub-19 5K and Forge wrote him fourteen miles a week — a
   number the pace cannot be reached on — and said nothing, because his own
   ceiling in settings sat below what the pace is built on. Forge knew: it
   computes the volume a pace needs in order to discount its own predictions by
   the shortfall. It just kept the answer to itself, or buried it in a paragraph
   of advice at the bottom of a goal.

   So the gap is stated on the plan, in miles, and the change is one tap. The
   decision itself lives in lib/mileageGap.ts, where it can be tested; this is
   the card that shows it. Nothing moves without the athlete pressing it, and
   the plan is rebuilt afterwards so the new bound is actually used. */

export function MileageGate({ onChanged }: { onChanged?: () => void } = {}) {
  const { goals } = useGoals();
  const { records } = useWorkoutHistory();
  const { setup, saveSetup } = useProfileSetup();
  const [done, setDone] = useState(false);
  const metric = setup?.units === 'Metric';
  const unit = metric ? 'km' : 'mi';
  const show = (miles: number) => Math.round(metric ? miles * 1.609344 : miles);

  const gap = useMemo(() => mileageGap(goals, records, setup), [goals, records, setup]);

  if (!gap || done) return null;

  const apply = () => {
    if (!setup) return;
    saveSetup(applyMileageGap(setup, gap));
    setDone(true);
    onChanged?.();
  };

  return <section className="card mileage-gate">
    <span className="eyebrow">Not enough running for this goal</span>
    <p className="mileage-gate-say">
      <strong>{gap.goal}</strong> is normally built on about <strong>{show(gap.needed)} {unit} a week</strong>.{' '}
      {gap.kind === 'ceiling'
        ? <>Your ceiling is set to {show(gap.ceiling)}, so Forge will never plan above it — the goal and the setting contradict each other.</>
        : <>You are running about {show(gap.running)}, and the block starts from there, so it will not get to {show(gap.needed)} before the date.</>}
    </p>
    <div className="mileage-gate-actions">
      <button type="button" className="button" onClick={apply}>
        {gap.kind === 'ceiling' ? `Raise my ceiling to ${show(gap.target)} ${unit}` : `Start the block at ${show(gap.target)} ${unit}`}
      </button>
      <button type="button" className="text-button" onClick={() => setDone(true)}>Leave it</button>
    </div>
    <small>
      {gap.kind === 'ceiling'
        ? 'A ceiling is permission, not a jump — Forge still climbs no more than 10% a week.'
        : 'One step up from what you already run. Everything after it climbs at the same rate as before.'}
    </small>
  </section>;
}
