import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CreatedGoal } from './GoalBuilder';
import type { AdaptiveProfile } from '../features/training/AdaptiveTrainingProvider';
import type { PlannedCardio } from './CardioPlanBuilder';
import { LongRangeTrainingPlan } from './LongRangeTrainingPlan';
import { PlanRebuildModal } from './PlanRebuildModal';
import { PlanProgress, PlanActions, TodayCard, WeekList, useWeekSwipe, waveSentence, type PlanSession } from './PlanView';
import { MileageGate } from './MileageGate';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { useAuth } from '../features/auth/AuthProvider';
import { useDailyRecommendation } from '../features/training/DailyRecommendationProvider';
import { isDemoMode } from '../lib/env';
import { localDayIso } from '../lib/time';
import { canonicalLiftKey, splitDayKey } from '../lib/liftAliases';
import { cardioMiles, summarizeCardioDraft, formatCardioMinutes } from '../lib/cardioSession';
import { calculateEstimatedOneRepMax } from '../lib/strength';
import { runShapedActivity } from '../features/training/stravaImportService';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import {
  generateAiPlan, loadStoredAiPlan, saveStoredAiPlan, planFingerprint,
  weeksRemaining, currentWeekIndex, goalLiftNames, testsOneRepMax, resolvePlanWeek, weekCycleDays,
  bestsFromHistory, chooseMaxAttemptDays, waveOffsetFromHistory, waveIndexOf, WAVE_REPS, WAVE_LENGTH, type AiPlanWeek, type AiPlanTopSet, type SplitDayRef, type StoredAiPlan,
  calendarEmptyState,
} from '../features/training/aiPlanService';
import { liftPositions, rungFor } from '../lib/liftProgression';
import { medianWeeklyMiles, longestContinuousRun } from '../lib/goalTrajectory';

type SplitDay = { name: string; dayType: string; muscles?: string[]; exercises?: string[]; cardioPolicy?: 'none' | 'forge' | 'planned'; cardio?: PlannedCardio[] };
/* The prose `detail` stays for the coach and the roadmap; `lifts` and `run`
   are the same facts as data, so the screen can draw a lift on one line and a
   run on the next instead of one long sentence with middots in it. */
export type Session = { date: Date; kind: string; title: string; detail: string; stress: 'High' | 'Moderate' | 'Low' | 'Rest'; lifts: AiPlanTopSet[]; run?: { kind: 'Long run' | 'Hard run' | 'Easy run'; text: string } };

/* Lower-body is a property of the MUSCLES a day trains (or a squat-pattern
   top set), never of the day's name — users name days anything. */
const LOWER_MUSCLES = ['Quads', 'Hamstrings', 'Glutes', 'Calves'];
const isLowerBodyDay = (day: SplitDay, topSet?: { exercise: string }) =>
  (day.muscles || []).some(muscle => LOWER_MUSCLES.includes(muscle)) ||
  /squat|deadlift|lunge|leg press|rdl/i.test(topSet?.exercise || '') ||
  /\bleg/i.test(day.name);

/* Map one AI plan week onto seven calendar days following the athlete's split
   cycle. Placement comes FROM the plan (longRunDay / qualityDay / easyDays by
   split-day name), but two hard guards run regardless of what the AI said:
   the quality session never lands on a lower-body day, and if the AI chose
   one anyway it is relocated to the best non-lower day of the week. */
function aiWeekSessions(week: AiPlanWeek, startIso: string, weekIndex: number, splitDays: SplitDay[], rhythm: 'rolling' | 'weekly', anchor?: { position: number }, distanceUnit = 'mi'): Session[] {
  /* The window comes from `weekCycleDays` — the same function the volume math
     uses. This was a byte-identical second copy of that rotation, which meant
     the schedule and the mileage that must agree were computed twice and free
     to drift apart on the next edit. */
  const start = new Date(`${startIso}T12:00:00`); start.setDate(start.getDate() + weekIndex * 7);
  const window = weekCycleDays(startIso, weekIndex, splitDays as SplitDayRef[], rhythm, anchor);
  const dayInfos = window.map((entry, index) => {
    const date = new Date(start); date.setDate(start.getDate() + index);
    const day = (entry as unknown as SplitDay);
    /* EVERY GOAL LIFT ON THE DAY, NOT THE FIRST ONE. A Chest & Back day that
       maps both Bench and Pull Ups — two goal lifts — showed only whichever
       came first, so Bench was in the block's focus line and prescribed
       nowhere. All of the day's sets are its prescription. */
    const daySets = (week.topSets || []).filter(set => set.splitDay === day.name);
    const topSets = daySets.length ? daySets : (week.topSets || []).filter(set => splitDayKey(set.splitDay) === splitDayKey(day.name));
    const topSet = topSets[0];
    return { date, day, topSet, topSets, lower: isLowerBodyDay(day, topSet) };
  });
  /* Pass 1 — decide placements. */
  const longIndex = week.longRunMiles > 0 ? dayInfos.findIndex(info => info.day.name === week.longRunDay) : -1;
  let qualityIndex = week.quality && !/no goal/i.test(week.quality)
    ? dayInfos.findIndex((info, index) => info.day.name === week.qualityDay && !info.lower && index !== longIndex)
    : -1;
  if (qualityIndex < 0 && week.quality && !/no goal/i.test(week.quality) && week.qualityDay) {
    /* The AI picked a lower-body day (or a name that doesn't land this week):
       relocate to the best non-lower day — cardio-type first, then any. */
    qualityIndex = dayInfos.findIndex((info, index) => !info.lower && index !== longIndex && info.day.dayType.toLowerCase() === 'cardio');
    if (qualityIndex < 0) qualityIndex = dayInfos.findIndex((info, index) => !info.lower && index !== longIndex && info.day.dayType.toLowerCase() !== 'rest');
  }
  const easyPool = [...(week.easyDays || [])];
  const easySet = new Set<number>();
  dayInfos.forEach((info, index) => {
    if (index === longIndex || index === qualityIndex) return;
    const poolIndex = easyPool.indexOf(info.day.name);
    if (poolIndex >= 0) { easyPool.splice(poolIndex, 1); easySet.add(index); }
  });
  /* Pass 1.5 — one attempt per lift per max week. A rolling split can hit the
     same day three times in seven days, which prescribed the same 1RM attempt
     three times over. The attempt goes to that lift's cleanest session — no
     long run, no quality work — and the day's other appearances drop back to
     the heavy double the lift already earned. */
  const attemptDays = chooseMaxAttemptDays(dayInfos.map((info, index) => ({
    exercise: info.topSet?.exercise,
    reps: info.topSet?.reps,
    hasHold: Boolean(info.topSet?.hold),
    cost: (index === longIndex ? 2 : 0) + (index === qualityIndex ? 3 : 0) + (easySet.has(index) ? 1 : 0),
  })));
  /* Pass 2 — render sessions. */
  return dayInfos.map(({ date, day, topSet: rawTopSet, topSets: rawTopSets }, index) => {
    const demoted = rawTopSet?.reps === 1 && rawTopSet.hold && !attemptDays.has(index);
    const topSet = demoted && rawTopSet?.hold ? { ...rawTopSet, ...rawTopSet.hold } : rawTopSet;
    const extraSets = (rawTopSets || []).slice(1);
    const type = day.dayType.toLowerCase();
    let runText = ''; let runKind: '' | 'Long run' | 'Hard run' | 'Easy run' = ''; let runStress: 'High' | 'Moderate' | 'Low' | undefined;
    if (index === longIndex) { runKind = 'Long run'; runText = `${week.longRunMiles} ${distanceUnit} @ ${week.longRunPace}`; runStress = 'Moderate'; }
    else if (index === qualityIndex) { runKind = 'Hard run'; runText = `${week.quality}${week.qualityPace ? ` @ ${week.qualityPace}` : ''}`; runStress = 'High'; }
    else if (easySet.has(index)) {
      runKind = 'Easy run';
      /* Each easy day carries its own distance — the same number the week's
         mileage is built from — never one duration copied onto every day. */
      const easyIndex = (week.easyDays || []).indexOf(day.name);
      const miles = week.easyRuns?.[easyIndex >= 0 ? easyIndex : 0];
      runText = miles ? `${miles} ${distanceUnit} @ ${week.easyPace}` : `${week.easyMinutes ? `${week.easyMinutes} min` : 'Easy'} @ ${week.easyPace}`;
      runStress = 'Low';
    }
    const setText = (item: AiPlanTopSet) => `${item.exercise}: ${item.weight} × ${item.reps}`;
    const strengthText = topSet
      ? `${topSet.reps === 1 ? '1RM attempt' : 'Top set'} · ${[setText(topSet), ...extraSets.map(setText)].join(' · ')}`
      : (type === 'strength' || type === 'mixed') ? `${(day.muscles || []).filter(muscle => muscle !== 'Cardio').join(' + ') || 'Strength'} · no exercise mapped yet` : '';
    const lifts = topSet ? [topSet, ...extraSets] : [];
    const run = runKind && runText ? { kind: runKind, text: runText } : undefined;
    if (type === 'rest' && !runText) return { date, kind: 'Recovery', title: day.name, detail: 'No strength or cardio scheduled. Optional mobility or easy walking only.', stress: 'Rest' as const, lifts, run };
    if (strengthText && runText) return { date, kind: `${type === 'mixed' ? 'Mixed' : 'Strength'} + ${runKind}`, title: day.name, detail: `${strengthText} · ${runText}`, stress: 'High' as const, lifts, run };
    if (strengthText) return { date, kind: type === 'mixed' ? 'Mixed' : 'Strength', title: day.name, detail: strengthText, stress: 'Moderate' as const, lifts, run };
    if (runText) return { date, kind: runKind, title: day.name, detail: runText, stress: runStress || 'Low', lifts, run };
    return { date, kind: 'Flexible', title: day.name, detail: 'Nothing required today — the week’s running is already covered.', stress: 'Low' as const, lifts, run };
  });
}

export function AiProgramPlan({ goals, profile, splitDays, rhythm = 'rolling', minWeeklyMileage, maxWeeklyMileage }: { goals: CreatedGoal[]; profile: AdaptiveProfile; splitDays: SplitDay[]; rhythm?: 'rolling' | 'weekly'; minWeeklyMileage: number; maxWeeklyMileage: number }) {
  const { records } = useWorkoutHistory();
  const { user } = useAuth();
  const { recommendation, anchorDate } = useDailyRecommendation();
  const { setup } = useProfileSetup();
  const metric = setup?.units === 'Metric';
  /* A recommendation restored from an older cache can arrive without its split
     day. Reading through it blanked the entire Plan tab behind "Forge hit a
     snag" — the block itself was fine. The anchor is an optimisation; the plan
     renders without it. */
  /* The anchor carries the date it is for. Without it the week is drawn one
     day early on any day the athlete has already trained, and the session that
     belongs to tomorrow is painted onto today behind the logged one. */
  const anchor = recommendation?.splitDay ? { position: recommendation.splitDay.position, dateIso: anchorDate } : undefined;
  const [stored, setStored] = useState<StoredAiPlan | null>(null);
  const [storeLoading, setStoreLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [refreshAsk, setRefreshAsk] = useState(false);
  /* Which week the tab is SHOWING. Null means "the one I am in", which is what
     it opens on and what it falls back to when a new block is built — so this
     never strands the screen on week 9 of a block that no longer has one. */
  const [viewWeek, setViewWeek] = useState<number | null>(null);
  /* Written further down, once the block is resolved and there is a week count
     to clamp against; held here because the hook has to run above the early
     returns. */
  const swipeTo = useRef<(direction: 1 | -1) => void>(() => {});
  const swipe = useWeekSwipe(swipeTo);
  const autoAttempted = useRef(false);
  /* Generation UX: ~44s of API time gets staged narration instead of a dead
     spinner, and a generation orphaned by backgrounding the phone retries
     once when the app comes back. */
  const GEN_STAGES = ['Reading your calculated maxes and real paces…', 'Scaling weekly mileage from what you actually run…', 'Writing the 8/6/4/2/1 wave from your calc maxes…', 'Placing runs around your split — never speed work on leg day…', 'Checking every load against your calc maxes…'];
  const [stageIndex, setStageIndex] = useState(0);
  const generateStartedAt = useRef(0);
  const backgroundRetried = useRef(false);
  useEffect(() => {
    if (!generating) { setStageIndex(0); return; }
    const timer = window.setInterval(() => setStageIndex(index => Math.min(index + 1, GEN_STAGES.length - 1)), 11000);
    return () => window.clearInterval(timer);
  }, [generating]); // eslint-disable-line react-hooks/exhaustive-deps
  const generatingStage = GEN_STAGES[stageIndex];

  /* Both maps come from the shared builder, keyed canonically. Keyed raw, this
     screen read "Back Squat 275x5" as a 321 max while Today folded the same
     history to 380 and prescribed forty-five pounds more. */
  const history = useMemo(() => bestsFromHistory(records), [records]);
  /* EACH LIFT'S OWN PLACE IN ITS PROGRESSION, read from the same function
     Today reads, so the two screens cannot disagree about what week a lift is
     in. A future week adds the exposures that lift would collect getting there,
     which is what makes the block a projection rather than a promise. */
  /* WHAT HE IS ACTUALLY RUNNING, so the block cannot be pitched below it. */
  const actualWeekly = useMemo(() => medianWeeklyMiles(records), [records]);
  const actualLongest = useMemo(() => longestContinuousRun(records), [records]);
  const goalLiftSet = useMemo(() => goalLiftNames(goals), [goals]);
  const positions = useMemo(() => liftPositions(records, lift => !goalLiftSet.has(canonicalLiftKey(lift))), [records, goalLiftSet]);
  const rungOf = useCallback((lift: string) => {
    const position = positions.get(canonicalLiftKey(lift));
    return position ? rungFor(position) : undefined;
  }, [positions]);
  const exposuresPerWeek = useCallback((lift: string) => Math.max(1,
    splitDays.filter(day => (day.exercises || []).some(name => canonicalLiftKey(name) === canonicalLiftKey(lift))).length), [splitDays]);
  const bests = history.bests;
  const liftAnchors = history.anchors;
  const bestSingles = history.singles;
  /* Max week is tied to GOALS: only a lift with a Real 1RM goal owes a tested
     single, because that is the only set the goal can register. Every other
     lift holds the double, and no single is offered — not as an option, and
     not when there are no strength goals at all. */
  const goalLifts = useMemo(() => goalLiftNames(goals), [goals]);
  /* Which set each number came from. A calc max of 380 is a conclusion drawn
     from something like 315 × 6, and showing that set is the difference
     between a number the athlete trusts and one that looks invented. */
  const recentRuns = useMemo(() => {
    const runs: Array<{ date: string; activity: string; distance: number; unit: string; minutes: number; pace: string }> = [];
    records.slice(0, 60).forEach(record => (record.cardioSessions || []).forEach(session => {
      /* Pace anchoring uses RUN-shaped work only — a synced ride or swim at
         3:00/mi must never become the athlete's "logged easy pace". */
      if (!runShapedActivity(session.activity || '')) return;
      const miles = cardioMiles(session); const minutes = summarizeCardioDraft(session).minutes;
      if (!miles || !minutes) return;
      const paceCheck = minutes / miles;
      if (paceCheck < 4 || paceCheck > 18) return;
      const paceMinutes = minutes / miles;
      const shownDistance = metric ? Math.round(miles * 1.609344 * 100) / 100 : Math.round(miles * 100) / 100;
      const shownPace = metric ? paceMinutes / 1.609344 : paceMinutes;
      runs.push({ date: record.date, activity: session.activity || 'Run', distance: shownDistance, unit: metric ? 'km' : 'miles', minutes: Math.round(minutes * 10) / 10, pace: `${formatCardioMinutes(shownPace)}/${metric ? 'km' : 'mi'}` });
    }));
    return runs.slice(0, 14);
  }, [records, metric]);
  /* Baseline kickoff: the program needs real data. Until every strength day
     has one logged best and (with an endurance goal) two logged runs exist,
     Forge shows exactly what to do instead of generating a hollow plan. */
  const baseline = useMemo(() => {
    const items: Array<{ key: string; label: string; done: boolean }> = [];
    /* THE GATE USED TO EXCLUDE EXACTLY THE DAYS THAT WERE NOT READY. The old
       filter also required `(day.exercises || []).length`, and the starter
       split every new athlete gets is created with `exercises: []` — so a
       brand-new account matched no days at all, `baseline` came back empty,
       `baselineReady` was therefore true, and the auto-generator fired with
       `calcMaxes: {}`. A minute later that athlete had a ten-week block of
       specific prescribed weights invented from nothing, and resolvePlanWeek
       cannot correct a number it has no logged evidence for — so those numbers
       are what Today and the roadmap showed as their program.

       A day with no exercises mapped is not a day to skip; it is the first
       thing that needs doing. */
    splitDays.filter(day => ['strength', 'mixed'].includes(day.dayType.toLowerCase())).forEach(day => {
      const exercises = day.exercises || [];
      items.push(exercises.length
        ? { key: day.name, label: `Log one honest top set from ${day.name} — ${exercises[0]} works`, done: exercises.some(name => bests.has(canonicalLiftKey(name))) }
        : { key: `${day.name}-exercises`, label: `Choose the exercises for ${day.name} — Forge cannot program a day with none`, done: false });
    });
    if (goals.some(goal => goal.type === 'Endurance')) {
      items.push({ key: 'runs', label: recentRuns.length === 1 ? 'Log one more easy run (1 of 2) — or connect Strava' : 'Log 2 easy runs so Forge learns your real pace — or connect Strava', done: recentRuns.length >= 2 });
    }
    return items;
  }, [splitDays, bests, goals, recentRuns]);
  const baselineReady = baseline.length === 0 || baseline.every(item => item.done);
  /* A GOAL LIFT NO DAY TRAINS IS A GOAL THE BLOCK CANNOT MOVE. Bench sat in
     this block's focus line while no split day mapped it, so it was never
     prescribed, never waved and never tested — and nothing on screen said why.
     Named here, with the one place that fixes it. */
  const untrainedGoalLifts = useMemo(() => goals
    .filter(goal => goal.type === 'Strength' && goal.exercise)
    .map(goal => String(goal.exercise))
    .filter(name => !splitDays.some(day => (day.exercises || []).some(item => canonicalLiftKey(item) === canonicalLiftKey(name))))
    .filter((name, index, all) => all.findIndex(other => canonicalLiftKey(other) === canonicalLiftKey(name)) === index),
  [goals, splitDays]);
  const fingerprint = useMemo(() => planFingerprint({
    goals: goals.map(goal => ({ type: goal.type, exercise: goal.exercise, target: goal.target, date: goal.date })),
    split: splitDays.map(day => ({ name: day.name, type: day.dayType, muscles: day.muscles || [], exercises: day.exercises || [] })),
    /* The mileage bounds are NOT part of the fingerprint. Unedited, they
       default from the trailing week's miles and moved with every run
       logged — and a moved fingerprint means "rebuild", so an unsaved block
       restarted at Week 1 on every visit. The bounds are applied live by the
       resolver anyway; only goals and the split define a block. */
    runningDays: profile.runningDays, mileage: [0, 0],
  }), [goals, splitDays, profile.runningDays]);

  /* A rebuild carries the athlete's standing instruction. Passing it every
     time — including the silent rebuilds Forge starts on its own — is what
     makes it standing rather than a one-off that the next automatic refresh
     quietly undoes. Returns whether the block was actually built, so the
     rebuild sheet can stay open (holding what was typed) when it was not. */
  const regenerate = async (adjustments?: string): Promise<boolean> => {
    if (generating) return false;
    setGenerating(true); setError(''); generateStartedAt.current = Date.now();
    /* A rebuild continues the wave from what has been logged rather than
       restarting at 8 — see StoredAiPlan.waveOffset. */
    const waveOffset = waveOffsetFromHistory(records, goalLifts);
    try {
      const context = {
        blockWeeks: 10,
        units: metric ? 'metric' : 'imperial',
        today: localDayIso(),
        goals: goals.map(goal => ({ type: goal.type, title: goal.title, exercise: goal.exercise, metric: goal.metric, target: goal.target, current: goal.current, deadline: goal.date })),
        profile: { weeklyMileage: profile.weeklyMileage, minWeeklyMileage, maxWeeklyMileage, runningDays: profile.runningDays, longestRunMiles: profile.longestRunMiles, readiness: profile.readiness },
        splitDays: splitDays.map((day, index) => ({ position: index + 1, name: day.name, type: day.dayType, muscles: day.muscles || [], exercises: day.exercises || [] })),
        /* Two distinct numbers, named so the model cannot conflate them: a
           calc max is an Epley estimate from any rep count, a real 1RM is an
           actual logged single. Legacy key names ride along so a not-yet
           redeployed function still reads them. */
        calcMaxes: Object.fromEntries(bests),
        realOneRepMaxes: Object.fromEntries(bestSingles),
        goalLifts: [...goalLifts],
        /* Where this block enters the fixed wave, so the builder narrates the
           block it is actually writing instead of assuming week 1 is 8 reps. */
        waveStartReps: WAVE_REPS[waveOffset % WAVE_REPS.length],
        waveStartWeek: waveOffset + 1,
        loggedBests: Object.fromEntries(bests),
        loggedSingles: Object.fromEntries(bestSingles),
        recentRuns,
        /* The athlete's own words for this rebuild. Absent when they asked for
           a plain regeneration, so the builder is not handed an empty string
           to interpret. */
        ...(adjustments ? { adjustments } : {}),
      };
      const plan = await generateAiPlan(context);
      /* A newly generated block starts unsaved — it has not been approved. */
      const next: StoredAiPlan = { plan, generatedAt: new Date().toISOString(), startDate: localDayIso(), fingerprint, blockWeeks: plan.weeks.length, saved: false, waveOffset, ...(adjustments ? { adjustments } : {}) };
      await saveStoredAiPlan(next, Boolean(user));
      setStored(next);
      return true;
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'The plan service is unreachable.');
      return false;
    } finally { setGenerating(false); }
  };
  /* Saving pins the block; refreshing throws one away, so it asks first. */
  const savePlan = async () => {
    if (!stored || stored.saved) return;
    const next: StoredAiPlan = { ...stored, saved: true, savedAt: new Date().toISOString() };
    setStored(next);
    try { await saveStoredAiPlan(next, Boolean(user)); } catch { setError('Saved on this device — the sync will retry.'); }
  };
  /* null means "just regenerate" — a fresh block with no instructions, which
     also clears any standing request. A string replaces it. The sheet closes
     only when the block actually built, so a refusal (the two-minute cooldown,
     a dropped connection) never costs the athlete what they typed. */
  const rebuild = async (adjustments: string | null) => {
    const ok = await regenerate(adjustments || undefined);
    if (ok) setRefreshAsk(false);
  };

  useEffect(() => { let active = true; loadStoredAiPlan(Boolean(user)).then(loaded => { if (!active) return; setStored(loaded); setStoreLoading(false); }).catch(() => { if (active) setStoreLoading(false); }); return () => { active = false; }; }, [user]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || backgroundRetried.current) return;
      if (generating && generateStartedAt.current && Date.now() - generateStartedAt.current > 100000) {
        backgroundRetried.current = true;
        setGenerating(false);
        window.setTimeout(() => { void regenerate(stored?.adjustments); }, 300);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [generating]); // eslint-disable-line react-hooks/exhaustive-deps
  /* Silent regeneration: no stored block, inputs changed, or under 4 weeks
     left in the block. Runs once per visit; the Refresh button always works. */
  useEffect(() => {
    if (storeLoading || autoAttempted.current || generating) return;
    if (isDemoMode || !user || !goals.length || !splitDays.length) return;
    /* A block goes stale when the athlete has out-lifted what it can ever ask
       of them — a PR past the block's own ceiling deserves a fresh program.

       This compared against WEEK ONE, which is the opposite of a ceiling: week
       one of a wave is deliberately submaximal, and the block Preston was
       looking at opens on heavy doubles. His best calculated max sat more than
       5% above a working double, as it should, so the block read as outgrown
       from the moment it was written — and the Plan page silently rebuilt it
       on every single visit. That is what "Building…" over a disabled Save
       button was: a block being replaced before he could pin it.

       The ceiling is the heaviest thing the block prescribes anywhere, which
       on a 8/6/4/2/max wave is the max week. Passing THAT by 5% means the
       block genuinely has nothing left to ask. */
    const ceiling = (stored?.plan.weeks || []).flatMap(week => week.topSets || []).reduce<Map<string, number>>((peak, set) => {
      const key = canonicalLiftKey(set.exercise);
      const estimate = calculateEstimatedOneRepMax(set.weight, set.reps) || 0;
      if (estimate > (peak.get(key) || 0)) peak.set(key, estimate);
      return peak;
    }, new Map());
    const outgrown = [...ceiling].some(([key, top]) => {
      const best = bests.get(key);
      return Boolean(best && top && best > top * 1.05);
    });
    /* A SAVED PLAN IS PINNED. Forge may notice the block is stale, but it
       does not get to replace a block the athlete approved — only an explicit
       confirmed refresh does. */
    if (stored?.saved) return;
    const stale = !stored || stored.fingerprint !== fingerprint || weeksRemaining(stored) < 4 || outgrown;
    if (stale && baselineReady) { autoAttempted.current = true; void regenerate(stored?.adjustments); }
  }, [storeLoading, stored, fingerprint, user, goals.length, splitDays.length, generating, bests, baselineReady]); // eslint-disable-line react-hooks/exhaustive-deps

  /* A stored block renders even offline/demo; only GENERATION needs a user. */
  const canGenerate = !isDemoMode && Boolean(user);
  if (storeLoading) return <div className="pv"><section className="card pv-state"><span className="eyebrow">YOUR PLAN</span><h3>Loading your plan…</h3></section></div>;
  if (!stored && !canGenerate) return <LongRangeTrainingPlan goals={goals} profile={profile} splitDays={splitDays} rhythm={rhythm} />;
  /* Before the block exists the tab is still useful: it says the one thing
     that is missing, in the athlete's terms, and shows the pre-program plan
     below it so there is always a week to train from. */
  if (!stored && !baselineReady) return <div className="pv">
    <section className="card pv-state">
      <span className="eyebrow">BEFORE YOUR PLAN</span>
      <h3>Forge builds from what you log</h3>
      <p>Every set and run in your plan comes from your own numbers, so it needs a few first. {baseline.filter(item => item.done).length} of {baseline.length} done — when the last one lands, the block builds itself.</p>
      <div className="pv-checklist">{baseline.map(item => <div key={item.key} className={item.done ? 'done' : ''}><b>{item.done ? '✓' : '○'}</b><span>{item.label}</span></div>)}</div>
      <a className="button" href="#/workout">Log today’s session →</a>
    </section>
    <LongRangeTrainingPlan goals={goals} profile={profile} splitDays={splitDays} rhythm={rhythm} />
  </div>;
  if (!stored) return <div className="pv">
    <section className={`card pv-state${generating ? ' busy' : ''}`}>
      <span className="eyebrow">YOUR PLAN</span>
      <h3>{generating ? 'Building your plan…' : 'Your plan isn’t built yet'}</h3>
      <p>{generating ? generatingStage : error || 'A 10-week block — two full 8 / 6 / 4 / 2 / max waves — built from your goals, your split, and what you have logged.'}</p>
      {generating && <small className="pv-eta">About a minute — it’s reading everything you’ve logged.</small>}
      {!generating && <button type="button" className="button" onClick={() => void regenerate()}>Build my plan</button>}
    </section>
    <LongRangeTrainingPlan goals={goals} profile={profile} splitDays={splitDays} rhythm={rhythm} />
  </div>;
  const { plan: storedPlanData } = stored;
  /* LIVE prescriptions: every displayed top set is recomputed from the
     athlete's CURRENT logged best through the 8/6/4/2 wave. Beat a set and
     tomorrow's numbers rise; miss one and the wave holds — the plan reacts
     to the log without waiting for the next block. */
  /* THE GOAL LIFT OWNS ITS DAY. A stored plan can name Hack Squat or Smith
     Machine Squat on a leg day whose mapped list also carries Squat — the
     athlete's actual goal lift. The goal gate then holds that day at a double
     and the goal lift is never waved or tested. Wherever a day maps a lift the
     athlete holds a Real 1RM goal on, that lift is the day's prescription,
     repaired here so an already-generated block heals without regenerating. */
  let liveAdjusted = false;
  const plan = {
    ...storedPlanData,
    weeks: storedPlanData.weeks.map((rawItem, index) => {
      /* One shared resolver — the Coach reads the identical week, so no
         surface can quote a number another surface does not show. */
      const item = resolvePlanWeek(rawItem, splitDays, { runningDays: Number(setup?.runningDays) || profile.runningDays, minWeeklyMileage, maxWeeklyMileage, weeklyMileage: Number(setup?.weeklyMileage) || profile.weeklyMileage, longestRunMiles: profile.longestRunMiles, recentWeeklyMileage: actualWeekly, recentLongestRun: actualLongest }, { weekIndex: index, blockWeeks: storedPlanData.weeks.length, waveIndex: waveIndexOf(stored, index), currentWaveIndex: waveIndexOf(stored, currentWeekIndex(stored)), currentWeekIndex: currentWeekIndex(stored) }, { bests, singles: bestSingles, goalLifts, metric, anchors: liftAnchors, sessions: history.sessions, misses: history.misses, lastAt: history.lastAt, rungOf, exposuresPerWeek }, weekCycleDays(stored.startDate, index, splitDays, rhythm, anchor));
      if (item.adjusted) liveAdjusted = true;
      return item;
    }),
  };
  const currentIndex = currentWeekIndex(stored);
  const weekIndex = Math.max(0, Math.min(viewWeek ?? currentIndex, plan.weeks.length - 1));
  const week = plan.weeks[weekIndex];
  const sessions = aiWeekSessions(week, stored.startDate, weekIndex, splitDays, rhythm, anchor, metric ? 'km' : 'mi');
  /* The week's headline set: the heaviest GOAL lift scheduled that week — any
     of them, not whichever goal happened to be created first — falling back to
     the heaviest set of the week when no goal lift is on the calendar. */
  const headline = (item: AiPlanWeek) => {
    const sets = [...(item.topSets || [])].sort((a, b) => (calculateEstimatedOneRepMax(b.weight, b.reps) || 0) - (calculateEstimatedOneRepMax(a.weight, a.reps) || 0));
    return sets.find(set => testsOneRepMax(set.exercise, goalLifts)) || sets[0];
  };

  /* ── The screen ──────────────────────────────────────────────────────── */
  const unit = metric ? 'kg' : 'lb';
  const distanceUnit = metric ? 'km' : 'mi';
  const todayIso = localDayIso();
  const toPlanSession = (session: Session): PlanSession => ({
    date: session.date,
    title: session.title,
    lifts: session.lifts,
    run: session.run,
    empty: calendarEmptyState(session),
  });
  const weekSessions = sessions.map(toPlanSession);
  const todaySession = weekSessions.find(session => localDayIso(session.date) === todayIso);
  const loggedToday = records.find(record => record.date === todayIso && ((record.topSets || []).some(set => set.completed !== false) || (record.cardioSessions || []).length > 0));
  const waveNow = waveIndexOf(stored, weekIndex);
  /* One sentence that says what this week IS, in the athlete's words. */
  const sentence = (() => {
    const lift = waveSentence(waveNow);
    const miles = week.mileage ? ` ${week.mileage} ${distanceUnit} of running.` : '';
    return `${lift}${miles}`;
  })();
  /* "Week 4 · Sep 28 – Oct 4" — a week away from now needs its dates, because
     the weekday rows below carry a number but not a month. */
  const weekRange = (list: PlanSession[]) => {
    const first = list[0]?.date; const last = list[list.length - 1]?.date;
    if (!first || !last) return '';
    const short = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${short(first)} – ${short(last)}`;
  };
  /* A week that has not happened is a projection, and the screen says so where
     the week is rather than in a note at the bottom of the page. This is the
     sentence the folded "whole block" panel used to carry. */
  const projection = `Weeks past this one are a projection: each time a rep count comes round it asks for one more step. Beat a set and the numbers rise; miss one and they hold.${records.length ? '' : ' Log a set and the first numbers appear.'}`;
  const workoutHref = recommendation ? `/workout?source=recommendation&recommendation=${encodeURIComponent(recommendation.id || recommendation.date)}` : '/workout';
  swipeTo.current = direction => {
    const next = weekIndex + direction;
    if (next >= 0 && next < plan.weeks.length) setViewWeek(next === currentIndex ? null : next);
  };

  return <div className="pv" {...swipe}>
    {untrainedGoalLifts.length > 0 && <section className="card untrained-goal-banner">
      <div>
        <span className="eyebrow">NOT IN YOUR SPLIT</span>
        <strong>{untrainedGoalLifts.join(' and ')} {untrainedGoalLifts.length === 1 ? 'is a goal, but no day trains it' : 'are goals, but no day trains them'}</strong>
        <small>Forge only prescribes movements a split day names, so this lift is never waved and never tested on max week. Add it to the day you train it on and the next block picks it up.</small>
      </div>
      <a className="button" href="#/split">Add it to a day →</a>
    </section>}
    {/* AFTER THE LAST WEEK the tab used to freeze on "Week 10 of 10" with
        every row marked Missed and no way forward. A finished block says so
        and offers the next one. */}
    {weeksRemaining(stored) <= 0 && <section className="card pv-state">
      <span className="eyebrow">BLOCK COMPLETE</span>
      <h3>Your {plan.weeks.length}-week block is done</h3>
      <p>The next block starts from what you lifted and ran in this one. Build it when you are ready to keep going.</p>
      {canGenerate && <button type="button" className="button" disabled={generating} onClick={() => setRefreshAsk(true)}>{generating ? 'Building…' : 'Build the next block'}</button>}
    </section>}
    <PlanProgress weekIndex={weekIndex} current={currentIndex} total={plan.weeks.length}
      waveIndexFor={index => waveIndexOf(stored, index)} sentence={sentence}
      onPick={index => setViewWeek(index === currentIndex ? null : index)} />
    {/* The gap between what a goal needs and what the plan is allowed to give
        belongs where the plan is, not buried in a goal's detail panel. */}
    <MileageGate onChanged={() => setRefreshAsk(true)} />
    <PlanActions
      saved={Boolean(stored.saved)} savedAt={stored.savedAt} generating={generating} canGenerate={canGenerate}
      onSave={() => void savePlan()} onRegenerate={() => setRefreshAsk(true)}
      request={stored.adjustments} requestNote={plan.adjustmentNote} generatedAt={stored.generatedAt}
      error={error && !refreshAsk ? `${error} — showing the stored block.` : undefined} />
    {refreshAsk ? <PlanRebuildModal
      saved={Boolean(stored.saved)}
      standing={stored.adjustments}
      busy={generating}
      stage={generatingStage}
      error={error}
      onCancel={() => { setRefreshAsk(false); setError(''); }}
      onRebuild={adjustments => void rebuild(adjustments)}
    /> : null}
    {/* Today belongs to today. Looking at week six, there is no "today" in it,
        and a card headed TODAY over a week in October would be a lie. */}
    {weekIndex === currentIndex && <TodayCard session={todaySession} unit={unit} logged={loggedToday} workoutHref={workoutHref} />}
    <WeekList sessions={weekSessions} unit={unit} records={records}
      title={weekIndex === currentIndex ? 'This week' : `Week ${weekIndex + 1} · ${weekRange(weekSessions)}`}
      note={weekIndex > currentIndex ? projection : undefined} />
    {liveAdjusted ? <p className="pv-footnote">Loads on this screen follow your latest logged bests, so they can differ from the block as first written.</p> : null}
  </div>;
}
