import { useEffect } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useGoals } from './GoalsProvider';
import { useWorkoutHistory } from '../training/WorkoutHistoryProvider';
import { useProfileSetup } from '../profile/ProfileSetupProvider';
import { isDemoMode } from '../../lib/env';
import { supabase } from '../../lib/supabase';
import { goalFeasibility, GOAL_MODEL_VERSION } from '../../lib/goalFeasibility';
import { canonicalLiftKey } from '../../lib/liftAliases';
import { secondsToClock } from '../../lib/goalInput';
import { localDayIso } from '../../lib/time';
import type { CreatedGoal } from '../../components/GoalBuilder';

/* EVERY GOAL IS A TEST OF THE MODEL.

   The first time Forge can judge a goal it writes down what it predicted —
   where the athlete is, where a typical block and the ceiling put them by the
   date, and the verdict shown — in goal_predictions. A week after the goal
   date it measures the same thing again from what was logged and writes the
   outcome beside it. The prediction itself is frozen by the database, so the
   model is always scored against what it actually said.

   Read across athletes (supabase/queries/goal_calibration.sql), this answers
   whether "Realistic" goals are hit about half the time and whether the
   ceiling is ever beaten, from real users rather than a backtest. */

/* A goal has no id; what defines it is its key. */
export const goalKey = (goal: Pick<CreatedGoal, 'type' | 'exercise' | 'target' | 'date'>) =>
  [goal.type, canonicalLiftKey(String(goal.exercise || '')), String(goal.target).trim().toLowerCase(), goal.date].join('|');

/* A week past the date, so a session logged the day after still counts. */
const GRACE_DAYS = 7;
const addDays = (iso: string, days: number) => { const date = new Date(`${iso}T12:00:00`); date.setDate(date.getDate() + days); return localDayIso(date); };

type Row = { goal_key: string; goal_type: string; exercise: string | null; goal_date: string; better: 'higher' | 'lower'; target: number; scored_at: string | null };

export function useGoalPredictionLog() {
  const { user } = useAuth();
  const { goals, hydrated } = useGoals();
  const { records, loading } = useWorkoutHistory();
  const { setup } = useProfileSetup();
  const maxWeeklyMileage = Number(setup?.maxWeeklyMileage) || 0;
  const excludedEfforts = setup?.excludedEfforts;
  useEffect(() => {
    if (isDemoMode || !user || !hydrated || loading) return;
    let cancelled = false;
    /* After the app has settled; nothing here is needed on screen. */
    const timer = window.setTimeout(async () => {
      const { data, error } = await supabase.from('goal_predictions').select('goal_key,goal_type,exercise,goal_date,better,target,scored_at');
      if (error || cancelled) return;
      const known = new Map((data as Row[]).map(row => [row.goal_key, row]));
      const options = { maxWeeklyMileage, excludedEfforts: excludedEfforts || [] };
      const today = localDayIso();

      const fresh = goals.flatMap(goal => {
        const key = goalKey(goal);
        if (known.has(key) || goal.date < today) return [];
        const verdict = goalFeasibility([goal], records, options)[0];
        const p = verdict?.prediction;
        if (!p) return [];
        return [{ goal_key: key, goal_type: goal.type, exercise: goal.exercise || null, goal_date: goal.date, better: p.better, target: p.target,
          start_value: p.start, typical: p.typical, ceiling: p.ceiling, weeks: p.weeks, verdict: verdict.verdict, model_version: GOAL_MODEL_VERSION }];
      });
      if (fresh.length) await supabase.from('goal_predictions').upsert(fresh, { onConflict: 'owner_id,goal_key', ignoreDuplicates: true });

      /* SCORED FROM THE ROW, not the goal list: a goal deleted after its date
         still has an answer worth keeping. */
      for (const row of (data as Row[])) {
        if (cancelled || row.scored_at || addDays(row.goal_date, GRACE_DAYS) > today) continue;
        const cutoff = addDays(row.goal_date, GRACE_DAYS);
        const asOf = records.filter(record => record.date <= cutoff);
        const goal: CreatedGoal = { type: row.goal_type, title: row.exercise || row.goal_type, exercise: row.exercise || undefined, date: row.goal_date, connection: 'No fixed day',
          target: row.better === 'lower' ? secondsToClock(Number(row.target), true) : String(row.target), unit: row.better === 'lower' ? 'hh:mm:ss' : undefined };
        const outcome = goalFeasibility([goal], asOf, options)[0]?.prediction?.start;
        if (!outcome) continue;
        const reached = row.better === 'lower' ? outcome <= Number(row.target) : outcome >= Number(row.target);
        await supabase.from('goal_predictions').update({ outcome_value: outcome, reached, scored_at: new Date().toISOString() }).eq('goal_key', row.goal_key).is('scored_at', null);
      }
    }, 4000);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [user, hydrated, loading, goals, records, maxWeeklyMileage, excludedEfforts]);
}
