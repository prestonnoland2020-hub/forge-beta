import { useCallback, useMemo } from 'react';
import { useAdaptiveTraining } from './AdaptiveTrainingProvider';
import { useGoals } from '../goals/GoalsProvider';
import { useCoachingStrategy } from './CoachingStrategyProvider';
import { useProfileSetup } from '../profile/ProfileSetupProvider';
import { useTrainingLibrary } from './TrainingLibraryProvider';
import { useAthleteNotes } from './useAthleteNotes';
import { createNote, extractArea, type AthleteNote } from './athleteNotesService';
import { parseActions, overrideFromActions, circuitWorkoutFromAction, whereItGoes, type ActionContext, type CoachAction } from '../../lib/coachActions';

/* What was done, and the screen that now shows it. */
export type AppliedChange = { label: string; place: string; to: string };
import { readTodayOverride, writeTodayOverride, appendAppliedActions } from './coachOverrides';
import { localDayIso } from '../../lib/time';
import { writeSwap } from '../../lib/todaySwaps';
import { useDailyRecommendation } from './DailyRecommendationProvider';
import { useWorkoutHistory, type WorkoutRecord } from './WorkoutHistoryProvider';
import type { CreatedGoal } from '../../components/GoalBuilder';

/* ONE WAY TO APPLY WHAT THE COACH PROPOSES. The chat coach's confirm card
   and the weekly review's one-tap change both land here, so an action means
   the same thing wherever it was offered: the profile, the body log, the
   goals, the library, and today's override are the authorities, and this is
   the only code that writes to them on the coach's behalf. */

const kindLabel: Record<AthleteNote['kind'], string> = { injury: 'injury', fatigue: 'fatigue', other: 'limitation' };

export function useCoachActions() {
  const { profile, updateProfile } = useAdaptiveTraining();
  const { goals, saveGoal, deleteGoal } = useGoals();
  const { recommendation } = useDailyRecommendation();
  const { strategy, updateStrategy } = useCoachingStrategy();
  const { setup, saveSetup } = useProfileSetup();
  const { exercises, addExercise, addWorkout } = useTrainingLibrary();
  const { notes, upsert } = useAthleteNotes();
  const { records, addRecord, updateRecord } = useWorkoutHistory();

  const context = useMemo<ActionContext>(() => ({
    splitDays: (setup?.splitDays || []).map((day, index) => ({ position: index + 1, name: day.name, type: day.type })),
    goals: goals.map(goal => ({ title: goal.title, type: goal.type, exercise: goal.exercise })),
    todayLifts: (recommendation?.topSets || []).map(set => set.exercise).filter(Boolean),
    activeNoteAreas: notes.filter(note => note.status === 'active').map(note => note.area || kindLabel[note.kind]),
    exercises: exercises.map(exercise => exercise.name),
    weeklyMileage: Number(setup?.weeklyMileage) || profile.weeklyMileage || 0,
    runningDays: Number(setup?.runningDays) || profile.runningDays || 0,
    loadBiasPercent: strategy.loadBiasPercent,
    metric: setup?.units === 'Metric',
  }), [setup, goals, notes, exercises, profile.weeklyMileage, profile.runningDays, strategy.loadBiasPercent, recommendation]);

  /* Applies every action and returns what was done and where it landed. */
  const apply = useCallback((actions: CoachAction[], reason: string): AppliedChange[] => {
    const todayIso = localDayIso();
    const applied: AppliedChange[] = [];
    for (const action of actions) {
      if (action.type === 'set_weekly_mileage') { updateProfile({ weeklyMileage: action.miles }); if (setup) { const ceiling = Number(setup.maxWeeklyMileage) || 0; saveSetup({ ...setup, weeklyMileage: action.miles, maxWeeklyMileage: ceiling && action.miles > ceiling ? Math.ceil(action.miles * 1.1) : setup.maxWeeklyMileage }); } }
      if (action.type === 'set_running_days') { updateProfile({ runningDays: action.days }); if (setup) saveSetup({ ...setup, runningDays: action.days }); }
      if (action.type === 'set_load_bias') updateStrategy({ loadBiasPercent: action.percent, lastAdjustment: reason });
      if (action.type === 'log_note') upsert(createNote(action.noteKind, action.text, action.area || extractArea(action.text), action.bufferDays));
      /* Cleared today, it ends today — which is what starts the easier days
         back after being sick (lib/bodyLog reads the end date). */
      if (action.type === 'clear_note') { const note = notes.find(item => item.status === 'active' && (item.area || kindLabel[item.kind]) === action.area); if (note) upsert({ ...note, status: 'cleared', bufferUntil: todayIso }); }
      if (action.type === 'update_goal') { const index = goals.findIndex(goal => goal.title === action.goalTitle); if (index >= 0) saveGoal({ ...goals[index], ...(action.target ? { target: action.target } : {}), ...(action.date ? { date: action.date } : {}) }, index); }
      if (action.type === 'create_goal') {
        const goal: CreatedGoal = { type: action.goal.type, title: action.goal.title, target: `${action.goal.target} ${action.goal.unit}`, date: action.goal.date,
          connection: action.goal.type === 'Endurance' ? 'Cardio only' : 'No fixed day', exercise: action.goal.exercise, metric: action.goal.metric,
          current: '', unit: action.goal.unit, trackingSource: 'Workout history', checkInFrequency: 'Automatic', reminderEnabled: false };
        saveGoal(goal, null);
      }
      if (action.type === 'delete_goal') { const index = goals.findIndex(goal => goal.title === action.goalTitle); if (index >= 0) deleteGoal(index); }
      if (action.type === 'swap_exercise') writeSwap(todayIso, action.from, action.to);
      /* Logged into the day's record when there is one, so the day stays one
         session; a new record otherwise. */
      if (action.type === 'log_top_set' || action.type === 'log_run') {
        const existing = records.find(record => record.date === action.date);
        const muscle = action.type === 'log_top_set' ? (exercises.find(item => item.name === action.exercise)?.muscles?.[0] || '') : 'Cardio';
        const set = action.type === 'log_top_set' ? { lift: action.exercise, weight: action.weight, reps: action.reps, muscle, completed: true } : null;
        const run = action.type === 'log_run' ? { id: `coach-run-${Date.now()}`, structure: 'steady', activity: 'Run', summary: `Run · ${action.miles} mi`, prescription: { distance: String(action.miles), distanceUnit: 'miles', duration: String(action.minutes) } } : null;
        if (existing) {
          const { id, ...rest } = existing;
          updateRecord(id, {
            ...rest,
            muscles: [...new Set([...(existing.muscles || []), ...(muscle ? [muscle] : [])])],
            topSets: set ? [...(existing.topSets || []), set] : existing.topSets,
            hasCardio: existing.hasCardio || Boolean(run),
            cardioSessions: run ? [...(existing.cardioSessions || []), run] : existing.cardioSessions,
          } as Omit<WorkoutRecord, 'id'>);
        } else {
          addRecord({ date: action.date, title: set ? 'Logged with coach' : 'Run', muscles: muscle ? [muscle] : [], hasCardio: Boolean(run), ...(set ? { topSets: [set] } : {}), ...(run ? { cardioSessions: [run] } : {}) } as Omit<WorkoutRecord, 'id'>);
        }
      }
      if (action.type === 'create_exercise') addExercise({ name: action.name, kind: action.muscles.includes('Cardio') ? 'Cardio' : 'Strength', muscles: action.muscles, detail: 'Coach-created · User confirmed', enabled: true, custom: true });
      /* A WORKOUT WITH ITS PRESCRIPTION IS SAVED AS A CIRCUIT — the stations,
         their numbers, rounds and rest — so it opens in the circuit builder,
         shows under Saved circuits and logs in a tap. A names-only workout
         (an older coach deploy) is saved the way it always was. */
      /* Every coach-made workout goes to Saved circuits, and the link opens
         the library on that circuit. */
      if (action.type === 'create_workout') {
        const workout = circuitWorkoutFromAction(action, exercises);
        if (workout) { const saved = addWorkout(workout); applied.push({ label: action.label, place: 'Library · Saved circuits', to: `/exercises?show=circuits&circuit=${saved.id}` }); }
        continue;
      }
      applied.push({ label: action.label, ...whereItGoes(action) });
    }
    const override = overrideFromActions(actions, todayIso, readTodayOverride(todayIso));
    if (override !== readTodayOverride(todayIso)) writeTodayOverride(override);
    appendAppliedActions(actions.map(action => ({ date: todayIso, type: action.type, label: action.label })));
    return applied;
  }, [updateProfile, setup, saveSetup, updateStrategy, upsert, notes, goals, saveGoal, deleteGoal, addExercise, addWorkout, exercises, records, addRecord, updateRecord]);

  const parse = useCallback((raw: unknown) => parseActions(raw, context), [context]);

  return { context, parse, apply };
}
