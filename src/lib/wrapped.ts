import type { WorkoutRecord } from '../features/training/WorkoutHistoryProvider';
import { canonicalLiftKey } from './liftAliases';
import { calculateEstimatedOneRepMax } from './strength';
import { runLines } from './stats';

/* FORGE WRAPPED. The athlete's year, told back to them on January 1.

   Everything here is read from their own log and nothing is invented, no
   guessed calories. The one comparison with other people ("stronger than
   82% of lifters") comes from published strength standards for her sex and
   body weight, says so on the slide, and is left out without a body weight. A slide with nothing behind it is not
   shown — a lifter who never ran does not get a running slide of zeros. */

export type WrappedLift = { name: string; start: number; best: number; gain: number; bestDate: string; sets: number };
/* A record is weight actually on the bar — the heaviest the athlete has ever
   lifted on that lift, with the reps it went for — not an estimated max. */
export type WrappedPr = { lift: string; max: number; reps: number; date: string };
export type Persona = { name: string; line: string };
/* Where a lift stands against other lifters of the same sex and body weight. */
export type Standing = { lift: string; best: number; ratio: number; percentile: number };
/* Time spent lifting against time spent running, for the balance scale. */
export type Balance = { liftMinutes: number; runMinutes: number; liftShare: number; verdict: string };

export type Wrapped = {
  year: number;
  trainingDays: number;
  liftDays: number;
  runDays: number;
  topSets: number;
  /* Weight × reps across every top set. */
  tonnage: number;
  tonnageCompare: { count: number; thing: string } | null;
  strongest: WrappedLift | null;
  mostImproved: WrappedLift | null;
  mostLogged: WrappedLift | null;
  prs: WrappedPr[];
  prCount: number;
  runs: number;
  runMiles: number;
  longestRun: { miles: number; date: string } | null;
  /* Running miles added up month by month — the line on the running slide. */
  milesByMonth: number[];
  /* Training days per weekday, Monday first. */
  weekdays: number[];
  favoriteDay: string;
  daysByMonth: number[];
  bestMonth: string;
  longestWeekStreak: number;
  /* 0 rest, 1 lifted, 2 ran, 3 both — one entry per day of the year. */
  calendar: number[];
  persona: Persona;
  standing: Standing[];
  balance: Balance | null;
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/* Parsed as a calendar date, never through the time zone. */
const parts = (iso: string) => iso.split('-').map(Number) as [number, number, number];
const dayIndex = (iso: string) => { const [y, m, d] = parts(iso); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000); };
const weekday = (iso: string) => { const [y, m, d] = parts(iso); return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; };
const daysInYear = (year: number) => (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;
/* Monday-based week number, counted from the Monday on or before Jan 1. */
const weekNumber = (iso: string) => { const [y] = parts(iso); const jan1 = weekday(`${y}-01-01`); return Math.floor((dayIndex(iso) + jan1) / 7); };
const round1 = (value: number) => Math.round(value * 10) / 10;

/* STRENGTH STANDARDS. One-rep max as a multiple of body weight at five
   points of the lifting population (the beginner / novice / intermediate /
   advanced / elite levels of the common strength-standard tables: stronger
   than 5%, 20%, 50%, 80% and 95% of lifters). Between points the percentile
   is read off a straight line in log-ratio, outside them it tapers to 1 and
   99. These are lifters, not everyone: against the whole population the
   number would be higher, so the slide says "of lifters". */
type MainLift = 'bench' | 'squat' | 'deadlift' | 'press';
const LEVELS = [5, 20, 50, 80, 95];
const STANDARDS: Record<'Male' | 'Female', Record<MainLift, number[]>> = {
  Male: { bench: [0.5, 0.75, 1.0, 1.5, 2.0], squat: [0.75, 1.25, 1.5, 2.0, 2.5], deadlift: [1.0, 1.5, 2.0, 2.5, 3.0], press: [0.35, 0.55, 0.75, 1.0, 1.25] },
  Female: { bench: [0.25, 0.5, 0.75, 1.0, 1.5], squat: [0.5, 0.75, 1.25, 1.5, 2.0], deadlift: [0.5, 1.0, 1.25, 1.75, 2.5], press: [0.2, 0.35, 0.5, 0.75, 1.0] },
};
const LIFT_NAMES: Record<MainLift, string> = { bench: 'Bench press', squat: 'Squat', deadlift: 'Deadlift', press: 'Overhead press' };
/* Only the barbell versions the standards describe. */
export function mainLiftOf(name: string): MainLift | null {
  const n = name.toLowerCase();
  if (/dumbbell|\bdb\b|machine|smith|incline|decline|close.?grip|floor|pin|board|band/.test(n)) return null;
  if (/bench/.test(n)) return 'bench';
  if (/deadlift/.test(n) && !/romanian|rdl|stiff|single|trap|hex|deficit|block|rack|sumo/.test(n)) return 'deadlift';
  if (/squat/.test(n) && !/front|goblet|split|bulgarian|hack|box|pause|overhead|zercher|safety|ssb|jump|pistol/.test(n)) return 'squat';
  if (/(overhead|military|strict|shoulder) press|\bohp\b/.test(n) && !/push|seated/.test(n)) return 'press';
  return null;
}
export function percentileFor(lift: MainLift, sex: 'Male' | 'Female', ratio: number): number {
  const table = STANDARDS[sex][lift];
  if (!(ratio > 0)) return 0;
  const x = Math.log(ratio);
  const xs = table.map(Math.log);
  let pct: number;
  if (x <= xs[0]) pct = LEVELS[0] * Math.exp((x - xs[0]) * 2.5);
  else if (x >= xs[4]) pct = 100 - (100 - LEVELS[4]) * Math.exp(-(x - xs[4]) * 4);
  else {
    const i = xs.findIndex((value, index) => x >= value && x <= xs[index + 1]);
    pct = LEVELS[i] + (LEVELS[i + 1] - LEVELS[i]) * (x - xs[i]) / (xs[i + 1] - xs[i]);
  }
  return Math.max(1, Math.min(99, Math.round(pct)));
}

/* Something the size of the athlete's year, in pounds. The biggest thing
   that still makes a pile of at least five — "0.02 blue whales" and "2 semi
   trucks" both say less than "16 elephants". */
const THINGS: Array<{ lb: number; one: string; many: string }> = [
  { lb: 1500, one: 'grand piano', many: 'grand pianos' },
  { lb: 5000, one: 'pickup truck', many: 'pickup trucks' },
  { lb: 13000, one: 'elephant', many: 'elephants' },
  { lb: 90000, one: 'loaded semi truck', many: 'loaded semi trucks' },
  { lb: 330000, one: 'blue whale', many: 'blue whales' },
  { lb: 975000, one: 'Boeing 747', many: 'Boeing 747s' },
];
export function compareTonnage(pounds: number): { count: number; thing: string } | null {
  if (pounds < 1500) return null;
  const pick = [...THINGS].reverse().find(item => pounds / item.lb >= 5) || THINGS[0];
  const count = Math.round(pounds / pick.lb);
  return { count, thing: count === 1 ? pick.one : pick.many };
}

function personaFor(w: Pick<Wrapped, 'trainingDays' | 'liftDays' | 'runDays' | 'weekdays' | 'longestWeekStreak' | 'prCount' | 'runMiles'>): Persona {
  const weekend = w.weekdays[5] + w.weekdays[6];
  const both = w.liftDays >= 20 && w.runDays >= 20;
  if (both) return { name: 'The Hybrid', line: 'Strong and fast. You refused to pick one.' };
  if (w.longestWeekStreak >= 26) return { name: 'The Machine', line: 'Half a year without missing a week. Nothing stopped you.' };
  if (w.prCount >= 15) return { name: 'The Record Breaker', line: 'You kept moving the ceiling. Again and again.' };
  if (w.runDays > w.liftDays * 2 && w.runMiles >= 100) return { name: 'The Engine', line: 'Miles on miles. Your legs know every road.' };
  if (w.trainingDays >= 8 && weekend / w.trainingDays >= 0.45) return { name: 'The Weekend Warrior', line: 'When the week ends, your training starts.' };
  if (w.liftDays >= w.runDays) return { name: 'The Iron Regular', line: 'Show up, find the top set, go home stronger.' };
  return { name: 'The Grinder', line: 'Not flashy. Just there, every week.' };
}

/* `metric`: the log's weights are kilograms, so the comparison converts. */
export function buildWrapped(records: WorkoutRecord[], year: number, metric = false, athlete: { sex?: string; bodyWeight?: number } = {}): Wrapped | null {
  const prefix = `${year}-`;
  const ofYear = records.filter(record => /^\d{4}-\d{2}-\d{2}$/.test(String(record.date || '')) && record.date.startsWith(prefix));
  if (!ofYear.length) return null;

  const total = daysInYear(year);
  const calendar = new Array(total).fill(0);
  const weekdays = new Array(7).fill(0);
  const daysByMonth = new Array(12).fill(0);
  const weeks = new Set<number>();
  const trainingDates = new Set<string>();
  let liftDays = 0, topSets = 0, tonnage = 0;

  /* Every lift's history, all years, oldest first — a PR in this year has to
     beat everything before it, not just everything since January. */
  const allSets = records
    .filter(record => /^\d{4}-\d{2}-\d{2}$/.test(String(record.date || '')))
    .flatMap(record => (record.topSets || []).filter(set => set && set.lift && set.completed !== false).map(set => ({ date: record.date, set })))
    .sort((a, b) => a.date.localeCompare(b.date));

  const runDates = new Set<string>();
  const lines = runLines(ofYear);
  lines.forEach(line => runDates.add(line.date));

  for (const record of ofYear) {
    const sets = (record.topSets || []).filter(set => set && set.lift && set.completed !== false && Number(set.weight) > 0 && Number(set.reps) > 0);
    const ran = runDates.has(record.date);
    const lifted = sets.length > 0;
    const trained = lifted || ran || Boolean(record.hasCardio || (record.cardioSessions || []).length);
    if (!trained) continue;
    if (trainingDates.has(record.date)) continue;
    trainingDates.add(record.date);
    const index = dayIndex(record.date);
    if (index >= 0 && index < total) calendar[index] = (lifted ? 1 : 0) + (ran ? 2 : 0) || 2;
    weekdays[weekday(record.date)] += 1;
    daysByMonth[parts(record.date)[1] - 1] += 1;
    weeks.add(weekNumber(record.date));
    if (lifted) liftDays += 1;
    topSets += sets.length;
    tonnage += sets.reduce((sum, set) => sum + Number(set.weight) * Number(set.reps), 0);
  }
  if (!trainingDates.size) return null;

  /* Lifts: start of year vs best of year, PRs against all time. */
  const lifts = new Map<string, WrappedLift & { first?: number }>();
  const bestBefore = new Map<string, number>();
  const heaviestBefore = new Map<string, number>();
  const prs: WrappedPr[] = [];
  for (const { date, set } of allSets) {
    const max = Number(set.calculatedMax) || calculateEstimatedOneRepMax(Number(set.weight), Number(set.reps));
    if (!max) continue;
    const key = canonicalLiftKey(set.lift);
    const prior = bestBefore.get(key);
    if (date.startsWith(prefix)) {
      const entry = lifts.get(key) || { name: set.lift, start: max, best: max, gain: 0, bestDate: date, sets: 0 };
      entry.sets += 1;
      if (max > entry.best) { entry.best = max; entry.bestDate = date; }
      lifts.set(key, entry);
    }
    if (prior === undefined || max > prior) bestBefore.set(key, max);
    /* Records count real weight: more on the bar than ever before for that
       lift. A first-ever set is a starting point, not a record. */
    const weight = Number(set.weight) || 0;
    const heaviest = heaviestBefore.get(key);
    if (weight > 0) {
      if (date.startsWith(prefix) && heaviest !== undefined && weight > heaviest) prs.push({ lift: set.lift, max: weight, reps: Number(set.reps) || 1, date });
      if (heaviest === undefined || weight > heaviest) heaviestBefore.set(key, weight);
    }
  }
  const liftList = [...lifts.values()].map(lift => ({ ...lift, gain: lift.best - lift.start }));
  const strongest = liftList.length ? liftList.reduce((a, b) => (b.best > a.best ? b : a)) : null;
  const improvedPool = liftList.filter(lift => lift.sets >= 3 && lift.gain > 0);
  const mostImproved = improvedPool.length ? improvedPool.reduce((a, b) => (b.gain / b.start > a.gain / a.start ? b : a)) : null;
  const mostLogged = liftList.length ? liftList.reduce((a, b) => (b.sets > a.sets ? b : a)) : null;
  /* The best record per lift, biggest first. */
  const bestPrs = [...prs.reduce((map, pr) => { const key = canonicalLiftKey(pr.lift); const held = map.get(key); if (!held || pr.max > held.max) map.set(key, pr); return map; }, new Map<string, WrappedPr>()).values()].sort((a, b) => b.max - a.max);

  /* Running. */
  const milesByMonth = new Array(12).fill(0);
  let longestRun: Wrapped['longestRun'] = null;
  for (const line of lines) {
    milesByMonth[parts(line.date)[1] - 1] += line.miles;
    if (line.continuous && (!longestRun || line.miles > longestRun.miles)) longestRun = { miles: round1(line.miles), date: line.date };
  }
  const runMiles = round1(milesByMonth.reduce((a, b) => a + b, 0));

  /* Longest run of consecutive weeks with at least one training day. */
  let longestWeekStreak = 0, streak = 0, last = -2;
  [...weeks].sort((a, b) => a - b).forEach(week => { streak = week === last + 1 ? streak + 1 : 1; last = week; longestWeekStreak = Math.max(longestWeekStreak, streak); });

  /* Where her best lifts stand. Body weight: the latest she logged this year,
     else her profile's. Best = the year's best estimated max for the lift. */
  const loggedWeight = [...ofYear].filter(record => Number(record.bodyWeight) > 0).sort((a, b) => b.date.localeCompare(a.date))[0]?.bodyWeight;
  const bodyWeight = Number(loggedWeight) || Number(athlete.bodyWeight) || 0;
  const sex = athlete.sex === 'Male' || athlete.sex === 'Female' ? athlete.sex : null;
  const standing: Standing[] = [];
  if (bodyWeight > 0 && sex) {
    const bestByLift = new Map<MainLift, { best: number }>();
    for (const lift of liftList) {
      const main = mainLiftOf(lift.name);
      if (!main) continue;
      const held = bestByLift.get(main);
      if (!held || lift.best > held.best) bestByLift.set(main, { best: lift.best });
    }
    for (const main of ['squat', 'bench', 'deadlift', 'press'] as MainLift[]) {
      const entry = bestByLift.get(main);
      if (!entry) continue;
      const ratio = entry.best / bodyWeight;
      standing.push({ lift: LIFT_NAMES[main], best: Math.round(entry.best), ratio: Math.round(ratio * 100) / 100, percentile: percentileFor(main, sex, ratio) });
    }
  }

  /* THE BALANCE: time lifting against time running. Running time is what
     she logged per run; a lifting day counts its logged length minus any run
     that day, or 45 minutes when no length was logged. Shown only when she
     did both. */
  const runMinutesByDate = new Map<string, number>();
  for (const line of lines) runMinutesByDate.set(line.date, (runMinutesByDate.get(line.date) || 0) + (line.minutes > 0 ? line.minutes : line.miles * 10));
  const runMinutes = [...runMinutesByDate.values()].reduce((a, b) => a + b, 0);
  let liftMinutes = 0;
  const countedLiftDates = new Set<string>();
  for (const record of ofYear) {
    const lifted = (record.topSets || []).some(set => set && set.lift && set.completed !== false && Number(set.weight) > 0);
    if (!lifted || countedLiftDates.has(record.date)) continue;
    countedLiftDates.add(record.date);
    const logged = Number(record.durationMinutes) || 0;
    const minusRun = logged - (runMinutesByDate.get(record.date) || 0);
    liftMinutes += minusRun >= 15 ? minusRun : 45;
  }
  const both = liftMinutes > 0 && runMinutes > 0;
  const liftShare = both ? liftMinutes / (liftMinutes + runMinutes) : 0;
  const balance: Balance | null = both ? {
    liftMinutes: Math.round(liftMinutes), runMinutes: Math.round(runMinutes), liftShare: Math.round(liftShare * 100) / 100,
    verdict: liftShare >= 0.75 ? 'Lifter, through and through' : liftShare >= 0.58 ? 'A lifter who runs' : liftShare > 0.42 ? 'A true hybrid' : liftShare > 0.25 ? 'A runner who lifts' : 'Runner, through and through',
  } : null;

  const favoriteDay = WEEKDAYS[weekdays.indexOf(Math.max(...weekdays))];
  const bestMonth = MONTHS[daysByMonth.indexOf(Math.max(...daysByMonth))];
  const base = { trainingDays: trainingDates.size, liftDays, runDays: runDates.size, weekdays, longestWeekStreak, prCount: prs.length, runMiles };

  return {
    year,
    ...base,
    topSets,
    tonnage: Math.round(tonnage),
    tonnageCompare: compareTonnage(metric ? tonnage * 2.20462 : tonnage),
    strongest,
    mostImproved,
    mostLogged,
    prs: bestPrs.slice(0, 3),
    runs: lines.length,
    longestRun,
    milesByMonth: milesByMonth.map(round1),
    favoriteDay,
    daysByMonth,
    bestMonth,
    calendar,
    persona: personaFor(base),
    standing,
    balance,
  };
}

/* WHEN WRAPPED IS OUT. It drops on January 1 for the year that just ended
   and stays on Today through January; after that it lives on the profile
   until the next one replaces it. Before the first January there is none. */
export function wrappedWindow(now = new Date()): { year: number; featured: boolean } {
  return { year: now.getFullYear() - 1, featured: now.getMonth() === 0 };
}

/* Forge's first Wrapped is 2026's, out on January 1, 2027. Older years are
   in many logs (Strava imports go back years) but were never Forge years. */
export const FIRST_WRAPPED_YEAR = 2026;
