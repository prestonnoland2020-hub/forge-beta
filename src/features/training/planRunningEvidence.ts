import type { CreatedGoal } from '../../components/GoalBuilder';
import type { WorkoutRecord } from './WorkoutHistoryProvider';
import type { StoredAiPlan } from './aiPlanService';
import { sessionVerdicts } from './sessionVerdicts';
import { paceModel } from '../../lib/paceModel';
import { enduranceTarget, QUALITY_MAX_SHARE, WARMUP_COOLDOWN_MILES } from '../../lib/qualitySession';
import { medianWeeklyMiles } from '../../lib/goalTrajectory';
import { progressionLevels } from '../../lib/progressionLevels';
import { workoutEfforts } from '../../lib/workoutEvidence';
import { withHyroxPaces } from '../../lib/hyroxSession';
import { localDayIso } from '../../lib/time';

/* WHAT THE WEEK'S RUNNING IS SIZED FROM, COMPUTED ONCE FOR EVERY SCREEN.

   The Plan tab judged the block's hard sessions, rebuilt the paces with them
   and worked out where the athlete is on each ladder; Today did none of that
   and resolved the same week from thinner inputs. The hard run came out a
   different size, so the easy miles left over did too: Today said "Easy run ·
   3 miles" on the day the week list under it said 2.5.

   Both now read this. The order is the Plan tab's own: base paces from races
   alone decide what counts as an attempt at a session, then the paces are
   rebuilt with the judged sessions included, then the ladder levels. */
type SetupLike = { splitDays?: Array<{ name: string; type: string }>; runningDays?: number | string; minWeeklyMileage?: number | string; maxWeeklyMileage?: number | string; weeklyMileage?: number | string; excludedEfforts?: string[] } | null | undefined;

export function planRunningEvidence(records: WorkoutRecord[], stored: StoredAiPlan | null | undefined, setup: SetupLike, goals: CreatedGoal[], todayIso = localDayIso()) {
  const runGoal = enduranceTarget(goals);
  const excluded = setup?.excludedEfforts || [];
  const weekly = medianWeeklyMiles(records);
  const basePaces = paceModel(records, runGoal, todayIso, weekly, excluded);
  const split = (setup?.splitDays || []).map(day => ({ name: day.name, dayType: day.type }));
  const judged = sessionVerdicts(records, stored, split, {
    runningDays: Number(setup?.runningDays) || 0,
    minWeeklyMileage: Number(setup?.minWeeklyMileage) || 0,
    maxWeeklyMileage: Number(setup?.maxWeeklyMileage) || 0,
    weeklyMileage: Number(setup?.weeklyMileage) || 0,
    goalPaceSecondsPerMile: runGoal?.paceSecondsPerMile,
    goalMiles: runGoal?.miles,
    paces: basePaces,
  }, todayIso, undefined, goals);
  const paces = withHyroxPaces(paceModel(records, runGoal, todayIso, weekly, excluded, workoutEfforts(judged)), goals);
  const moves = judged.map(verdict => ({ date: verdict.date, outcome: verdict.outcome, text: verdict.text }));
  const levels = progressionLevels({
    weeklyMiles: weekly,
    qualityShare: QUALITY_MAX_SHARE,
    warmupMiles: WARMUP_COOLDOWN_MILES,
    thresholdPaceSecondsPerMile: paces.threshold,
    provenQuality: moves.length > 0,
  }, moves);
  return { basePaces, judged, paces, levels };
}
