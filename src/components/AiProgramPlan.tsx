import { useEffect, useMemo, useRef, useState } from 'react';
import type { CreatedGoal } from './GoalBuilder';
import type { AdaptiveProfile } from '../features/training/AdaptiveTrainingProvider';
import type { PlannedCardio } from './CardioPlanBuilder';
import { LongRangeTrainingPlan } from './LongRangeTrainingPlan';
import { PlanRebuildModal } from './PlanRebuildModal';
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
  weeksRemaining, currentWeekIndex, wavePrescription, waveSlot, goalLiftNames, testsOneRepMax, resolvePlanWeek, weekCycleDays,
  bestsFromHistory, chooseMaxAttemptDays, type AiPlanWeek, type SplitDayRef, type StoredAiPlan,
} from '../features/training/aiPlanService';

type SplitDay = { name: string; dayType: string; muscles?: string[]; exercises?: string[]; cardioPolicy?: 'none' | 'forge' | 'planned'; cardio?: PlannedCardio[] };
type Session = { date: Date; kind: string; title: string; detail: string; stress: 'High' | 'Moderate' | 'Low' | 'Rest' };
const dateText = (date: Date) => date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

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
    const topSet = (week.topSets || []).find(set => set.splitDay === day.name)
      || (week.topSets || []).find(set => splitDayKey(set.splitDay) === splitDayKey(day.name));
    return { date, day, topSet, lower: isLowerBodyDay(day, topSet) };
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
  return dayInfos.map(({ date, day, topSet: rawTopSet }, index) => {
    const demoted = rawTopSet?.reps === 1 && rawTopSet.hold && !attemptDays.has(index);
    const topSet = demoted && rawTopSet?.hold ? { ...rawTopSet, ...rawTopSet.hold } : rawTopSet;
    const type = day.dayType.toLowerCase();
    let runText = ''; let runKind = ''; let runStress: 'High' | 'Moderate' | 'Low' | undefined;
    if (index === longIndex) { runKind = 'Long run'; runText = `${week.longRunMiles} ${distanceUnit} @ ${week.longRunPace}`; runStress = 'Moderate'; }
    else if (index === qualityIndex) { runKind = 'Quality'; runText = `${week.quality}${week.qualityPace ? ` @ ${week.qualityPace}` : ''}`; runStress = 'High'; }
    else if (easySet.has(index)) {
      runKind = 'Easy run';
      /* Each easy day carries its own distance — the same number the week's
         mileage is built from — never one duration copied onto every day. */
      const easyIndex = (week.easyDays || []).indexOf(day.name);
      const miles = week.easyRuns?.[easyIndex >= 0 ? easyIndex : 0];
      runText = miles ? `${miles} ${distanceUnit} @ ${week.easyPace}` : `${week.easyMinutes ? `${week.easyMinutes} min` : 'Easy'} @ ${week.easyPace}`;
      runStress = 'Low';
    }
    const strengthText = topSet
      ? `${topSet.reps === 1 ? '1RM attempt' : 'Top set'} · ${topSet.exercise}: ${topSet.weight} × ${topSet.reps}`
      : (type === 'strength' || type === 'mixed') ? `${(day.muscles || []).filter(muscle => muscle !== 'Cardio').join(' + ') || 'Strength'} · map an exercise for a prescription` : '';
    if (type === 'rest' && !runText) return { date, kind: 'Recovery', title: day.name, detail: 'No strength or cardio scheduled. Optional mobility or easy walking only.', stress: 'Rest' as const };
    if (strengthText && runText) return { date, kind: `${type === 'mixed' ? 'Mixed' : 'Strength'} + ${runKind}`, title: day.name, detail: `${strengthText} · ${runText}`, stress: 'High' as const };
    if (strengthText) return { date, kind: type === 'mixed' ? 'Mixed' : 'Strength', title: day.name, detail: strengthText, stress: 'Moderate' as const };
    if (runText) return { date, kind: runKind, title: day.name, detail: runText, stress: runStress || 'Low' };
    return { date, kind: 'Flexible', title: day.name, detail: 'Nothing required today — the week’s running is already covered.', stress: 'Low' as const };
  });
}

export function AiProgramPlan({ goals, profile, splitDays, rhythm = 'rolling', minWeeklyMileage, maxWeeklyMileage }: { goals: CreatedGoal[]; profile: AdaptiveProfile; splitDays: SplitDay[]; rhythm?: 'rolling' | 'weekly'; minWeeklyMileage: number; maxWeeklyMileage: number }) {
  const { records } = useWorkoutHistory();
  const { user } = useAuth();
  const { recommendation } = useDailyRecommendation();
  const { setup } = useProfileSetup();
  const metric = setup?.units === 'Metric';
  const anchor = recommendation ? { position: recommendation.splitDay.position } : undefined;
  const [stored, setStored] = useState<StoredAiPlan | null>(null);
  const [storeLoading, setStoreLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [refreshAsk, setRefreshAsk] = useState(false);
  const [openWeek, setOpenWeek] = useState<number | null>(null);
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
  const bests = history.bests;
  const bestSingles = history.singles;
  /* Max week is tied to GOALS: only a lift with a Real 1RM goal owes a tested
     single, because that is the only set the goal can register. Every other
     lift holds the double, and no single is offered — not as an option, and
     not when there are no strength goals at all. */
  const goalLifts = useMemo(() => goalLiftNames(goals), [goals]);
  const testsThisBlock = (exercise: string) => testsOneRepMax(exercise, goalLifts);
  /* Which set each number came from. A calc max of 380 is a conclusion drawn
     from something like 315 × 6, and showing that set is the difference
     between a number the athlete trusts and one that looks invented. */
  type MaxSource = { max: number; weight: number; reps: number; date: string };
  const maxSources = useMemo(() => {
    const map = new Map<string, MaxSource>();
    records.forEach(record => (record.topSets || []).forEach(set => {
      if (set.completed === false || !set.lift || !set.weight) return;
      const max = set.calculatedMax || calculateEstimatedOneRepMax(set.weight, set.reps) || 0;
      const key = canonicalLiftKey(set.lift);
      if (max > (map.get(key)?.max || 0)) map.set(key, { max, weight: set.weight, reps: set.reps, date: record.date });
    }));
    return map;
  }, [records]);
  const singleSources = useMemo(() => {
    const map = new Map<string, { weight: number; date: string }>();
    records.forEach(record => (record.topSets || []).forEach(set => {
      if (set.completed === false || !set.lift || !set.weight || set.reps !== 1) return;
      const key = canonicalLiftKey(set.lift);
      if (set.weight > (map.get(key)?.weight || 0)) map.set(key, { weight: set.weight, date: record.date });
    }));
    return map;
  }, [records]);
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
    splitDays.filter(day => ['strength', 'mixed'].includes(day.dayType.toLowerCase()) && (day.exercises || []).length).forEach(day => {
      items.push({ key: day.name, label: `Log one honest top set from ${day.name} — ${(day.exercises || [])[0]} works`, done: (day.exercises || []).some(name => bests.has(name)) });
    });
    if (goals.some(goal => goal.type === 'Endurance')) {
      items.push({ key: 'runs', label: recentRuns.length === 1 ? 'Log one more easy run (1 of 2) — or connect Strava' : 'Log 2 easy runs so Forge learns your real pace — or connect Strava', done: recentRuns.length >= 2 });
    }
    return items;
  }, [splitDays, bests, goals, recentRuns]);
  const baselineReady = baseline.length === 0 || baseline.every(item => item.done);
  const fingerprint = useMemo(() => planFingerprint({
    goals: goals.map(goal => ({ type: goal.type, exercise: goal.exercise, target: goal.target, date: goal.date })),
    split: splitDays.map(day => ({ name: day.name, type: day.dayType, muscles: day.muscles || [], exercises: day.exercises || [] })),
    runningDays: profile.runningDays, mileage: [minWeeklyMileage, maxWeeklyMileage],
  }), [goals, splitDays, profile.runningDays, minWeeklyMileage, maxWeeklyMileage]);

  /* A rebuild carries the athlete's standing instruction. Passing it every
     time — including the silent rebuilds Forge starts on its own — is what
     makes it standing rather than a one-off that the next automatic refresh
     quietly undoes. Returns whether the block was actually built, so the
     rebuild sheet can stay open (holding what was typed) when it was not. */
  const regenerate = async (adjustments?: string): Promise<boolean> => {
    if (generating) return false;
    setGenerating(true); setError(''); generateStartedAt.current = Date.now();
    try {
      const context = {
        blockWeeks: 10,
        units: metric ? 'metric' : 'imperial',
        today: new Date().toISOString().slice(0, 10),
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
      const next: StoredAiPlan = { plan, generatedAt: new Date().toISOString(), startDate: new Date().toISOString().slice(0, 10), fingerprint, blockWeeks: plan.weeks.length, saved: false, ...(adjustments ? { adjustments } : {}) };
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
    /* A block also goes stale when the athlete has meaningfully out-lifted
       its baseline — a mid-block PR more than ~5% past what the block was
       built on deserves a fresh program, not just a scaled overlay. */
    const outgrown = Boolean(stored?.plan.weeks[0]?.topSets?.some(set => {
      const best = bests.get(canonicalLiftKey(set.exercise));
      return best && best > (calculateEstimatedOneRepMax(set.weight, set.reps) || 0) * 1.05;
    }));
    /* A SAVED PLAN IS PINNED. Forge may notice the block is stale, but it
       does not get to replace a block the athlete approved — only an explicit
       confirmed refresh does. */
    if (stored?.saved) return;
    const stale = !stored || stored.fingerprint !== fingerprint || weeksRemaining(stored) < 4 || outgrown;
    if (stale && baselineReady) { autoAttempted.current = true; void regenerate(stored?.adjustments); }
  }, [storeLoading, stored, fingerprint, user, goals.length, splitDays.length, generating, bests, baselineReady]); // eslint-disable-line react-hooks/exhaustive-deps

  /* A stored block renders even offline/demo; only GENERATION needs a user. */
  const canGenerate = !isDemoMode && Boolean(user);
  if (storeLoading) return <section className="card plan-generating"><span className="eyebrow">AI PROGRAM</span><h3>Loading your program…</h3></section>;
  if (!stored && !canGenerate) return <LongRangeTrainingPlan goals={goals} profile={profile} splitDays={splitDays} rhythm={rhythm} />;
  if (!stored && !baselineReady) return <div className="simple-program">
    <section className="card baseline-kickoff">
      <span className="eyebrow">BEFORE YOUR PROGRAM</span>
      <h3>Forge builds from what you log</h3>
      <p>Your program prescribes every top set and run from your own numbers. It needs a baseline first — {baseline.filter(item => item.done).length} of {baseline.length} done, and the moment the last one lands your 8-week block builds itself.</p>
      <div className="baseline-items">{baseline.map(item => <div key={item.key} className={item.done ? 'done' : ''}><b>{item.done ? '✓' : '○'}</b><span>{item.label}</span></div>)}</div>
      <a className="button" href="#/workout">Log today’s session →</a>
    </section>
  </div>;
  if (!stored) return <div className="simple-program">
    <section className={`card plan-generating${generating ? ' busy' : ''}`}>
      <span className="eyebrow">AI PROGRAM</span>
      <h3>{generating ? 'Building your program…' : 'Your program isn’t built yet'}</h3>
      <p>{generating ? generatingStage : error || 'Forge builds a 10-week block — two full 8/6/4/2/1 waves — from your goals, split, and logged training.'}</p>
      {generating && <small className="plan-generating-eta">Takes about a minute — it’s reading everything you’ve logged.</small>}
      {!generating && <button type="button" className="button" onClick={() => void regenerate()}>Generate program</button>}
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
      const item = resolvePlanWeek(rawItem, splitDays, { runningDays: Number(setup?.runningDays) || profile.runningDays, minWeeklyMileage, maxWeeklyMileage, weeklyMileage: Number(setup?.weeklyMileage) || profile.weeklyMileage }, { weekIndex: index, blockWeeks: storedPlanData.weeks.length }, { bests, singles: bestSingles, goalLifts, metric }, weekCycleDays(stored.startDate, index, splitDays, rhythm, anchor));
      if (item.adjusted) liveAdjusted = true;
      return item;
    }),
  };
  const weekIndex = currentWeekIndex(stored);
  const week = plan.weeks[weekIndex];
  const sessions = aiWeekSessions(week, stored.startDate, weekIndex, splitDays, rhythm, anchor, metric ? 'km' : 'mi');
  /* EVERY goal lift is live in the block — each one owns its day and each one
     is tested on max week — so the block's framing names them all. Picking
     goals[0] made the header read "LIFT FOCUS · Pull Ups" purely because that
     goal was created first, hiding Squat and Bench from a plan that trains
     them just as hard. */
  const foldedLookup = <T,>(table: Map<string, T>, name: string): T | undefined =>
    table.get(name) ?? [...table.entries()].find(([lift]) => canonicalLiftKey(lift) === canonicalLiftKey(name))?.[1];
  const goalLiftEntries = goals
    .filter(goal => goal.type === 'Strength' && goal.exercise)
    .map(goal => ({ name: String(goal.exercise), best: foldedLookup(bests, String(goal.exercise)) }))
    .filter((entry, index, all) => all.findIndex(other => canonicalLiftKey(other.name) === canonicalLiftKey(entry.name)) === index);
  const trainedGoalLifts = goalLiftEntries.filter(entry => entry.best);
  const strengthGoal = goals.find(goal => goal.type === 'Strength');
  const generatedLabel = new Date(stored.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  /* The week's headline set: the heaviest GOAL lift scheduled that week — any
     of them, not whichever goal happened to be created first — falling back to
     the heaviest set of the week when no goal lift is on the calendar. */
  const headline = (item: AiPlanWeek) => {
    const sets = [...(item.topSets || [])].sort((a, b) => (calculateEstimatedOneRepMax(b.weight, b.reps) || 0) - (calculateEstimatedOneRepMax(a.weight, a.reps) || 0));
    return sets.find(set => testsOneRepMax(set.exercise, goalLifts)) || sets[0];
  };

  return <div className="simple-program ai-program">
    <section className="simple-program-head"><div><span className="eyebrow">WEEK {week.week} OF {plan.weeks.length} · {weekIndex % 5 === 4 ? 'MAX WEEK' : week.phase.toUpperCase()}</span><h2>{weekIndex % 5 === 4 ? 'Max Week' : week.phase}</h2></div><div className="simple-week-metrics"><div><span>LIFT FOCUS</span><strong>{goalLiftEntries.length ? goalLiftEntries.map(entry => entry.name).join(' · ') : headline(week)?.exercise || 'Build baseline'}</strong></div><div><span>CARDIO FOCUS</span><strong>{week.mileage ? `${week.mileage} ${metric ? 'km' : 'mi'} this week` : 'Not scheduled'}</strong></div></div></section>
    {/* The block's numbers are stated by the ledgers and the schedule below;
        this card is the two actions and the stamp that says which block they
        act on. The generated summary was an essay repeating what those cards
        already show. */}
    <section className="card ai-program-meta compact"><div><span className="eyebrow">AI PROGRAM · GENERATED {generatedLabel.toUpperCase()}</span>{generating ? <small className="ai-program-progress">{generatingStage}</small> : null}{stored.adjustments && !generating ? <small className="plan-adjustment"><b>You asked:</b> “{stored.adjustments}”{plan.adjustmentNote ? ` — ${plan.adjustmentNote}` : ''}</small> : null}</div><div className="plan-actions">
      {/* Saving is a local pin — it needs no backend, so it is offered
          wherever a block exists. Refreshing calls the plan service. */}
      {stored.saved
        ? <span className="plan-saved-badge" title={stored.savedAt ? `Saved ${new Date(stored.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : undefined}>✓ Plan saved</span>
        : <button type="button" className="button" disabled={generating} onClick={() => void savePlan()}>Save plan</button>}
      {/* The block already exists, so the honest verb is REGENERATE. "Generate
          plan" read as though it might build the plan that was missing, when
          what it does is throw this one away and build another. */}
      {canGenerate ? <button type="button" className="button secondary" disabled={generating} onClick={() => setRefreshAsk(true)}>{generating ? 'Regenerating…' : 'Regenerate plan'}</button> : null}
    </div>{error && !refreshAsk ? <small className="ai-program-error">{error} — showing the stored block.</small> : null}
    </section>
    {refreshAsk ? <PlanRebuildModal
      saved={Boolean(stored.saved)}
      standing={stored.adjustments}
      busy={generating}
      stage={generatingStage}
      error={error}
      onCancel={() => { setRefreshAsk(false); setError(''); }}
      onRebuild={adjustments => void rebuild(adjustments)}
    /> : null}
    {(() => {
      /* The block's thesis, stated in numbers — ONCE PER GOAL LIFT. The block
         trains every Real 1RM goal at the same time: each goal lift owns its
         day and each is tested on max week, so each gets its own ledger. This
         card used to show only the first-created goal, which made a plan that
         is building Pull Ups, Squat AND Bench look like a pull-up block. */
      const unit = metric ? 'kg' : 'lb';
      const maxIndexes = plan.weeks.map((_, index) => index).filter(index => index % 5 === 4);
      const nextMax = maxIndexes.find(index => index >= weekIndex) ?? maxIndexes[maxIndexes.length - 1];
      if (nextMax === undefined || !trainedGoalLifts.length) return null;
      const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const maxWeekDate = (() => { const date = new Date(`${stored.startDate}T12:00:00`); date.setDate(date.getDate() + nextMax * 7); return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); })();
      return <section className="goal-ledger-stack">
        <div className="goal-ledger-caption"><span className="eyebrow">WHAT THIS BLOCK IS FOR</span><small>{trainedGoalLifts.length === 1 ? 'Your goal lift, and the single that would move it.' : `All ${trainedGoalLifts.length} goal lifts progress together — each owns its day and each is tested on max week.`}</small></div>
        {trainedGoalLifts.map(entry => {
          const best = entry.best!;
          const source = foldedLookup(maxSources, entry.name);
          const single = foldedLookup(singleSources, entry.name);
          const attempt = wavePrescription(best, nextMax, metric, foldedLookup(bestSingles, entry.name) || 0, true);
          /* When the calc max came from a single, it IS the real 1RM — the two
             tiles show the same number, and calling that number "estimated" is
             wrong. Say it was measured instead, so the match reads as agreement
             rather than as a duplicated row. */
          const measured = source?.reps === 1;
          return <details className="card max-ledger" key={entry.name}>
            {/* THE TWO NUMBERS LOOK LIKE A CONTRADICTION UNTIL ONE SENTENCE
                EXPLAINS THEM. "Calc max 517 → max week 485 × 1" reads as the
                plan asking for LESS than the athlete can do. It is not: 517 is
                Epley's estimate from a rep set, 475 is what he has actually
                held for a single, and 485 is the next real single. The line
                that says so belongs on the row he actually sees, not only
                inside the card he has to open. */}
            <summary><div><span className="eyebrow">{entry.name.toUpperCase()}</span><strong>Calc max {best} {unit} → max week {attempt.weight} × 1</strong>
              {single && attempt.weight < best
                ? <small className="max-ledger-why">{attempt.weight} is {attempt.weight - single.weight} {unit} over your real {single.weight} single — {best} is estimated from reps, not lifted.</small>
                : !single ? <small className="max-ledger-why">No real single on record yet, so this is your first true attempt at {entry.name}.</small> : null}
            </div><b>＋</b></summary>
            <div className="max-ledger-body">
              <h3>Turning a calculated max into a real one</h3>
              <div className="ledger-rail">
                <div><span>Calc max now</span><strong>{best} {unit}</strong><small>{!source ? 'from your best logged set' : measured ? `measured — a real single on ${shortDate(source.date)}, not an estimate` : `estimated from ${source.weight} × ${source.reps} on ${shortDate(source.date)}`}</small></div>
                <div><span>Real 1RM on record</span><strong className={single ? '' : 'ledger-empty'}>{single ? `${single.weight} ${unit}` : 'None yet'}</strong><small>{single ? `logged ${shortDate(single.date)}` : 'no single logged for this lift'}</small></div>
                <div className="ledger-target"><span>Max week attempt</span><strong>{attempt.weight} × 1</strong><small>week {nextMax + 1} · {maxWeekDate}</small></div>
              </div>
              <p>Weeks 1–4 train at what your <strong>{best} {unit}</strong> calculated max says you can already handle — the same max expressed at 8, 6, 4, then 2 reps. Max week cashes it in: {single ? <>a single above your real <strong>{single.weight} {unit}</strong>.</> : <>your first real single on this lift.</>} A logged single is the only set a Real 1RM goal counts, and it raises the calc max the next wave anchors to.</p>
            </div>
          </details>;
        })}
      </section>;
    })()}
    {(() => {
      const lead = headline(week);
      const best = lead ? bests.get(lead.exercise) : undefined;
      if (!lead || !best) return null;
      const slot = waveSlot(weekIndex);
      const unit = metric ? 'kg' : 'lb';
      return <details className="card wave-explainer"><summary><div><span className="eyebrow">WHY THESE NUMBERS</span><strong>How Forge computed {lead.exercise} {lead.weight} × {lead.reps}</strong><small>The same arithmetic runs on every lift this week.</small></div><b>＋</b></summary><div className="wave-explainer-body">
        <div><b>1</b><p>Your best logged {lead.exercise} implies a calculated max of <strong>{best} {unit}</strong> (weight × (1 + reps ÷ 30)).</p></div>
        <div><b>2</b><p>This is {slot.isMax && testsThisBlock(lead.exercise) ? <>the <strong>max week</strong> — a true <strong>1RM attempt</strong> ~5–10 {unit} above your last PR</> : slot.isMax ? <>the <strong>max week</strong>, but {lead.exercise} has no Real 1RM goal, so it holds a <strong>heavy double</strong> rather than spending a test it doesn't owe — the single is offered if you're fresh</> : <>an <strong>{slot.reps}-rep week</strong> of the 8/6/4/2/1 wave — the same max expressed at {slot.reps} reps</>}.</p></div>
        <div><b>3</b><p>That converts to <strong>{lead.weight} × {lead.reps}</strong>. Beat it and every number rises with your new best; miss it and the wave holds instead of assuming progress. The week after a max attempt stays at your current numbers until the new PR is actually logged — then the whole wave steps up.</p></div>
      </div></details>;
    })()}
    <section className="card simple-week-schedule"><header><div><span className="eyebrow">YOUR SCHEDULE</span><h3>What to do this week</h3></div></header><div>{sessions.map(session => {
      /* The week reflects what actually happened: a day with logged training
         gets its tick and shows what was done; a past day with nothing is
         marked missed rather than pretending it is still coming. Future days
         stay prescriptive. */
      /* BOTH SIDES OF THIS COMPARISON MUST BE THE SAME CALENDAR. session.date
         is built at local noon, so toISOString() gave the LOCAL day, while
         todayIso gave the UTC day — and after about 5 pm Pacific the UTC clock
         has already rolled over, so `iso < todayIso` was true for today and
         the athlete watched the session they were about to do get marked
         "Missed" while the evening was still in front of them. East of
         UTC+12 it failed the other way and completed days never got their
         tick. */
      const iso = localDayIso(session.date);
      const todayIso = localDayIso();
      const logged = records.find(record => record.date === iso && ((record.topSets || []).some(set => set.completed !== false) || (record.cardioSessions || []).length > 0 || record.muscles.some(muscle => muscle !== 'Cardio')));
      const missed = !logged && iso < todayIso && session.stress !== 'Rest';
      const doneDetail = logged ? [
        ...(logged.topSets || []).filter(set => set.completed !== false).slice(0, 2).map(set => `${set.lift} ${set.weight}×${set.reps}`),
        ...(logged.cardioSessions || []).slice(0, 1).map(cardioSession => cardioSession.summary || cardioSession.activity),
      ].filter(Boolean).join(' · ') : '';
      return <article className={`stress-${session.stress.toLowerCase()}${logged ? ' is-done' : ''}${missed ? ' is-missed' : ''}`} key={session.date.toISOString()}><time>{dateText(session.date)}</time><div><span className="session-tags">{[...session.kind.split(' + '), session.stress].filter(Boolean).map((tag, index) => <i key={`${tag}-${index}`}>{tag}</i>)}</span><strong>{logged ? (logged.title || session.title) : session.title}</strong><small>{logged ? (doneDetail || 'Logged') : missed ? `Missed — ${session.detail}` : session.detail}</small></div><b className={logged ? 'session-done-tick' : ''}>{logged ? '✓' : missed ? '·' : session.stress === 'Rest' ? 'Rest' : '›'}</b></article>;
    })}</div></section>
    <section className="card roadmap-card"><header className="roadmap-head"><div><span className="eyebrow">THIS BLOCK</span><h3>Where the block takes you</h3></div></header>
      <div className="roadmap-table" role="table"><div className="roadmap-row head" role="row"><span>Week</span><span>Miles</span><span>Long</span><span>Hard run</span><span>Top set · proj. max</span></div>
        {plan.weeks.map((item, index) => { const lead = headline(item); const startLabel = (() => { const date = new Date(`${stored.startDate}T12:00:00`); date.setDate(date.getDate() + index * 7); return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); })(); return <div key={item.week} className="roadmap-week-group">
          <button type="button" className={`roadmap-row phase-${item.phase.toLowerCase()}${openWeek === item.week ? ' open' : ''}`} onClick={() => setOpenWeek(current => current === item.week ? null : item.week)} aria-expanded={openWeek === item.week}>
            <span className="roadmap-week"><b>{item.week}</b><small>{startLabel}{index % 5 === 4 ? <i className="max-week-tag">MAX WEEK</i> : ` · ${item.phase}`}</small></span>
            <span className="roadmap-miles">{item.mileage || '—'}</span>
            <span className="roadmap-long">{item.longRunMiles ? `${item.longRunMiles} ${metric ? 'km' : 'mi'}` : '—'}</span>
            <span className="roadmap-run">{item.quality}</span>
            <span className="roadmap-set">{lead ? <><b>{calculateEstimatedOneRepMax(lead.weight, lead.reps)} max</b><small>{lead.exercise} {lead.weight}×{lead.reps}</small></> : '—'}</span>
          </button>
          {openWeek === item.week && <div className="roadmap-days">{aiWeekSessions(item, stored.startDate, index, splitDays, rhythm, anchor, metric ? 'km' : 'mi').map(session => <div className={`roadmap-day stress-${session.stress.toLowerCase()}`} key={session.date.toISOString()}><time>{session.date.toLocaleDateString('en-US', { weekday: 'short' })}</time><div><strong>{session.title}</strong><small>{session.detail}</small></div></div>)}</div>}
        </div>; })}</div>
      <small className="roadmap-note">Built from your goals, split, calculated maxes, and real paces. The next block generates itself from what you actually log.</small></section>
  </div>;
}
