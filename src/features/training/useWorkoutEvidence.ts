import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useGoals } from '../goals/GoalsProvider';
import { useProfileSetup } from '../profile/ProfileSetupProvider';
import { useWorkoutHistory } from './WorkoutHistoryProvider';
import { loadStoredAiPlan, type StoredAiPlan } from './aiPlanService';
import { sessionVerdicts } from './sessionVerdicts';
import { workoutEfforts } from '../../lib/workoutEvidence';
import { enduranceTarget } from '../../lib/qualitySession';
import { paceModel } from '../../lib/paceModel';
import { medianWeeklyMiles } from '../../lib/goalTrajectory';
import { localDayIso } from '../../lib/time';
import type { Effort } from '../../lib/fitnessCurve';

/* THE SESSIONS THE ATHLETE COMPLETED, AS EVIDENCE, ON ANY SCREEN.

   The Plan tab holds the stored block, so it can judge a session without
   asking anybody. The goal card does not — it renders from a goal and the log
   — and the goal card is where the projection the athlete actually reads
   lives. Prop-drilling the block down through the goals list to get there
   would put plan plumbing in four files that have no other reason to know a
   block exists.

   So the load is here, once, behind a hook. It reads the same stored plan the
   Plan tab does and returns the same efforts, which is the point: the number
   on the goal card and the paces in the plan have to come from one body of
   evidence or they will disagree on screen, which is the failure this codebase
   has already had three times. */
export function useWorkoutEvidence(): Effort[] {
  const { user } = useAuth();
  const { goals } = useGoals();
  const { setup } = useProfileSetup();
  const { records } = useWorkoutHistory();
  const [stored, setStored] = useState<StoredAiPlan | null>(null);

  useEffect(() => {
    let active = true;
    loadStoredAiPlan(Boolean(user))
      .then(loaded => { if (active) setStored(loaded); })
      .catch(() => { /* No block, no evidence. The projection falls back to races. */ });
    return () => { active = false; };
  }, [user]);

  const runGoal = useMemo(() => enduranceTarget(goals), [goals]);
  /* Races only, and used ONLY to decide whether a logged run was an attempt at
     the session at all — see the note in AiProgramPlan for why this is one
     refinement pass rather than a fixed point. */
  const basePaces = useMemo(
    () => paceModel(records, runGoal, localDayIso(), medianWeeklyMiles(records), setup?.excludedEfforts || []),
    [records, runGoal, setup?.excludedEfforts],
  );

  return useMemo(() => {
    if (!stored) return [];
    const split = (setup?.splitDays || []).map(day => ({ name: day.name, dayType: day.type }));
    return workoutEfforts(sessionVerdicts(records, stored, split, {
      runningDays: Number(setup?.runningDays) || 0,
      minWeeklyMileage: Number(setup?.minWeeklyMileage) || 0,
      maxWeeklyMileage: Number(setup?.maxWeeklyMileage) || 0,
      weeklyMileage: Number(setup?.weeklyMileage) || 0,
      goalPaceSecondsPerMile: runGoal?.paceSecondsPerMile,
      goalMiles: runGoal?.miles,
      paces: basePaces,
    }, localDayIso()));
  }, [records, stored, setup, runGoal, basePaces]);
}
