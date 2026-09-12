import type { CreatedGoal } from '../components/GoalBuilder';
import type { WorkoutRecord } from '../features/training/WorkoutHistoryProvider';
import { calculateEstimatedOneRepMax } from './strength';
import { sameLift } from './liftAliases';
import { predictRaceFromLegacyMethod } from './cardioPrediction';
import { cardioMiles, summarizeCardioDraft } from './cardioSession';
import { clockToSeconds, localDayIso } from './time';
import { countsAsRunVolume, isRaceEvidence, anchorsPace } from './runQuality';

/* WHAT THE COACH WAS NEVER TOLD.

   Asked "am I on track for my goal?", Forge answered with a list of gaps: 25 lb
   from a 500 squat, 40 from a 400 bench, and then two complaints — that the
   running goals were "not verified" and that body-weight progress "can't be
   assessed without a current logged weight". Preston had weighed in that
   morning and every morning before it, and had run 13.9 miles the week before
   against a 14-mile target.

   Both of those were true statements about the CONTEXT the coach receives, and
   false statements about the athlete. The Goals tab computes a weekly rate, a
   projection at the deadline and a confidence for every goal; the coach was
   handed the goal's target and deadline and nothing else, so it did the only
   thing it could and described the gap.

   A gap is not an answer. "You are gaining 1.4 lb a week and need 1.9" is an
   answer, and it is arithmetic Forge already knows how to do. This module is
   that arithmetic, in one place, for the coach and the Goals tab both. */

export type GoalVerdict = 'On track' | 'Behind the rate' | 'No trend yet' | 'Reached';
export type GoalTrajectory = {
  goal: string;
  type: string;
  target: string;
  deadline: string;
  weeksRemaining: number;
  /* What the athlete has actually done, and how it was measured. */
  demonstrated: string | null;
  demonstratedOn: string | null;
  /* Movement per week, from their own results, and where that lands them. */
  weeklyRate: string | null;
  projected: string | null;
  requiredRate: string | null;
  confidence: 'Low' | 'Medium' | 'High';
  verdict: GoalVerdict;
  /* When there is no trend, THIS is the session that would create one. Never
     "no assessment is available" with nothing after it. */
  missing: string | null;
};

const DAY = 86_400_000;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const weeksUntil = (deadline: string) => {
  const ms = new Date(`${deadline}T12:00:00`).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.round(((ms - Date.now()) / 604800000) * 10) / 10) : 12;
};
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
const round1 = (value: number) => Math.round(value * 10) / 10;

/* THEIL-SEN, THE SAME AS EVERYWHERE ELSE IN FORGE. The median of the slopes
   between every pair of results, so one lucky session moves it by a place
   rather than deciding it. */
const ratePerWeek = (points: Array<{ date: string; value: number }>): number | null => {
  if (points.length < 3) return null;
  const slopes: number[] = [];
  points.forEach((left, index) => points.slice(index + 1).forEach(right => {
    const weeks = (new Date(`${right.date}T12:00:00`).getTime() - new Date(`${left.date}T12:00:00`).getTime()) / 604800000;
    if (weeks >= 0.5) slopes.push((right.value - left.value) / weeks);
  }));
  return slopes.length ? median(slopes) : null;
};

const bestPerDay = (points: Array<{ date: string; value: number }>, lowerIsBetter: boolean) =>
  [...points.reduce<Map<string, { date: string; value: number }>>((days, point) => {
    const existing = days.get(point.date);
    if (!existing || (lowerIsBetter ? point.value < existing.value : point.value > existing.value)) days.set(point.date, point);
    return days;
  }, new Map()).values()].sort((a, b) => a.date.localeCompare(b.date));

/* Every logged run, with the pace it was actually covered at. */
/* A WALK LOGGED AS A RUN IS NOT RUNNING VOLUME. Preston has miles in here at
   20:00 and 15:16 a mile; counting them told the plan he had a base he has not
   built, and told the feasibility model he was closer than he is. Classified
   once, in runQuality, so every surface throws out the same things. */
const runs = (records: WorkoutRecord[]) => records.flatMap(record => (record.cardioSessions || []).flatMap(session => {
  const miles = cardioMiles(session);
  const minutes = summarizeCardioDraft(session).minutes;
  if (!miles || !minutes || !/run/i.test(`${session.activity} ${session.summary || ''}`)) return [];
  if (!countsAsRunVolume(miles, minutes * 60)) return [];
  return [{ date: record.date, miles, minutes }];
}));

/* THE WEEK'S RUNNING, WEEK BY WEEK — not one average.

   The coach told Preston his mileage was 9.3 against a 14-mile target on a
   Wednesday, two days into a week, while his last three finished weeks read
   11.2, 12.3 and 13.9. An average over a window that includes a part-finished
   week is not this week's mileage and it is not last week's either; it is a
   number that describes nothing and reads as a verdict. The series says what
   happened, and marks the week that has not finished yet. */
export type RunningWeek = { weekOf: string; miles: number; partial: boolean };
export function weeklyRunning(records: WorkoutRecord[], weeks = 8): RunningWeek[] {
  /* A LOCAL DATE, KEPT LOCAL. This built the date at local noon and then
     serialised it with toISOString(), which is UTC — at +13 or +14 local noon
     is the previous UTC day, so the shift was applied twice and every bucket
     key missed its label. An athlete in Kiritimati was told they had run zero
     miles every week, with no week marked partial. */
  const monday = (iso: string) => {
    const date = new Date(`${iso}T12:00:00`);
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const thisWeek = monday(localDayIso());
  const totals = new Map<string, number>();
  runs(records).forEach(run => {
    const week = monday(run.date);
    totals.set(week, (totals.get(week) || 0) + run.miles);
  });
  const start = new Date(`${thisWeek}T12:00:00`);
  return Array.from({ length: weeks }, (_, index) => {
    const date = new Date(start); date.setDate(start.getDate() - (weeks - 1 - index) * 7);
    const weekOf = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { weekOf, miles: round1(totals.get(weekOf) || 0), partial: weekOf === thisWeek };
  });
}

/* WHAT THE ATHLETE WEIGHS, WHICH FORGE HAS ALWAYS KNOWN AND NEVER SAID.
   Body weight is logged with the workout and stored on the record; it simply
   was not in anything the coach received. */
export type BodyWeightPoint = { date: string; weight: number };
export function bodyWeightSeries(records: WorkoutRecord[], limit = 20): BodyWeightPoint[] {
  return records
    .filter(record => typeof record.bodyWeight === 'number' && record.bodyWeight > 0)
    .map(record => ({ date: record.date, weight: record.bodyWeight as number }))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

const strengthEvidence = (goal: CreatedGoal, records: WorkoutRecord[]) =>
  bestPerDay(records.flatMap(record => (record.topSets || [])
    .filter(set => set.completed !== false && goal.exercise && sameLift(set.lift, goal.exercise) && set.weight > 0 && set.reps > 0)
    .map(set => ({ date: record.date, value: calculateEstimatedOneRepMax(set.weight, set.reps) || 0 }))), false)
    .filter(point => point.value > 0);

const trueSingles = (goal: CreatedGoal, records: WorkoutRecord[]) =>
  records.flatMap(record => (record.topSets || [])
    .filter(set => set.completed !== false && goal.exercise && sameLift(set.lift, goal.exercise) && set.reps === 1 && set.weight > 0)
    .map(set => ({ date: record.date, value: set.weight })))
    .sort((a, b) => b.value - a.value);

const raceMiles = (goal: CreatedGoal): number | null => {
  const name = `${goal.exercise || ''} ${goal.title}`.toLowerCase();
  if (/half marathon/.test(name)) return 13.1094;
  if (/marathon/.test(name)) return 26.2188;
  if (/10k/.test(name)) return 6.21371;
  if (/5k/.test(name)) return 3.10686;
  const named = name.match(/\b(\d+(?:\.\d+)?)\s*miles?\b/);
  if (named) return Number(named[1]);
  if (/\bmile\b/.test(name)) return 1;
  return null;
};

/* One goal, answered the way a coach would: what you have done, how fast you
   are moving, where that lands you, and — when it lands you short — what the
   rate would have to be. */
function strengthTrajectory(goal: CreatedGoal, records: WorkoutRecord[]): GoalTrajectory {
  const target = Number(String(goal.target || '').replace(/[^0-9.]/g, '')) || 0;
  const weeks = weeksUntil(goal.date);
  const evidence = strengthEvidence(goal, records);
  const singles = trueSingles(goal, records);
  const wantsSingle = /real 1rm|1rm/i.test(goal.metric || '');
  const bestEstimate = evidence.reduce((peak, point) => Math.max(peak, point.value), 0);
  /* A REAL 1RM GOAL WANTS A LOGGED SINGLE, AND STILL HAS TO SAY WHAT EXISTS.
     Reading only singles meant an athlete with months of rep work and no test
     day was reported as having logged nothing at all — the same "you have no
     data" that sent us here. The single leads when there is one; otherwise the
     rep work stands in, labelled as the estimate it is. */
  const single = singles[0]?.value || 0;
  const demonstrated = wantsSingle ? (single || bestEstimate) : bestEstimate;
  const estimated = wantsSingle && !single && bestEstimate > 0;
  const recent = evidence.filter(point => Date.now() - new Date(`${point.date}T12:00:00`).getTime() <= 120 * DAY).slice(-8);
  const rate = ratePerWeek(recent);
  const unit = goal.unit || 'lb';
  const required = weeks > 0 && demonstrated ? (target - demonstrated) / weeks : null;

  if (demonstrated && target && demonstrated >= target) {
    return { goal: goal.title, type: goal.type, target: `${target} ${unit}`, deadline: goal.date, weeksRemaining: weeks,
      demonstrated: `${Math.round(demonstrated)} ${unit}${estimated ? ' (estimated from rep work, no logged single)' : ''}`,
      demonstratedOn: (wantsSingle && single ? singles[0]?.date : evidence.at(-1)?.date) || null,
      weeklyRate: null, projected: null, requiredRate: null, confidence: 'High', verdict: 'Reached', missing: null };
  }
  if (rate === null || !demonstrated) {
    return { goal: goal.title, type: goal.type, target: `${target} ${unit}`, deadline: goal.date, weeksRemaining: weeks,
      demonstrated: demonstrated ? `${Math.round(demonstrated)} ${unit}${estimated ? ' (estimated from rep work, no logged single)' : ''}` : null,
      demonstratedOn: (wantsSingle && single ? singles[0]?.date : evidence.at(-1)?.date) || null,
      weeklyRate: null, projected: null,
      requiredRate: required === null ? null : `${round1(required)} ${unit}/week`,
      confidence: 'Low',
      verdict: 'No trend yet',
      missing: !demonstrated
        ? `A logged ${goal.exercise} top set. Nothing has been recorded for it yet.`
        : `Three comparable ${goal.exercise} top sets inside 120 days would establish a rate; there ${recent.length === 1 ? 'is 1' : `are ${recent.length}`}.${estimated ? ` No single has been logged either, so ${Math.round(demonstrated)} ${unit} is estimated from rep work.` : ''}`,
    };
  }
  /* The same guard the Goals tab uses: normal session variation is not lost
     strength, and no extrapolation runs away from the athlete. */
  const capped = Math.max(-demonstrated * 0.004, Math.min(demonstrated * 0.006, rate < 0 ? 0 : rate));
  const projected = demonstrated + capped * weeks;
  const confidence: GoalTrajectory['confidence'] = recent.length >= 6 ? 'High' : recent.length >= 3 ? 'Medium' : 'Low';
  return {
    goal: goal.title, type: goal.type, target: `${target} ${unit}`, deadline: goal.date, weeksRemaining: weeks,
    demonstrated: `${Math.round(demonstrated)} ${unit}${estimated ? ' (estimated from rep work, no logged single)' : ''}`,
    demonstratedOn: (wantsSingle && single ? singles[0]?.date : evidence.at(-1)?.date) || null,
    weeklyRate: `${round1(capped)} ${unit}/week`,
    projected: `${Math.round(projected)} ${unit} by ${goal.date}`,
    requiredRate: required === null ? null : `${round1(required)} ${unit}/week`,
    confidence,
    verdict: projected >= target ? 'On track' : 'Behind the rate',
    missing: null,
  };
}

function raceTrajectory(goal: CreatedGoal, records: WorkoutRecord[]): GoalTrajectory {
  const miles = raceMiles(goal);
  const targetSeconds = clockToSeconds(String(goal.target || '')) || Number(goal.target) * 60 || 0;
  const weeks = weeksUntil(goal.date);
  const model = miles ? predictRaceFromLegacyMethod(records, miles) : null;
  const base = {
    goal: goal.title, type: goal.type,
    target: targetSeconds ? clock(targetSeconds) : String(goal.target || ''),
    deadline: goal.date, weeksRemaining: weeks,
  };
  if (!model) {
    return { ...base, demonstrated: null, demonstratedOn: null, weeklyRate: null, projected: null, requiredRate: null,
      confidence: 'Low', verdict: 'No trend yet',
      /* NAME THE SESSION. The coach reported "no exact mile/2-mile/5K test"
         as though the athlete had failed to bring one; the test is the
         coach's to program. */
      missing: miles
        ? `One hard continuous ${miles < 1.2 ? 'mile' : miles < 2.5 ? '2 mile' : miles < 3.5 ? '5K' : `${round1(miles)} mile`} effort inside 180 days. Nothing qualifying has been logged, so this goal has no measured baseline.`
        : 'A goal distance Forge can measure against; this one names no distance it recognises.' };
  }
  return {
    ...base,
    demonstrated: `${clock(model.seconds)} projected from ${model.source ? `${round1(model.source.miles)} mi in ${clock(model.source.seconds)} on ${model.source.date}` : 'recent efforts'}`,
    demonstratedOn: model.source?.date || null,
    weeklyRate: null,
    projected: `${clock(model.seconds)} at today's fitness`,
    requiredRate: targetSeconds ? `${clock(Math.max(0, model.seconds - targetSeconds))} to find in ${weeks} weeks` : null,
    confidence: model.confidence === 'high' ? 'High' : model.confidence === 'medium' ? 'Medium' : 'Low',
    verdict: targetSeconds && model.seconds <= targetSeconds ? 'On track' : 'Behind the rate',
    missing: model.confidence === 'low'
      ? `The projection rests on ${model.supportingRuns} qualifying effort${model.supportingRuns === 1 ? '' : 's'}; a hard effort at the goal distance would sharpen it.`
      : null,
  };
}

/* THE ONE GOAL WITH THE MOST EVIDENCE BEHIND IT.

   A body-composition goal has no exercise and no top sets, so routing it
   through the strength path reported "nothing has been recorded for it yet"
   about an athlete who has weighed in almost every morning for eight months.
   It reads the weigh-ins, which is the only place its answer was ever going to
   come from.

   Direction is decided by the target, not by a sign: someone at 190 aiming at
   200 is gaining on purpose, and someone at 215 aiming at 200 is not. */
function bodyTrajectory(goal: CreatedGoal, records: WorkoutRecord[]): GoalTrajectory {
  const target = Number(String(goal.target || '').replace(/[^0-9.]/g, '')) || 0;
  const weeks = weeksUntil(goal.date);
  const unit = goal.unit || 'lb';
  /* Oldest first, and one figure per day — a morning and an evening weigh-in
     are not two data points about the same thing. */
  const series = bodyWeightSeries(records, 400)
    .map(point => ({ date: point.date, value: point.weight }))
    .reverse();
  const daily = bestPerDay(series, false);
  const now = daily.at(-1);
  const base = {
    goal: goal.title, type: goal.type, target: `${target} ${unit}`,
    deadline: goal.date, weeksRemaining: weeks,
  };
  if (!now) {
    return { ...base, demonstrated: null, demonstratedOn: null, weeklyRate: null, projected: null,
      requiredRate: null, confidence: 'Low', verdict: 'No trend yet',
      missing: 'A logged body weight. Forge records it with a workout, and nothing has been entered yet.' };
  }
  const gaining = target > now.value;
  if (gaining ? now.value >= target : now.value <= target) {
    return { ...base, demonstrated: `${round1(now.value)} ${unit}`, demonstratedOn: now.date,
      weeklyRate: null, projected: null, requiredRate: null, confidence: 'High', verdict: 'Reached', missing: null };
  }
  /* WEEKS, NOT MORNINGS. Body weight swings two pounds on water alone, so a
     fortnight of daily weigh-ins can "prove" any rate you like — eight days of
     Preston's real numbers fitted 1.6 lb/week and projected him twenty-five
     pounds heavier by December. One median figure per week is the signal; the
     mornings are the noise around it. */
  const weekOf = (iso: string) => {
    const date = new Date(`${iso}T12:00:00`);
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const buckets = new Map<string, number[]>();
  daily
    .filter(point => Date.now() - new Date(`${point.date}T12:00:00`).getTime() <= 200 * DAY)
    .forEach(point => {
      const key = weekOf(point.date);
      buckets.set(key, [...(buckets.get(key) || []), point.value]);
    });
  const weekly = [...buckets].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, values]) => ({ date, value: median(values) }));
  const rate = weekly.length >= 5 ? ratePerWeek(weekly) : null;
  const required = weeks > 0 ? (target - now.value) / weeks : null;
  if (rate === null) {
    return { ...base, demonstrated: `${round1(now.value)} ${unit}`, demonstratedOn: now.date,
      weeklyRate: null, projected: null,
      requiredRate: required === null ? null : `${round1(required)} ${unit}/week`,
      confidence: 'Low', verdict: 'No trend yet',
      missing: `Five weeks of weigh-ins would establish a rate; there ${weekly.length === 1 ? 'is 1' : `are ${weekly.length}`}.` };
  }
  /* Nobody gains or loses more than about one percent of themselves a week for
     four months running, so no extrapolation is allowed to pretend they will. */
  const capped = Math.max(-now.value * 0.01, Math.min(now.value * 0.01, rate));
  const projected = now.value + capped * weeks;
  const confidence: GoalTrajectory['confidence'] = weekly.length >= 12 ? 'High' : weekly.length >= 8 ? 'Medium' : 'Low';
  return {
    ...base,
    demonstrated: `${round1(now.value)} ${unit}`,
    demonstratedOn: now.date,
    weeklyRate: `${round1(capped)} ${unit}/week`,
    projected: `${round1(projected)} ${unit} by ${goal.date}`,
    requiredRate: required === null ? null : `${round1(required)} ${unit}/week`,
    confidence,
    verdict: (gaining ? projected >= target : projected <= target) ? 'On track' : 'Behind the rate',
    missing: null,
  };
}

const isBodyGoal = (goal: CreatedGoal) =>
  /body/i.test(String(goal.type || '')) || /body\s*weight/i.test(String(goal.metric || ''));

/* WHAT THE ATHLETE HAS ACTUALLY BEEN RUNNING, as a median over the finished
   weeks rather than a mean over all of them — one big week or one sick week
   should not decide what gets prescribed. Stated setup mileage is a guess that
   goes stale the week after setup; this does not. */
export function medianWeeklyMiles(records: WorkoutRecord[], weeks = 8): number {
  const finished = weeklyRunning(records, weeks).filter(week => !week.partial);
  /* THE WEEKS BEFORE THEY STARTED ARE NOT WEEKS THEY RAN NOTHING. An athlete
     three weeks into using Forge has five empty buckets in an eight-week
     window, and the median of that is zero — so the floor that is supposed to
     stop the plan prescribing under them did nothing for exactly the athletes
     who are new. Leading empty weeks are dropped; an off week INSIDE their
     training counts, because that is part of what they actually do. */
  const firstRan = finished.findIndex(week => week.miles > 0);
  const since = firstRan < 0 ? [] : finished.slice(firstRan);
  if (!since.length) return 0;
  const values = since.map(week => week.miles).sort((a, b) => a - b);
  const middle = values.length >> 1;
  return round1(values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2);
}

/* The longest single continuous run on file. A long run the athlete is already
   doing every week is the floor for the plan's long run, not a stretch. */
export function longestContinuousRun(records: WorkoutRecord[]): number {
  let longest = 0;
  records.forEach(record => (record.cardioSessions || []).forEach(session => {
    if (!/run/i.test(session.activity || '')) return;
    const intervals = session.prescription?.legacyIntervals;
    if (Array.isArray(intervals) && intervals.length > 1) return;
    const miles = cardioMiles(session);
    /* And a 6-mile walk is not a 6-mile long run. Untimed distance still
       counts — not knowing how long it took does not mean it was a stroll. */
    if (!countsAsRunVolume(miles, summarizeCardioDraft(session).minutes * 60)) return;
    if (miles > longest) longest = miles;
  }));
  return round1(longest);
}

export function goalTrajectories(goals: CreatedGoal[], records: WorkoutRecord[]): GoalTrajectory[] {
  return goals.map(goal => isBodyGoal(goal)
    ? bodyTrajectory(goal, records)
    : goal.type === 'Endurance' || raceMiles(goal) !== null
      ? raceTrajectory(goal, records)
      : strengthTrajectory(goal, records));
}
