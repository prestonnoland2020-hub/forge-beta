import type { CreatedGoal } from '../components/GoalBuilder';
import { goalFeasibility, weeksUntil, type Feasibility } from './goalFeasibility';
import { expectedRunMiles, goalProgress, type GoalProgress, type MaxMode } from './goalProgress';
import { predictRaceFromLegacyMethod, testedRaceSeconds } from './cardioPrediction';
import { predictionFromNow } from './predictionFromNow';
import { secondsToClock } from './goalInput';
import type { WorkoutRecord } from '../features/training/WorkoutHistoryProvider';
import type { GoalJudge } from './goalSuggestions';

/* ONE AUTHORITY FOR WHAT A GOAL CARD SAYS.

   The Goals screen worked its numbers out inline — the verdict, the time a
   race is worth today, the bar, the projection — and the coach was handed a
   different set (goalTrajectory, goalFeasibility) and left to reconcile them.
   It could tell an athlete "you're at 385" while the card said "365 tested",
   or "on track" beside a card that read "Needs more work".

   Both now read this. The Goals page draws it; the coach is given it in words,
   with the same maxMode the screen is in. */

export type GoalCard = { goal: CreatedGoal; verdict: Feasibility | undefined; enduranceNow: number | null; progress: GoalProgress };

type Setup = Parameters<typeof goalProgress>[3];
type Workouts = Parameters<typeof predictRaceFromLegacyMethod>[3];

export function goalCards(goals: CreatedGoal[], records: WorkoutRecord[], setup: Setup, workouts: Workouts, maxMode: MaxMode): GoalCard[] {
  const excluded = (setup as { excludedEfforts?: string[] } | null | undefined)?.excludedEfforts || [];
  const maxWeeklyMileage = Number((setup as { maxWeeklyMileage?: number | string } | null | undefined)?.maxWeeklyMileage) || 0;
  return goals.map(goal => {
    const verdict = goalFeasibility([goal], records, { maxWeeklyMileage, excludedEfforts: excluded, workoutEfforts: workouts })[0];
    let enduranceNow: number | null = null;
    if (goal.type === 'Endurance') {
      const miles = expectedRunMiles(goal);
      if (miles) {
        /* Estimated is the race predictor; tested is a time actually run at
           the distance — the same switch the strength goals use. */
        const estimate = predictRaceFromLegacyMethod(records, miles, excluded, workouts)?.seconds ?? null;
        enduranceNow = maxMode === 'tested' ? testedRaceSeconds(records, miles, excluded, estimate) : estimate;
      }
    }
    return { goal, verdict, enduranceNow, progress: goalProgress(goal, records, verdict, setup, maxMode, enduranceNow) };
  });
}

/* The card, in the words the coach may quote. */
export function goalCardFacts(cards: GoalCard[], maxMode: MaxMode) {
  return cards.map(({ goal, verdict, progress }) => {
    const model = verdict?.prediction;
    const p = model ? predictionFromNow(model, progress.current) : undefined;
    const race = p?.better === 'lower';
    const unit = goal.unit || '';
    const show = (value: number) => race ? secondsToClock(value, value >= 3600) : `${Math.round(value)} ${unit}`.trim();
    const weeks = goal.date ? weeksUntil(goal.date) : 0;
    const reach = (value: number) => p ? (race ? value <= p.target : value >= p.target) : false;
    const readyToTest = Boolean(p && model && reach(model.start) && !reach(p.start));
    const perWeek = p && weeks >= 1 ? (race ? p.start - p.typical : p.typical - p.start) / weeks : null;
    const needPerWeek = p && weeks >= 1 ? (race ? p.start - p.target : p.target - p.start) / weeks : null;
    return {
      title: goal.title,
      shownOnCard: progress.currentText ? `${progress.currentText}${goal.type === 'Strength' ? ` (${maxMode === 'tested' ? 'tested' : 'calculated'} max)` : ''}` : null,
      target: progress.targetText,
      status: progress.label,
      percent: progress.share === null ? null : Math.round(progress.share * 100),
      ...(p ? {
        projectedOnGoalDate: show(p.typical),
        bestCaseOnGoalDate: show(p.ceiling),
        pacePerWeek: perWeek === null ? null : `${race ? '' : '+'}${Math.round(perWeek * 10) / 10} ${race ? 'sec faster' : unit}/week (${p.measured ? 'the athlete’s own pace' : 'typical pace'})`,
        requiredPerWeek: needPerWeek === null || needPerWeek <= 0 ? null : `${race ? '' : '+'}${Math.round(needPerWeek * 10) / 10} ${race ? 'sec faster' : unit}/week`,
      } : {}),
      ...(readyToTest ? { readyToTest: `Their sets already estimate ${show(model!.start)}; only the tested number is short. The next step is to test it.` } : {}),
      trend: progress.trend || null,
    };
  });
}

/* THE COACH'S EYE ON A GOAL THAT DOES NOT EXIST YET: the number its card
   would show today and the prediction it would draw, from exactly the same
   code the cards use — so a suggested goal reads on its card the way the
   suggestion said it would. Race predictions are the slow part and are
   remembered per distance. Shared by the goal builder and the chat coach. */
export function makeGoalJudge(records: WorkoutRecord[], setup: Setup, workouts: Workouts, maxMode: MaxMode): GoalJudge {
  const excluded = (setup as { excludedEfforts?: string[] } | null | undefined)?.excludedEfforts || [];
  const cap = { maxWeeklyMileage: Number((setup as { maxWeeklyMileage?: number | string } | null | undefined)?.maxWeeklyMileage) || 0, excludedEfforts: excluded, workoutEfforts: workouts };
  const raceNow = new Map<number, number | null>();
  const verdictCache = new Map<string, Feasibility | undefined>();
  return (goal: CreatedGoal) => {
    const key = `${goal.type}|${goal.exercise}|${goal.target}|${goal.date}|${goal.current}|${goal.unit}`;
    if (!verdictCache.has(key)) verdictCache.set(key, goalFeasibility([goal], records, cap)[0]);
    const verdict = verdictCache.get(key);
    let endurance: number | null = null;
    if (goal.type === 'Endurance') {
      const miles = expectedRunMiles(goal);
      if (miles) {
        if (!raceNow.has(miles)) {
          const estimate = predictRaceFromLegacyMethod(records, miles, excluded, workouts)?.seconds ?? null;
          raceNow.set(miles, maxMode === 'tested' ? testedRaceSeconds(records, miles, excluded, estimate) : estimate);
        }
        endurance = raceNow.get(miles) ?? null;
      }
    }
    const model = verdict?.prediction;
    const now = goalProgress(goal, records, verdict, setup, maxMode, endurance).current ?? model?.start ?? null;
    return { now, model, p: model ? predictionFromNow(model, now) : undefined };
  };
}
