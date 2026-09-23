import { useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useWorkoutHistory } from './WorkoutHistoryProvider';
import { useGoals } from '../goals/GoalsProvider';
import { useProfileSetup } from '../profile/ProfileSetupProvider';
import { useAdaptiveTraining } from './AdaptiveTrainingProvider';
import { useDailyRecommendation } from './DailyRecommendationProvider';
import { sessionVerdicts } from './sessionVerdicts';
import { readLocalAiPlan, currentWeekIndex, goalLiftNames, type StoredAiPlan } from './aiPlanService';
import { sessionTrend, parsePrescription } from '../../lib/sessionVerdict';
import { paceModel, easyTooFast, loggedEasyPace } from '../../lib/paceModel';
import { enduranceTarget, clockText, QUALITY_MAX_SHARE, WARMUP_COOLDOWN_MILES } from '../../lib/qualitySession';
import { medianWeeklyMiles, longestContinuousRun } from '../../lib/goalTrajectory';
import { milesBetween, last7DayRuns, receiptLine } from '../../lib/stats';
import { goalFeasibility } from '../../lib/goalFeasibility';
import { progressionLevels } from '../../lib/progressionLevels';
import { workoutEfforts } from '../../lib/workoutEvidence';
import { liftPositions } from '../../lib/liftProgression';
import { canonicalLiftKey } from '../../lib/liftAliases';
import { localDayIso } from '../../lib/time';
import { coachNotes, nextNote, type CoachNote, type CoachNoteInput } from '../../lib/coachNotes';

/* FEEDING THE COACH ITS FACTS.

   lib/coachNotes is pure and is handed everything already computed. This is
   where the computing happens, and it deliberately mirrors the chain the Plan
   tab runs (AiProgramPlan) and the one PlanPressureCard runs, rather than
   inventing a third reading of the same records: verdicts at the base paces,
   then paces refined by the workouts, then levels off the verdicts. If those
   two ever disagree with this one, this one is wrong.

   WHAT IS REMEMBERED, and where. Two things, per user, in localStorage:

     seen          note key -> the day it was acknowledged. A note whose key
                   is here is never shown again. Keys are what the note is
                   ABOUT (a date, a week, a verdict), so a new fact gets a new
                   key and a repeated one does not.

     goalVerdicts  goal name -> the verdict the athlete last saw. The only
                   way to say "your 5K moved from needs-more to reachable" is
                   to know what it was; this is that memory. It advances only
                   when the change has been acknowledged, so a move is shown
                   until it is seen and then never again.

   Local, not synced. A note read on the phone and read again on the iPad is
   a small cost; a sync layer for eight facts is not worth its bugs today. */

const storageKey = (userId: string) => `forge-coach-notes-v1:${userId}`;
type Remembered = { seen: Record<string, string>; goalVerdicts: Record<string, string> };
const EMPTY: Remembered = { seen: {}, goalVerdicts: {} };

const readRemembered = (userId: string): Remembered => {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Remembered>;
    return { seen: parsed.seen || {}, goalVerdicts: parsed.goalVerdicts || {} };
  } catch { return EMPTY; }
};

const addDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDayIso(date);
};


export function useCoachNotes(): { note: CoachNote | null; pending: number; acknowledge: (note: CoachNote) => void } {
  const { user } = useAuth();
  const { records } = useWorkoutHistory();
  const { goals } = useGoals();
  const { setup } = useProfileSetup();
  const { recovery } = useAdaptiveTraining();
  const { recommendation } = useDailyRecommendation();
  const userId = user?.id || 'preview-user';

  const [remembered, setRemembered] = useState<Remembered>(() => readRemembered(userId));
  useEffect(() => { setRemembered(readRemembered(userId)); }, [userId]);
  useEffect(() => { try { localStorage.setItem(storageKey(userId), JSON.stringify(remembered)); } catch { /* storage full or private mode: the card just repeats */ } }, [remembered, userId]);

  const notes = useMemo<CoachNote[]>(() => {
    const todayIso = localDayIso();
    const metric = setup?.units === 'Metric';
    const stored: StoredAiPlan | null = readLocalAiPlan();
    const runGoal = enduranceTarget(goals);
    const split = (setup?.splitDays || []).map(day => ({ name: day.name, dayType: day.type }));
    const athlete = {
      runningDays: Number(setup?.runningDays) || 0,
      minWeeklyMileage: Number(setup?.minWeeklyMileage) || 0,
      maxWeeklyMileage: Number(setup?.maxWeeklyMileage) || 0,
      weeklyMileage: Number(setup?.weeklyMileage) || 0,
      recentWeeklyMileage: medianWeeklyMiles(records),
      recentLongestRun: longestContinuousRun(records),
      goalPaceSecondsPerMile: runGoal?.paceSecondsPerMile,
      goalMiles: runGoal?.miles,
    };
    const excluded = setup?.excludedEfforts || [];
    const basePaces = paceModel(records, runGoal, todayIso, medianWeeklyMiles(records), excluded);
    const judged = sessionVerdicts(records, stored, split, { ...athlete, paces: basePaces }, todayIso);
    const paces = paceModel(records, runGoal, todayIso, medianWeeklyMiles(records), excluded, workoutEfforts(judged));
    const { moves } = progressionLevels({
      weeklyMiles: medianWeeklyMiles(records),
      qualityShare: QUALITY_MAX_SHARE,
      warmupMiles: WARMUP_COOLDOWN_MILES,
      thresholdPaceSecondsPerMile: paces.threshold,
      provenQuality: judged.length > 0,
    }, judged.map(verdict => ({ date: verdict.date, outcome: verdict.outcome, text: verdict.text })));

    /* THIS WEEK AND LAST, ON THE PLAN'S OWN CALENDAR. */
    let week: CoachNoteInput['week'] = null;
    let closedWeek: CoachNoteInput['closedWeek'] = null;
    if (stored && stored.plan.weeks.length) {
      const index = currentWeekIndex(stored);
      const startIso = addDays(stored.startDate, index * 7);
      const endIso = addDays(startIso, 6);
      const planned = Number(stored.plan.weeks[index]?.mileage) || 0;
      const daysLeft = Math.max(0, Math.round((Date.parse(`${endIso}T12:00:00`) - Date.parse(`${todayIso}T12:00:00`)) / 86400000));
      week = { startIso, planned, ran: milesBetween(records, addDays(todayIso, -6), todayIso), daysLeft, runs: last7DayRuns(records, todayIso).map(line => receiptLine(line, metric)) };
      /* Last week closes on the first day of this one; told once, on that day. */
      if (index > 0 && todayIso === startIso) {
        const lastStart = addDays(startIso, -7);
        closedWeek = { startIso: lastStart, planned: Number(stored.plan.weeks[index - 1]?.mileage) || 0, ran: milesBetween(records, lastStart, addDays(lastStart, 6)) };
      }
    }

    /* LIFTS THAT KEEP COMING UP SHORT — goal lifts only, because those are the
       ones on the wave and the only ones a "held load" is a decision about. */
    const tracked = goalLiftNames(goals);
    const positions = liftPositions(records, () => false);
    const liftMisses = [...positions.entries()]
      .filter(([key]) => tracked.has(key))
      .map(([key, position]) => ({
        lift: goals.find(goal => goal.exercise && canonicalLiftKey(String(goal.exercise)) === key)?.exercise || key,
        misses: position.misses,
        askedReps: position.lastAsked?.reps,
      }));

    /* GOALS WHOSE VERDICT MOVED since the athlete last saw one. */
    const feasibility = goalFeasibility(goals, records, { maxWeeklyMileage: athlete.maxWeeklyMileage, excludedEfforts: excluded, workoutEfforts: workoutEfforts(judged) });
    const goalChanges = feasibility.flatMap(item => {
      const name = item.goal;
      const before = remembered.goalVerdicts[name];
      return before && before !== item.verdict ? [{ goal: name, from: before, to: item.verdict, say: item.say }] : [];
    });

    /* READINESS, AGAINST WHAT TODAY ACTUALLY ASKS FOR. */
    const hardToday = (() => {
      const session = recommendation?.cardio?.selected ? recommendation.cardio : null;
      const text = session?.summary || session?.title || '';
      const prescription = parsePrescription(text);
      if (!prescription) return null;
      return ({ threshold: 'tempo', intervals: 'intervals', reps: 'reps', racepace: 'race-pace run', test: 'time trial' } as Record<string, string>)[prescription.kind] || 'hard run';
    })();
    const readiness = recovery && recovery.confidence !== 'Low'
      ? { score: recovery.readiness, hardSessionToday: hardToday }
      : null;

    const easyPace = loggedEasyPace(records as never[], paces, todayIso);
    const easy = easyTooFast(paces, easyPace)
      ? { loggedPace: clockText(easyPace), easyRange: `${clockText(paces.easyFast)}–${clockText(paces.easySlow)}` }
      : null;

    return coachNotes({
      todayIso,
      verdicts: judged.map(verdict => ({ date: verdict.date, outcome: verdict.outcome, say: verdict.say, text: verdict.text })),
      levelMoves: moves,
      trend: sessionTrend(judged),
      week, closedWeek, liftMisses, goalChanges, readiness, easyTooFast: easy,
    });
  }, [records, goals, setup, recovery, recommendation, remembered.goalVerdicts]);

  /* The goal-verdict memory advances for every goal that has NO pending
     change, so the first time a goal is seen its verdict is simply recorded
     and a later move can be reported against it. A goal with a pending
     change keeps its old verdict until that change is acknowledged. */
  useEffect(() => {
    const pendingGoals = new Set(notes.filter(note => note.kind === 'goal-moved' && !remembered.seen[note.key]).map(note => note.key.split(':')[1]));
    const feasibility = goalFeasibility(goals, records, { maxWeeklyMileage: Number(setup?.maxWeeklyMileage) || 0, excludedEfforts: setup?.excludedEfforts || [] });
    const next: Record<string, string> = { ...remembered.goalVerdicts };
    let changed = false;
    for (const item of feasibility) {
      const name = item.goal;
      if (!name || pendingGoals.has(name)) continue;
      if (next[name] !== item.verdict) { next[name] = item.verdict; changed = true; }
    }
    if (changed) setRemembered(current => ({ ...current, goalVerdicts: next }));
  }, [notes, goals, records, setup, remembered.seen, remembered.goalVerdicts]);

  const acknowledge = useCallback((note: CoachNote) => {
    setRemembered(current => {
      const seen = { ...current.seen, [note.key]: localDayIso() };
      const goalVerdicts = { ...current.goalVerdicts };
      if (note.kind === 'goal-moved') {
        const [, goal, verdict] = note.key.split(':');
        if (goal && verdict) goalVerdicts[goal] = verdict;
      }
      return { seen, goalVerdicts };
    });
  }, []);

  const note = nextNote(notes, remembered.seen);
  const pending = notes.filter(item => !remembered.seen[item.key]).length;
  return { note, pending, acknowledge };
}
