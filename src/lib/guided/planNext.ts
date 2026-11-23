import { intelligenceFor, strengthGoalMaxes } from '../dailyRecommendationEngine';
import { sameLift } from '../liftAliases';
import type { NextTime } from './fromHistory';
import type { CreatedGoal } from '../../components/GoalBuilder';
import type { WorkoutRecord } from '../../features/training/WorkoutHistoryProvider';
import type { RecoveryState } from '../recoveryEngine';

/* A COACHED PLAN DAY PROMISES THE PLAN'S NUMBER. The next plan day loads each
   lift from the top-set wave (intelligenceFor, the same call the daily
   recommendation makes), not from Guided's ten-rep logic, so the done screen
   asks that same call, over the history that now includes today's sets. No
   watch data is known for a day that has not happened, so recovery is the
   neutral one the engine uses when nothing synced. */
const NEUTRAL_RECOVERY = (date: string): RecoveryState => ({ date, readiness: 100, confidence: 'Low', sleepScore: 0, autonomicScore: 0, loadScore: 0, strengthFatigue: 'Low', reasons: [], hardTrainingAllowed: true });
export function planNextTimes(top: Array<{ moveId: string; name: string; weight: number | null }>, records: WorkoutRecord[], goals: CreatedGoal[], date: string, loadBiasPercent = 0): NextTime[] {
  const sets = top.filter(item => item.weight !== null && item.weight > 0);
  if (!sets.length) return [];
  const next = intelligenceFor({ records, recovery: NEUTRAL_RECOVERY(date), lifts: sets.map(item => item.name), goalMaxByLift: strengthGoalMaxes(goals, date), date, loadBiasPercent }).topSets;
  return sets.flatMap(item => {
    const target = next.find(entry => sameLift(entry.exercise, item.name));
    return target && target.weight > 0 && target.weight !== item.weight ? [{ moveId: item.moveId, name: item.name, weight: target.weight, was: item.weight as number }] : [];
  });
}
