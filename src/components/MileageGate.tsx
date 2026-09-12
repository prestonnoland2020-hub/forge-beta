import { useMemo, useState } from 'react';
import { useGoals } from '../features/goals/GoalsProvider';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { mileageGap, applyMileageGap, applyMileageRamp, type MileageGap } from '../lib/mileageGap';
import type { CreatedGoal } from './GoalBuilder';

/* AN ENDURANCE GOAL THE PLAN IS NOT BUILDING FOR SHOULD SAY SO, AND OFFER THE FIX.

   Preston asked for a sub-19 5K and Forge wrote him fourteen miles a week — a
   number the pace cannot be reached on — and said nothing, because his own
   ceiling in settings sat below what the pace is built on. Forge knew: it
   computes the volume a pace needs in order to discount its own predictions by
   the shortfall. It just kept the answer to itself.

   So the gap is stated in miles, with the ramp that closes it and the date it
   closes by, and the change is one tap. Two things can be offered:

     - BUILD THE RAMP. The ceiling goes to what the goal needs and the floor to
       the ramp's first week, so the planner both may and must climb. This is
       the whole answer, and it is the default.
     - The single smallest unblocking change — raise the ceiling, or step the
       floor up once — for an athlete who wants to move slower than that.

   Nothing moves without a press, the climb is 10% a week with a back-off every
   fourth, and the plan is rebuilt afterwards so the new bounds are used. */

function GateCard({ gap, unit, show, onBuild, onMinimum, onDismiss, heading }: {
  gap: MileageGap; unit: string; show: (miles: number) => number;
  onBuild: () => void; onMinimum: () => void; onDismiss: () => void; heading: string;
}) {
  const first = gap.ramp.weeks[0];
  const peak = gap.ramp.weeks.find(week => week.miles >= gap.ramp.to);
  return <section className="card mileage-gate">
    <span className="eyebrow">{heading}</span>
    <p className="mileage-gate-say">
      <strong>{gap.goal}</strong> is normally built on about <strong>{show(gap.needed)} {unit} a week</strong>.{' '}
      {gap.kind === 'ceiling'
        ? <>Your ceiling is set to {show(gap.ceiling)}, so Forge will never plan above it{gap.climbNeeded ? null : gap.hasBaseline ? <> — below even the {show(gap.base)} you already run</> : null}.</>
        : <>You are running about {show(gap.running)}, and the block starts from there.</>}
    </p>

    {/* THE RAMP IS THE ANSWER, SO IT IS SHOWN BEFORE IT IS AGREED TO — but only
        when there is a real number to climb from. Drawing "1 mile → 22 miles,
        52 weeks" off an empty history is a figure invented to fill a card. */}
    {gap.climbNeeded ? <div className="mileage-ramp">
      <div className="mileage-ramp-line">
        <b>{show(gap.ramp.from)}</b><i aria-hidden="true" /><b>{show(gap.ramp.to)} {unit}</b>
      </div>
      <p>
        {gap.arrives
          ? <>About <strong>{gap.ramp.weeksToTarget} weeks</strong> at 10% a week, with an easier week every fourth{peak ? <> — {show(first?.miles || gap.ramp.from)} {unit} this week, {show(peak.miles)} by week {peak.week}</> : null}.</>
          : <>At a safe 10% a week this takes <strong>{gap.ramp.weeksToTarget} weeks</strong> and you have {gap.weeksAvailable}. You would reach about {show(gap.reached)} {unit} — {gap.weeksShort} week{gap.weeksShort === 1 ? '' : 's'} short.</>}
      </p>
    </div> : <div className="mileage-ramp">
      <p>{gap.hasBaseline
        ? <>Nothing to build — you already run about {show(gap.base)} {unit}. The setting is the only thing in the way.</>
        : <>Forge does not know what you are running yet. Log a week of running, or set your weekly mileage in your split, and it will draw the climb from there.</>}</p>
    </div>}

    <div className="mileage-gate-actions">
      {gap.climbNeeded && <button type="button" className="button" onClick={onBuild}>Build the ramp</button>}
      <button type="button" className={gap.climbNeeded ? 'text-button' : 'button'} onClick={onMinimum}>
        {gap.kind === 'ceiling'
          ? `${gap.climbNeeded ? 'Just raise' : 'Raise'} my ceiling to ${show(gap.target)} ${unit}`
          : `${gap.climbNeeded ? 'Just step' : 'Step'} up to ${show(gap.target)} ${unit}`}
      </button>
    </div>
    <div className="mileage-gate-foot">
      <small>
        {!gap.climbNeeded ? 'Nothing changes until you press one of these.'
          : gap.arrives ? 'Forge climbs no more than 10% a week and never past your ceiling.'
          : 'Forge will not compress this to make the date — moving the target is the honest alternative.'}
      </small>
      <button type="button" className="text-button" onClick={onDismiss}>Leave it</button>
    </div>
  </section>;
}

/* The standing alert on Plan and Goals. */
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
  const commit = (next: typeof setup) => { if (next) saveSetup(next); setDone(true); onChanged?.(); };

  return <GateCard
    gap={gap} unit={unit} show={show}
    heading="Not enough running for this goal"
    onBuild={() => commit(setup && applyMileageRamp(setup, gap))}
    onMinimum={() => commit(setup && applyMileageGap(setup, gap))}
    onDismiss={() => setDone(true)} />;
}

/* THE SAME ANSWER AT THE MOMENT THE GOAL IS MADE.

   Finding out in a week's time that the goal you just set cannot be reached on
   the running you do is worse than being told while you are still looking at
   it. This is shown once, over the builder, on the goal that was just saved —
   and it is never a wall: "Keep the goal" closes it and the goal stands. */
export function MileageCheckOnGoal({ goal, onClose }: { goal: CreatedGoal; onClose: () => void }) {
  const { records } = useWorkoutHistory();
  const { setup, saveSetup } = useProfileSetup();
  const metric = setup?.units === 'Metric';
  const unit = metric ? 'km' : 'mi';
  const show = (miles: number) => Math.round(metric ? miles * 1.609344 : miles);
  /* Asked about this goal alone: a new goal should not be judged by a louder
     one the athlete set months ago. */
  const gap = useMemo(() => mileageGap([goal], records, setup), [goal, records, setup]);

  if (!gap) return null;
  const commit = (next: typeof setup) => { if (next) saveSetup(next); onClose(); };

  return <div className="mileage-check-backdrop" role="dialog" aria-modal="true" aria-label="Running volume for this goal">
    <div className="mileage-check">
      <GateCard
        gap={gap} unit={unit} show={show}
        heading="Before you start on this one"
        onBuild={() => commit(setup && applyMileageRamp(setup, gap))}
        onMinimum={() => commit(setup && applyMileageGap(setup, gap))}
        onDismiss={onClose} />
    </div>
  </div>;
}
