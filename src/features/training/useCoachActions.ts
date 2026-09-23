import { useCallback, useMemo } from 'react';
import { useAdaptiveTraining } from './AdaptiveTrainingProvider';
import { useGoals } from '../goals/GoalsProvider';
import { useCoachingStrategy } from './CoachingStrategyProvider';
import { useProfileSetup } from '../profile/ProfileSetupProvider';
import { useTrainingLibrary } from './TrainingLibraryProvider';
import { useAthleteNotes } from './useAthleteNotes';
import { createNote, extractArea, type AthleteNote } from './athleteNotesService';
import { parseActions, overrideFromActions, type ActionContext, type CoachAction } from '../../lib/coachActions';
import { readTodayOverride, writeTodayOverride, appendAppliedActions } from './coachOverrides';
import { localDayIso } from '../../lib/time';

/* ONE WAY TO APPLY WHAT THE COACH PROPOSES. The chat coach's confirm card
   and the weekly review's one-tap change both land here, so an action means
   the same thing wherever it was offered: the profile, the body log, the
   goals, the library, and today's override are the authorities, and this is
   the only code that writes to them on the coach's behalf. */

const kindLabel: Record<AthleteNote['kind'], string> = { injury: 'injury', fatigue: 'fatigue', other: 'limitation' };

export function useCoachActions() {
  const { profile, updateProfile } = useAdaptiveTraining();
  const { goals, saveGoal } = useGoals();
  const { strategy, updateStrategy } = useCoachingStrategy();
  const { setup, saveSetup } = useProfileSetup();
  const { exercises, addExercise, addWorkout } = useTrainingLibrary();
  const { notes, upsert } = useAthleteNotes();

  const context = useMemo<ActionContext>(() => ({
    splitDays: (setup?.splitDays || []).map((day, index) => ({ position: index + 1, name: day.name, type: day.type })),
    goals: goals.map(goal => ({ title: goal.title })),
    activeNoteAreas: notes.filter(note => note.status === 'active').map(note => note.area || kindLabel[note.kind]),
    exercises: exercises.map(exercise => exercise.name),
    weeklyMileage: Number(setup?.weeklyMileage) || profile.weeklyMileage || 0,
    runningDays: Number(setup?.runningDays) || profile.runningDays || 0,
    loadBiasPercent: strategy.loadBiasPercent,
    metric: setup?.units === 'Metric',
  }), [setup, goals, notes, exercises, profile.weeklyMileage, profile.runningDays, strategy.loadBiasPercent]);

  /* Applies every action and returns the labels of what was done. */
  const apply = useCallback((actions: CoachAction[], reason: string): string[] => {
    const todayIso = localDayIso();
    const applied: string[] = [];
    for (const action of actions) {
      if (action.type === 'set_weekly_mileage') { updateProfile({ weeklyMileage: action.miles }); if (setup) { const ceiling = Number(setup.maxWeeklyMileage) || 0; saveSetup({ ...setup, weeklyMileage: action.miles, maxWeeklyMileage: ceiling && action.miles > ceiling ? Math.ceil(action.miles * 1.1) : setup.maxWeeklyMileage }); } }
      if (action.type === 'set_running_days') { updateProfile({ runningDays: action.days }); if (setup) saveSetup({ ...setup, runningDays: action.days }); }
      if (action.type === 'set_load_bias') updateStrategy({ loadBiasPercent: action.percent, lastAdjustment: reason });
      if (action.type === 'log_note') upsert(createNote(action.noteKind, action.text, action.area || extractArea(action.text)));
      if (action.type === 'clear_note') { const note = notes.find(item => item.status === 'active' && (item.area || kindLabel[item.kind]) === action.area); if (note) upsert({ ...note, status: 'cleared' }); }
      if (action.type === 'update_goal') { const index = goals.findIndex(goal => goal.title === action.goalTitle); if (index >= 0) saveGoal({ ...goals[index], ...(action.target ? { target: action.target } : {}), ...(action.date ? { date: action.date } : {}) }, index); }
      if (action.type === 'create_exercise') addExercise({ name: action.name, kind: action.muscles.includes('Cardio') ? 'Cardio' : 'Strength', muscles: action.muscles, detail: 'Coach-created · User confirmed', enabled: true, custom: true });
      if (action.type === 'create_workout') { const cardioOnly = action.items.every(item => exercises.find(exercise => exercise.name.toLowerCase() === item.toLowerCase())?.kind === 'Cardio'); addWorkout({ name: action.name, kind: cardioOnly ? 'Cardio' : 'Strength', source: 'User', summary: action.items.join(' · '), exercises: action.items }); }
      applied.push(action.label);
    }
    const override = overrideFromActions(actions, todayIso, readTodayOverride(todayIso));
    if (override !== readTodayOverride(todayIso)) writeTodayOverride(override);
    appendAppliedActions(actions.map(action => ({ date: todayIso, type: action.type, label: action.label })));
    return applied;
  }, [updateProfile, setup, saveSetup, updateStrategy, upsert, notes, goals, saveGoal, addExercise, addWorkout, exercises]);

  const parse = useCallback((raw: unknown) => parseActions(raw, context), [context]);

  return { context, parse, apply };
}
