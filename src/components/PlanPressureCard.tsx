import { useMemo } from 'react';
import { useCheckIns } from '../features/training/CheckInProvider';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { useGoals } from '../features/goals/GoalsProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { planPressure } from '../lib/planPressure';
import { sessionTrend } from '../lib/sessionVerdict';
import { sessionVerdicts } from '../features/training/sessionVerdicts';
import { readLocalAiPlan } from '../features/training/aiPlanService';
import { paceModel } from '../lib/paceModel';
import { enduranceTarget } from '../lib/qualitySession';
import { medianWeeklyMiles, longestContinuousRun } from '../lib/goalTrajectory';
import { goalFeasibility } from '../lib/goalFeasibility';
import { bestsFromHistory, FAILURES_BEFORE_BACKOFF, goalLiftNames } from '../features/training/aiPlanService';
import { localDayIso } from '../lib/time';

/* THE COACH SAYING THE BLOCK IS WRONG, AND FIXING IT IN ONE PRESS.

   "Regenerate" was a button the athlete had to decide to press, with a free
   text box they had to think of something to write in. The coach knew when
   the block was not working and had no way to say so, and the rebuild had no
   idea what the coach had seen. They are one action now: the card states the
   evidence, and accepting it opens the rebuild with the instruction already
   written in the athlete's own words, because that is what the planner reads. */

export function PlanPressureCard({ onReshape }: { onReshape: (instruction: string) => void }) {
  const { checkIns } = useCheckIns();
  const { records } = useWorkoutHistory();
  const { goals } = useGoals();
  const { setup } = useProfileSetup();

  const pressure = useMemo(() => {
    /* Lifts that have been backed off: three misses at a rep count is the same
       message as three rough mornings, in a different language. */
    const trackedLifts = goalLiftNames(goals);
    const { misses } = bestsFromHistory(records);
    const backedOffLifts = [...misses.entries()]
      .filter(([lift, byReps]) => trackedLifts.has(lift) && [...byReps.values()].some(count => count >= FAILURES_BEFORE_BACKOFF))
      .map(([lift]) => lift);

    /* Days the athlete trained in the last fortnight against the days their
       split expects. Counting what is missing this way needs no separate
       record of intent and cannot drift out of step with the split. */
    const since = new Date();
    since.setDate(since.getDate() - 14);
    const sinceIso = since.toISOString().slice(0, 10);
    const trained = new Set(records.filter(record => record.date >= sinceIso && record.date <= localDayIso()).map(record => record.date)).size;
    const perWeek = (setup?.splitDays || []).filter(day => day.type !== 'Rest').length || Number(setup?.trainingDays) || 0;
    const expected = perWeek * 2;
    const missedSessions = expected ? Math.max(0, expected - trained) : 0;

    const goalsBehind = goalFeasibility(goals, records, { maxWeeklyMileage: Number(setup?.maxWeeklyMileage) || 0, excludedEfforts: setup?.excludedEfforts || [] })
      .some(verdict => verdict.verdict !== 'reachable');

    /* HOW THE HARD SESSIONS ACTUALLY WENT. Prescribed against run, for every
       quality session in this block — the measurement that says whether the
       paces Forge wrote are the right ones. */
    const stored = readLocalAiPlan();
    const runGoal = enduranceTarget(goals);
    const split = (setup?.splitDays || []).map(day => ({ name: day.name, dayType: day.type }));
    const sessions = sessionTrend(sessionVerdicts(records, stored, split, {
      runningDays: Number(setup?.runningDays) || 0,
      minWeeklyMileage: Number(setup?.minWeeklyMileage) || 0,
      maxWeeklyMileage: Number(setup?.maxWeeklyMileage) || 0,
      weeklyMileage: Number(setup?.weeklyMileage) || 0,
      recentWeeklyMileage: medianWeeklyMiles(records, 10),
      recentLongestRun: longestContinuousRun(records),
      goalPaceSecondsPerMile: runGoal?.paceSecondsPerMile,
      goalMiles: runGoal?.miles,
      paces: paceModel(records, runGoal, localDayIso(), medianWeeklyMiles(records, 10), setup?.excludedEfforts || []),
    }, localDayIso()));

    return planPressure({ checkIns, backedOffLifts, missedSessions, goalsBehind, sessions });
  }, [checkIns, records, goals, setup]);

  if (!pressure) return null;

  return <section className={`card plan-pressure ${pressure.verdict}`}>
    <span className="eyebrow">{pressure.verdict === 'too-much' ? 'This block is asking too much' : 'There is room for more'}</span>
    <p className="plan-pressure-say">{pressure.say}</p>
    <p className="plan-pressure-offer">{pressure.offer}</p>
    <button type="button" className="button" onClick={() => onReshape(pressure.instruction)}>Reshape the block</button>
  </section>;
}
