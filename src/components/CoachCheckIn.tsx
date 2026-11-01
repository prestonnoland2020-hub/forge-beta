import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useCheckIns } from '../features/training/CheckInProvider';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { dueCheckIn } from '../lib/checkInSchedule';
import { useMileageCheckPending } from './MileageGate';
import { sessionVerdicts } from '../features/training/sessionVerdicts';
import { readLocalAiPlan } from '../features/training/aiPlanService';
import { paceModel } from '../lib/paceModel';
import { enduranceTarget } from '../lib/qualitySession';
import { useGoals } from '../features/goals/GoalsProvider';
import { medianWeeklyMiles, longestContinuousRun } from '../lib/goalTrajectory';
import { readinessFromCheckIn, type CheckInScale } from '../lib/readiness';
import { localDayIso } from '../lib/time';

const SNOOZE_KEY = 'forge-checkin-snooze';
const readSnooze = () => { try { return localStorage.getItem(SNOOZE_KEY) || undefined; } catch { return undefined; } };
const writeSnooze = (iso: string) => { try { localStorage.setItem(SNOOZE_KEY, iso); } catch { /* private mode */ } };

/* THE COACH ASKS, AND THE ANSWER CHANGES SOMETHING.

   One question, one tap. Three in a row (legs, then energy, then sleep) read
   as a survey after a hard session, so each answer now carries all three
   readings at once, set so the readiness it produces lands where the old
   three answers did: Feeling good is go, A bit sore is go, Pretty tired eases
   the volume, Beat up backs the day off.

   When the answer changes the day, the card says so in the athlete's terms
   before closing. When it changes nothing, it just closes. */

type Answer = { label: string; legs: CheckInScale; energy: CheckInScale; sleep: CheckInScale };
const ANSWERS: Answer[] = [
  { label: 'Feeling good', legs: 1, energy: 5, sleep: 5 },
  { label: 'A bit sore', legs: 3, energy: 3, sleep: 3 },
  { label: 'Pretty tired', legs: 4, energy: 2, sleep: 3 },
  { label: 'Beat up', legs: 5, energy: 1, sleep: 1 },
];

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
  const [closed, setClosed] = useState(false);

  /* ASKED ONLY WHEN THERE IS A REASON, and never off half-loaded history — "how
     did that session feel" about a session that has not arrived yet is a
     question about the network. */
  /* NOT WHILE THEY ARE TRAINING. Someone who opened the app on the gym floor
     to log a set has told you what they came for, and standing in front of it
     to ask how their legs feel is precisely the noise this is supposed to
     avoid. The question keeps until they are not mid-session. */
  const interrupting = pathname === '/workout';
  /* AND IT YIELDS TO THE MILEAGE GATE. Two backdrops stacked on one app open
     is the fastest way to teach someone to dismiss both without reading
     either. That one is rare, specific and consequential; this one comes round
     again in three days and loses nothing by waiting. */
  const mileageAsking = useMileageCheckPending();
  /* WHAT THE COACH SAW, so it can open with that rather than with small talk.
     "How did you pull up" is a question anyone could ask; "you faded over the
     last few reps — was that the legs or did it go out hot" is the reason an
     athlete bothers to answer. */
  const verdictFor = useMemo(() => {
    const stored = readLocalAiPlan();
    if (!stored) return undefined;
    const runGoal = enduranceTarget(goals);
    const weekly = medianWeeklyMiles(records);
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
        paces: paceModel(records, runGoal, today, weekly, setup?.excludedEfforts || []),
      }, today);
    const byRecord = new Map(judged.map(verdict => [verdict.recordId, verdict]));
    return (recordId: string) => byRecord.get(recordId) || null;
  }, [records, goals, setup, today]);

  const due = useMemo(
    () => (loading || historyLoading || !setup?.completedAt || interrupting || mileageAsking
      ? null
      : dueCheckIn(records, checkIns, today, verdictFor, readSnooze())),
    [loading, historyLoading, setup?.completedAt, interrupting, mileageAsking, records, checkIns, today, verdictFor],
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

  const dismiss = () => { setClosed(true); writeSnooze(today); onClose?.(); };
  const pick = (choice: Answer) => {
    const checkIn = { date: today, legs: choice.legs, energy: choice.energy, sleep: choice.sleep, aboutRecordId: ask.aboutRecordId, prompt: ask.prompt };
    answer(checkIn);
    const readiness = readinessFromCheckIn(checkIn);
    if (readiness >= 70) { setClosed(true); onClose?.(); return; }
    setResult(readiness);
  };
  const said = result === null ? null : outcome(result);

  return <div className="coach-checkin-backdrop" role="dialog" aria-modal="true" aria-label="Check in with your coach">
    <section className="card coach-checkin">
      <span className="eyebrow">Forge</span>
      {said ? <>
        <p className="coach-checkin-ask">{said.headline}</p>
        <p className="coach-checkin-detail">{said.detail}</p>
        <div className="coach-checkin-actions">
          <button type="button" className="button" onClick={dismiss}>Got it</button>
        </div>
      </> : <>
        <p className="coach-checkin-ask">{ask.prompt}</p>
        <div className="coach-checkin-options coach-checkin-one">
          {ANSWERS.map(choice => <button type="button" key={choice.label} onClick={() => pick(choice)}>{choice.label}</button>)}
        </div>
        <div className="coach-checkin-foot">
          <span />
          <button type="button" className="text-button" onClick={dismiss}>Not now</button>
        </div>
      </>}
    </section>
  </div>;
}
