import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useCheckIns } from '../features/training/CheckInProvider';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { dueCheckIn } from '../lib/checkInSchedule';
import { sessionVerdicts } from '../features/training/sessionVerdicts';
import { readLocalAiPlan } from '../features/training/aiPlanService';
import { paceModel } from '../lib/paceModel';
import { enduranceTarget } from '../lib/qualitySession';
import { useGoals } from '../features/goals/GoalsProvider';
import { medianWeeklyMiles, longestContinuousRun } from '../lib/goalTrajectory';
import { readinessFromCheckIn, type CheckInScale } from '../lib/readiness';
import { localDayIso } from '../lib/time';

/* THE COACH ASKS, AND THE ANSWER CHANGES SOMETHING.

   Three questions, one tap each, and the next one appears as the last is
   answered — so there is one thing on screen at a time and the whole exchange
   is about four seconds. A form with fifteen radio buttons gets dismissed; a
   question gets answered.

   The last card is the part that makes it worth doing: it says what Forge is
   going to do differently, in the athlete's own numbers. A check-in that
   vanishes without visible consequence teaches people that answering is
   pointless, and then the data stops. */

type Step = 'legs' | 'energy' | 'sleep' | 'done';

const LEGS: Array<{ label: string; value: CheckInScale }> = [
  { label: 'Fresh', value: 1 },
  { label: 'A bit sore', value: 3 },
  { label: 'Beat up', value: 5 },
];
const ENERGY: Array<{ label: string; value: CheckInScale }> = [
  { label: 'Good', value: 5 },
  { label: 'Okay', value: 3 },
  { label: 'Flat', value: 1 },
];
const SLEEP: Array<{ label: string; value: CheckInScale }> = [
  { label: 'Slept well', value: 5 },
  { label: 'Okay', value: 3 },
  { label: 'Badly', value: 1 },
];

const QUESTION: Record<Exclude<Step, 'done'>, string> = {
  legs: 'How do the legs feel?',
  energy: 'Energy today?',
  sleep: 'And last night?',
};

/* What the answer actually buys, said plainly. These are the thresholds the
   engine really uses — below 55 hard training is off, below 70 volume is
   trimmed — so the sentence is a description, not a reassurance. */
function outcome(readiness: number): { headline: string; detail: string } {
  if (readiness < 55) return {
    headline: 'Backing today off',
    detail: 'No hard running or heavy singles today. Forge will hold the load rather than progress it, and pick the block back up when you have recovered.',
  };
  if (readiness < 70) return {
    headline: 'Easing the volume',
    detail: 'Today stands, with the easy running trimmed. If the next couple of days read the same, Forge will suggest reshaping the block.',
  };
  return {
    headline: 'Good to go',
    detail: 'Nothing to change — today is prescribed as written.',
  };
}

export function CoachCheckIn({ onClose }: { onClose?: () => void } = {}) {
  const { checkIns, answer, loading } = useCheckIns();
  const { records, loading: historyLoading } = useWorkoutHistory();
  const { setup } = useProfileSetup();
  const { goals } = useGoals();
  const { pathname } = useLocation();
  const today = localDayIso();
  const [step, setStep] = useState<Step>('legs');
  const [legs, setLegs] = useState<CheckInScale>(3);
  const [energy, setEnergy] = useState<CheckInScale>(3);
  const [closed, setClosed] = useState(false);

  /* ASKED ONLY WHEN THERE IS A REASON, and never off half-loaded history — "how
     did that session feel" about a session that has not arrived yet is a
     question about the network. */
  /* NOT WHILE THEY ARE TRAINING. Someone who opened the app on the gym floor
     to log a set has told you what they came for, and standing in front of it
     to ask how their legs feel is precisely the noise this is supposed to
     avoid. The question keeps until they are not mid-session. */
  const interrupting = pathname === '/workout';
  /* WHAT THE COACH SAW, so it can open with that rather than with small talk.
     "How did you pull up" is a question anyone could ask; "you faded over the
     last few reps — was that the legs or did it go out hot" is the reason an
     athlete bothers to answer. */
  const verdictFor = useMemo(() => {
    const stored = readLocalAiPlan();
    if (!stored) return undefined;
    const runGoal = enduranceTarget(goals);
    const weekly = medianWeeklyMiles(records, 10);
    const judged = sessionVerdicts(records, stored,
      (setup?.splitDays || []).map(day => ({ name: day.name, dayType: day.type })), {
        runningDays: Number(setup?.runningDays) || 0,
        minWeeklyMileage: Number(setup?.minWeeklyMileage) || 0,
        maxWeeklyMileage: Number(setup?.maxWeeklyMileage) || 0,
        weeklyMileage: Number(setup?.weeklyMileage) || 0,
        recentWeeklyMileage: weekly,
        recentLongestRun: longestContinuousRun(records),
        goalPaceSecondsPerMile: runGoal?.paceSecondsPerMile,
        goalMiles: runGoal?.miles,
        paces: paceModel(records, runGoal, today, weekly),
      }, today);
    const byRecord = new Map(judged.map(verdict => [verdict.recordId, verdict]));
    return (recordId: string) => byRecord.get(recordId) || null;
  }, [records, goals, setup, today]);

  const due = useMemo(
    () => (loading || historyLoading || !setup?.completedAt || interrupting ? null : dueCheckIn(records, checkIns, today, verdictFor)),
    [loading, historyLoading, setup?.completedAt, interrupting, records, checkIns, today, verdictFor],
  );
  /* LATCHED THE MOMENT IT OPENS. Answering writes today's check-in, which makes
     dueCheckIn correctly say there is nothing to ask — and unmounted the card
     mid-flow, so the one screen that tells the athlete what their answer
     changed was never seen. The question is asked once; the conversation then
     belongs to the athlete until they close it. */
  const [ask, setAsk] = useState<ReturnType<typeof dueCheckIn>>(null);
  useEffect(() => { setAsk(current => current || due); }, [due]);

  const [result, setResult] = useState<number | null>(null);
  if (!ask || closed) return null;

  const finish = (sleep: CheckInScale) => {
    const checkIn = { date: today, legs, energy, sleep, aboutRecordId: ask.aboutRecordId, prompt: ask.prompt };
    answer(checkIn);
    setResult(readinessFromCheckIn(checkIn));
    setStep('done');
  };

  const pick = (current: Step, value: CheckInScale) => {
    if (current === 'legs') { setLegs(value); setStep('energy'); return; }
    if (current === 'energy') { setEnergy(value); setStep('sleep'); return; }
    finish(value);
  };

  const dismiss = () => { setClosed(true); onClose?.(); };
  const options = step === 'legs' ? LEGS : step === 'energy' ? ENERGY : SLEEP;
  const said = result === null ? null : outcome(result);

  return <div className="coach-checkin-backdrop" role="dialog" aria-modal="true" aria-label="Check in with your coach">
    <section className="card coach-checkin">
      <span className="eyebrow">Forge</span>
      {step === 'done' && said ? <>
        <p className="coach-checkin-ask">{said.headline}</p>
        <p className="coach-checkin-detail">{said.detail}</p>
        <div className="coach-checkin-actions">
          <button type="button" className="button" onClick={dismiss}>Got it</button>
        </div>
      </> : <>
        <p className="coach-checkin-ask">{ask.prompt}</p>
        <p className="coach-checkin-detail">{QUESTION[step as Exclude<Step, 'done'>]}</p>
        <div className="coach-checkin-options">
          {options.map(option => <button type="button" key={option.label} onClick={() => pick(step, option.value)}>{option.label}</button>)}
        </div>
        <div className="coach-checkin-foot">
          <i aria-hidden="true" className="coach-checkin-progress">{step === 'legs' ? '1' : step === 'energy' ? '2' : '3'} of 3</i>
          <button type="button" className="text-button" onClick={dismiss}>Not now</button>
        </div>
      </>}
    </section>
  </div>;
}
