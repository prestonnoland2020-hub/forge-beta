import { useEffect, useMemo, useRef, useState } from 'react';
import type { CreatedGoal } from './GoalBuilder';
import type { AdaptiveProfile } from '../features/training/AdaptiveTrainingProvider';
import type { PlannedCardio } from './CardioPlanBuilder';
import { LongRangeTrainingPlan } from './LongRangeTrainingPlan';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { useAuth } from '../features/auth/AuthProvider';
import { useDailyRecommendation } from '../features/training/DailyRecommendationProvider';
import { isDemoMode } from '../lib/env';
import { cardioMiles, summarizeCardioDraft } from '../lib/cardioSession';
import {
  generateAiPlan, loadStoredAiPlan, saveStoredAiPlan, planFingerprint,
  weeksRemaining, currentWeekIndex, type AiPlanWeek, type StoredAiPlan,
} from '../features/training/aiPlanService';

type SplitDay = { name: string; dayType: string; muscles?: string[]; exercises?: string[]; cardioPolicy?: 'none' | 'forge' | 'planned'; cardio?: PlannedCardio[] };
type Session = { date: Date; kind: string; title: string; detail: string; stress: 'High' | 'Moderate' | 'Low' | 'Rest' };
const dateText = (date: Date) => date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const epley = (weight: number, reps: number) => Math.round(weight * (1 + reps / 30));

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
function aiWeekSessions(week: AiPlanWeek, startIso: string, weekIndex: number, splitDays: SplitDay[], rhythm: 'rolling' | 'weekly', anchor?: { position: number }): Session[] {
  const cycle = splitDays.length ? splitDays : [{ name: 'Training', dayType: 'strength' }];
  const start = new Date(`${startIso}T12:00:00`); start.setDate(start.getDate() + weekIndex * 7);
  /* The rotation is anchored to the LIVE split cursor: today shows the day
     that is actually due (completion-driven — missed days hold it in place),
     and every other date extends from there. Date arithmetic is only the
     fallback when no cursor is available. */
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const todayAbsolute = Math.floor(today.getTime() / 86400000);
  const anchorIndex = anchor ? cycle.findIndex((_, index) => index + 1 === anchor.position) : -1;
  const dayInfos = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start); date.setDate(start.getDate() + index);
    const absoluteDay = Math.floor(date.getTime() / 86400000);
    const cycleIndex = rhythm !== 'rolling' ? index % cycle.length
      : anchorIndex >= 0 ? (((anchorIndex + (absoluteDay - todayAbsolute)) % cycle.length) + cycle.length) % cycle.length
      : ((absoluteDay % cycle.length) + cycle.length) % cycle.length;
    const day = cycle[cycleIndex];
    const topSet = (week.topSets || []).find(set => set.splitDay === day.name);
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
  /* Pass 2 — render sessions. */
  return dayInfos.map(({ date, day, topSet }, index) => {
    const type = day.dayType.toLowerCase();
    let runText = ''; let runKind = ''; let runStress: 'High' | 'Moderate' | 'Low' | undefined;
    if (index === longIndex) { runKind = 'Long run'; runText = `${week.longRunMiles} mi @ ${week.longRunPace}`; runStress = 'Moderate'; }
    else if (index === qualityIndex) { runKind = 'Quality'; runText = `${week.quality}${week.qualityPace ? ` @ ${week.qualityPace}` : ''}`; runStress = 'High'; }
    else if (easySet.has(index)) { runKind = 'Easy run'; runText = `${week.easyMinutes ? `${week.easyMinutes} min` : 'Easy'} @ ${week.easyPace}`; runStress = 'Low'; }
    const strengthText = topSet ? `Top set · ${topSet.exercise}: ${topSet.weight} × ${topSet.reps}` : (type === 'strength' || type === 'mixed') ? `${(day.muscles || []).filter(muscle => muscle !== 'Cardio').join(' + ') || 'Strength'} · map an exercise for a prescription` : '';
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
  const anchor = recommendation ? { position: recommendation.splitDay.position } : undefined;
  const [stored, setStored] = useState<StoredAiPlan | null>(null);
  const [storeLoading, setStoreLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [openWeek, setOpenWeek] = useState<number | null>(null);
  const autoAttempted = useRef(false);

  const bests = useMemo(() => { const map = new Map<string, number>(); records.forEach(record => (record.topSets || []).forEach(set => { if (set.completed === false || !set.lift || !set.weight) return; const max = set.calculatedMax || epley(set.weight, set.reps); if (max > (map.get(set.lift) || 0)) map.set(set.lift, max); })); return map; }, [records]);
  const recentRuns = useMemo(() => {
    const runs: Array<{ date: string; activity: string; miles: number; minutes: number; pace: string }> = [];
    records.slice(0, 60).forEach(record => (record.cardioSessions || []).forEach(session => {
      /* Pace anchoring uses RUN-shaped work only — a synced ride or swim at
         3:00/mi must never become the athlete's "logged easy pace". */
      if (/bike|ride|swim|row|elliptical|stair|ski|weight|yoga|workout|crossfit/i.test(session.activity || '')) return;
      const miles = cardioMiles(session); const minutes = summarizeCardioDraft(session).minutes;
      if (!miles || !minutes) return;
      const paceCheck = minutes / miles;
      if (paceCheck < 4 || paceCheck > 18) return;
      const paceMinutes = minutes / miles;
      runs.push({ date: record.date, activity: session.activity || 'Run', miles: Math.round(miles * 100) / 100, minutes: Math.round(minutes * 10) / 10, pace: `${Math.floor(paceMinutes)}:${String(Math.round((paceMinutes % 1) * 60)).padStart(2, '0')}/mi` });
    }));
    return runs.slice(0, 14);
  }, [records]);
  const fingerprint = useMemo(() => planFingerprint({
    goals: goals.map(goal => ({ type: goal.type, exercise: goal.exercise, target: goal.target, date: goal.date })),
    split: splitDays.map(day => ({ name: day.name, type: day.dayType, muscles: day.muscles || [], exercises: day.exercises || [] })),
    runningDays: profile.runningDays, mileage: [minWeeklyMileage, maxWeeklyMileage],
  }), [goals, splitDays, profile.runningDays, minWeeklyMileage, maxWeeklyMileage]);

  const regenerate = async () => {
    if (generating) return;
    setGenerating(true); setError('');
    try {
      const context = {
        blockWeeks: 8,
        today: new Date().toISOString().slice(0, 10),
        goals: goals.map(goal => ({ type: goal.type, title: goal.title, exercise: goal.exercise, metric: goal.metric, target: goal.target, current: goal.current, deadline: goal.date })),
        profile: { weeklyMileage: profile.weeklyMileage, minWeeklyMileage, maxWeeklyMileage, runningDays: profile.runningDays, longestRunMiles: profile.longestRunMiles, readiness: profile.readiness },
        splitDays: splitDays.map((day, index) => ({ position: index + 1, name: day.name, type: day.dayType, muscles: day.muscles || [], exercises: day.exercises || [] })),
        loggedBests: Object.fromEntries(bests),
        recentRuns,
      };
      const plan = await generateAiPlan(context);
      const next: StoredAiPlan = { plan, generatedAt: new Date().toISOString(), startDate: new Date().toISOString().slice(0, 10), fingerprint, blockWeeks: plan.weeks.length };
      await saveStoredAiPlan(next, Boolean(user));
      setStored(next);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'The plan service is unreachable.');
    } finally { setGenerating(false); }
  };

  useEffect(() => { let active = true; loadStoredAiPlan(Boolean(user)).then(loaded => { if (!active) return; setStored(loaded); setStoreLoading(false); }).catch(() => { if (active) setStoreLoading(false); }); return () => { active = false; }; }, [user]);
  /* Silent regeneration: no stored block, inputs changed, or under 4 weeks
     left in the block. Runs once per visit; the Refresh button always works. */
  useEffect(() => {
    if (storeLoading || autoAttempted.current || generating) return;
    if (isDemoMode || !user || !goals.length || !splitDays.length) return;
    const stale = !stored || stored.fingerprint !== fingerprint || weeksRemaining(stored) < 4;
    if (stale) { autoAttempted.current = true; void regenerate(); }
  }, [storeLoading, stored, fingerprint, user, goals.length, splitDays.length, generating]); // eslint-disable-line react-hooks/exhaustive-deps

  /* A stored block renders even offline/demo; only GENERATION needs a user. */
  const canGenerate = !isDemoMode && Boolean(user);
  if (storeLoading) return <section className="card plan-generating"><span className="eyebrow">AI PROGRAM</span><h3>Loading your program…</h3></section>;
  if (!stored && !canGenerate) return <LongRangeTrainingPlan goals={goals} profile={profile} splitDays={splitDays} rhythm={rhythm} />;
  if (!stored) return <div className="simple-program">
    <section className={`card plan-generating${generating ? ' busy' : ''}`}>
      <span className="eyebrow">AI PROGRAM</span>
      <h3>{generating ? 'Building your program…' : 'Your program isn’t built yet'}</h3>
      <p>{generating ? 'Forge is reading your goals, split, logged bests, and real paces to write an 8-week block.' : error || 'Forge builds an 8-week block from your goals, split, and logged training.'}</p>
      {!generating && <button type="button" className="button" onClick={() => void regenerate()}>Generate program</button>}
    </section>
    <LongRangeTrainingPlan goals={goals} profile={profile} splitDays={splitDays} rhythm={rhythm} />
  </div>;

  const { plan } = stored;
  const weekIndex = currentWeekIndex(stored);
  const week = plan.weeks[weekIndex];
  const sessions = aiWeekSessions(week, stored.startDate, weekIndex, splitDays, rhythm, anchor);
  const strengthGoal = goals.find(goal => goal.type === 'Strength');
  const generatedLabel = new Date(stored.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const headline = (item: AiPlanWeek) => { const sets = [...(item.topSets || [])]; const goalSet = sets.find(set => strengthGoal && (set.exercise === strengthGoal.exercise || (strengthGoal.exercise || '').toLowerCase().includes(set.exercise.toLowerCase()))); const lead = goalSet || sets.sort((a, b) => epley(b.weight, b.reps) - epley(a.weight, a.reps))[0]; return lead; };

  return <div className="simple-program ai-program">
    <section className="simple-program-head"><div><span className="eyebrow">WEEK {week.week} OF {plan.weeks.length} · {week.phase.toUpperCase()}</span><h2>{week.phase}</h2></div><div className="simple-week-metrics"><div><span>LIFT FOCUS</span><strong>{headline(week)?.exercise || strengthGoal?.exercise || 'Build baseline'}</strong></div><div><span>CARDIO FOCUS</span><strong>{week.mileage ? `${week.mileage} mi this week` : 'Not scheduled'}</strong></div></div></section>
    <section className="card ai-program-meta"><div><span className="eyebrow">AI PROGRAM · GENERATED {generatedLabel.toUpperCase()}</span><p>{plan.summary}</p>{week.note ? <small>{week.note}</small> : null}</div>{canGenerate ? <button type="button" className="button secondary" disabled={generating} onClick={() => void regenerate()}>{generating ? 'Rebuilding…' : 'Refresh plan'}</button> : null}{error ? <small className="ai-program-error">{error} — showing the stored block.</small> : null}</section>
    <section className="card simple-week-schedule"><header><div><span className="eyebrow">YOUR SCHEDULE</span><h3>What to do this week</h3></div></header><div>{sessions.map(session => <article className={`stress-${session.stress.toLowerCase()}`} key={session.date.toISOString()}><time>{dateText(session.date)}</time><div><span className="session-tags">{[...session.kind.split(' + '), session.stress].filter(Boolean).map((tag, index) => <i key={`${tag}-${index}`}>{tag}</i>)}</span><strong>{session.title}</strong><small>{session.detail}</small></div><b>{session.stress === 'Rest' ? 'Rest' : '›'}</b></article>)}</div></section>
    <section className="card roadmap-card"><header className="roadmap-head"><div><span className="eyebrow">THIS BLOCK</span><h3>Where the block takes you</h3></div></header>
      <div className="roadmap-table" role="table"><div className="roadmap-row head" role="row"><span>Week</span><span>Miles</span><span>Long</span><span>Hard run</span><span>Top set · proj. max</span></div>
        {plan.weeks.map((item, index) => { const lead = headline(item); const startLabel = (() => { const date = new Date(`${stored.startDate}T12:00:00`); date.setDate(date.getDate() + index * 7); return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); })(); return <div key={item.week} className="roadmap-week-group">
          <button type="button" className={`roadmap-row phase-${item.phase.toLowerCase()}${openWeek === item.week ? ' open' : ''}`} onClick={() => setOpenWeek(current => current === item.week ? null : item.week)} aria-expanded={openWeek === item.week}>
            <span className="roadmap-week"><b>{item.week}</b><small>{startLabel} · {item.phase}</small></span>
            <span className="roadmap-miles">{item.mileage || '—'}</span>
            <span className="roadmap-long">{item.longRunMiles ? `${item.longRunMiles} mi` : '—'}</span>
            <span className="roadmap-run">{item.quality}</span>
            <span className="roadmap-set">{lead ? <><b>{epley(lead.weight, lead.reps)} max</b><small>{lead.exercise} {lead.weight}×{lead.reps}</small></> : '—'}</span>
          </button>
          {openWeek === item.week && <div className="roadmap-days">{aiWeekSessions(item, stored.startDate, index, splitDays, rhythm, anchor).map(session => <div className={`roadmap-day stress-${session.stress.toLowerCase()}`} key={session.date.toISOString()}><time>{session.date.toLocaleDateString('en-US', { weekday: 'short' })}</time><div><strong>{session.title}</strong><small>{session.detail}</small></div></div>)}</div>}
        </div>; })}</div>
      <small className="roadmap-note">Built from your goals, split, logged bests, and real paces. The next block generates itself from what you actually log.</small></section>
  </div>;
}
