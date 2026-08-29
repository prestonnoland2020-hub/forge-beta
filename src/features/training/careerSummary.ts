import { cardioMiles, formatCardioMinutes, summarizeCardioDraft, type CardioLogDraft } from '../../lib/cardioSession';
import { canonicalLiftKey } from '../../lib/liftAliases';
import { calculateEstimatedOneRepMax } from '../../lib/strength';
import { runShapedActivity } from './stravaImportService';
import type { WorkoutRecord } from './WorkoutHistoryProvider';

/* THE COACH SHOULD KNOW THE WHOLE ATHLETE, NOT THE LAST SIX MONTHS.
   Forge hands the coach the newest 180 logged days in full detail, which was
   the entire training history back when the app was new. It is not any more:
   a Strava import brings in years, and an athlete who asks "how do my 2021
   efforts compare?" got told the history starts in 2026 — while the answer
   sat in the database.

   Sending every day in full is not the fix. Thousands of sessions would cost
   more than they inform and bury the recent weeks that actually drive the
   next workout. So the history arrives at two resolutions: recent days in
   full, and everything else as this summary — what each year contained, the
   best the athlete has ever done, and when. Enough to compare eras honestly,
   and explicitly aggregate so the coach never invents a session it cannot
   see. */

/* Pace is only comparable within a distance class — a 400 m repeat and a
   half marathon say different things about the same runner. */
const DISTANCE_CLASSES = [
  { key: 'sub-1.5 mi', min: 0.2, max: 1.5 },
  { key: '1.5-4 mi', min: 1.5, max: 4 },
  { key: '4-8 mi', min: 4, max: 8 },
  { key: '8-14 mi', min: 8, max: 14 },
  { key: '14+ mi', min: 14, max: Infinity },
] as const;
const classOf = (miles: number) => DISTANCE_CLASSES.find(entry => miles >= entry.min && miles < entry.max)?.key;

export type PaceBest = { distanceClass: string; miles: number; pace: string; date: string; activity: string };
export type LiftBest = { lift: string; calculatedMax: number; weight: number; reps: number; date: string };
export type CareerYear = {
  year: number; trainingDays: number; runs: number; runMiles: number; longestRun: number;
  bestPaces: PaceBest[]; bestLifts: LiftBest[];
};
export type CareerSummary = {
  resolution: string;
  firstLoggedDate: string; lastLoggedDate: string;
  totalTrainingDays: number; totalRunMiles: number; totalRuns: number;
  years: CareerYear[];
  allTimeBestPaces: PaceBest[];
  allTimeBestLifts: LiftBest[];
};

const round = (value: number, places = 1) => Math.round(value * 10 ** places) / 10 ** places;
/* A pace is only kept when the run is long enough to mean something and the
   number is physically plausible — a mis-keyed distance can otherwise crown
   itself the athlete's lifetime best. */
const plausible = (paceMinutes: number) => paceMinutes >= 3.5 && paceMinutes <= 20;

const betterPace = (a: PaceBest | undefined, b: PaceBest) => !a || b.pace.localeCompare(a.pace, undefined, { numeric: true }) < 0 ? b : a;

export function buildCareerSummary(records: WorkoutRecord[]): CareerSummary | null {
  const dated = records.filter(record => /^\d{4}-\d{2}-\d{2}$/.test(String(record.date || '')));
  if (!dated.length) return null;

  const byYear = new Map<number, { days: Set<string>; runs: number; miles: number; longest: number; paces: Map<string, PaceBest>; lifts: Map<string, LiftBest> }>();
  const allPaces = new Map<string, PaceBest>();
  const allLifts = new Map<string, LiftBest>();
  let totalMiles = 0, totalRuns = 0;
  const allDays = new Set<string>();

  for (const record of dated) {
    const year = Number(record.date.slice(0, 4));
    const bucket = byYear.get(year) || { days: new Set<string>(), runs: 0, miles: 0, longest: 0, paces: new Map(), lifts: new Map() };
    bucket.days.add(record.date); allDays.add(record.date);

    for (const session of (record.cardioSessions || []) as CardioLogDraft[]) {
      const miles = cardioMiles(session);
      const minutes = summarizeCardioDraft(session).minutes;
      if (!runShapedActivity(session.activity || '') || !miles) continue;
      bucket.runs += 1; totalRuns += 1;
      bucket.miles += miles; totalMiles += miles;
      if (miles > bucket.longest) bucket.longest = miles;
      if (!minutes) continue;
      const paceMinutes = minutes / miles;
      const group = classOf(miles);
      if (!group || !plausible(paceMinutes)) continue;
      const entry: PaceBest = { distanceClass: group, miles: round(miles, 2), pace: formatCardioMinutes(paceMinutes), date: record.date, activity: session.activity || 'Run' };
      bucket.paces.set(group, betterPace(bucket.paces.get(group), entry));
      allPaces.set(group, betterPace(allPaces.get(group), entry));
    }

    for (const set of record.topSets || []) {
      if (set.completed === false || !set.lift || !set.weight || !set.reps) continue;
      const max = set.calculatedMax || calculateEstimatedOneRepMax(set.weight, set.reps) || 0;
      if (!max) continue;
      const key = canonicalLiftKey(set.lift);
      const entry: LiftBest = { lift: set.lift, calculatedMax: max, weight: set.weight, reps: set.reps, date: record.date };
      if (max > (bucket.lifts.get(key)?.calculatedMax || 0)) bucket.lifts.set(key, entry);
      if (max > (allLifts.get(key)?.calculatedMax || 0)) allLifts.set(key, entry);
    }
    byYear.set(year, bucket);
  }

  const sortedDates = [...allDays].sort();
  const years: CareerYear[] = [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, bucket]) => ({
    year,
    trainingDays: bucket.days.size,
    runs: bucket.runs,
    runMiles: round(bucket.miles),
    longestRun: round(bucket.longest, 2),
    bestPaces: [...bucket.paces.values()],
    /* Six lifts a year keeps the payload honest without hiding the ones the
       athlete actually trains. */
    bestLifts: [...bucket.lifts.values()].sort((a, b) => b.calculatedMax - a.calculatedMax).slice(0, 6),
  }));

  return {
    resolution: 'Per-year aggregates over the athlete\'s COMPLETE logged history. Individual sessions outside recentHistory are not included — cite these as yearly figures and bests, never as specific workouts.',
    firstLoggedDate: sortedDates[0],
    lastLoggedDate: sortedDates[sortedDates.length - 1],
    totalTrainingDays: allDays.size,
    totalRunMiles: round(totalMiles),
    totalRuns,
    years,
    allTimeBestPaces: [...allPaces.values()],
    allTimeBestLifts: [...allLifts.values()].sort((a, b) => b.calculatedMax - a.calculatedMax).slice(0, 10),
  };
}
