import { sameLift } from './liftAliases';
import { effortOf, estimateWithEffort } from './setEffort';

/* WHERE A LIFT IS HEADED, from the same calculated max the plan is written
   from: every completed top set turned into a max (Brzycki, reps left in the
   tank counted), over the last eight weeks (twelve when eight are thin). A
   straight line through those points gives pounds per week; carried to the
   goal date it says whether the goal is on track.

   Same rule for every lifter: at least three sets over at least three weeks,
   or the trend is not called. The weekly gain is capped at 1% of the current
   max, the most a trained lifter sustains, so one big day cannot promise a
   goal; a falling line is reported as falling. */

export type LiftTrend = {
  current: number;      // calc max today, off the line (never above the best recent set)
  perWeek: number;      // lb (or kg) per week, may be negative
  weeks: number;        // the window the line was drawn over
  projected: number;    // calc max at the goal date at this pace
  status: 'on-track' | 'close' | 'behind';
  sentence: string;
};

type Rec = { date: string; topSets?: Array<{ lift: string; weight: number; reps: number; completed?: boolean }> };
const DAY = 86400000;
const day = (iso: string) => new Date(`${iso}T12:00:00`).getTime();

export function liftTrend(exercise: string, records: Rec[], target: number, goalDate: string | undefined, unit = 'lb', today = new Date()): LiftTrend | null {
  if (!exercise || !(target > 0)) return null;
  const now = today.getTime();
  const all: Array<{ t: number; max: number; reps: number }> = [];
  for (const record of records) for (const set of record.topSets || []) {
    if (set.completed === false || !set.lift || !sameLift(set.lift, exercise) || !(set.weight > 0) || !(set.reps > 0)) continue;
    all.push({ t: day(record.date), reps: set.reps, max: estimateWithEffort(set.weight, set.reps, effortOf(record.date, set.lift)) });
  }
  /* Off days — under 80% of the lift's best, or past twenty reps — say
     nothing about strength and are left out. */
  const top = Math.max(0, ...all.map(point => point.max));
  const solid = all.filter(point => point.max >= top * 0.8 && point.reps <= 20);
  const within = (weeks: number) => solid.filter(point => now - point.t <= weeks * 7 * DAY && point.t <= now);
  let weeks = 8; let points = within(8);
  const spans = (list: typeof points) => new Set(list.map(p => p.t)).size >= 3 && (Math.max(...list.map(p => p.t)) - Math.min(...list.map(p => p.t))) >= 21 * DAY;
  if (!spans(points)) { weeks = 12; points = within(12); }
  if (!spans(points)) return null;
  /* THE MEDIAN LINE, NOT THE AVERAGE ONE (Theil–Sen): the slope is the
     median of the slopes between every pair of days, so one tired day — or
     one great one — barely moves it. x in weeks, today at zero. */
  const xs = points.map(point => (point.t - now) / (7 * DAY));
  const ys = points.map(point => point.max);
  const median = (list: number[]) => { const sorted = [...list].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };
  const slopes: number[] = [];
  for (let i = 0; i < xs.length; i += 1) for (let j = i + 1; j < xs.length; j += 1) if (Math.abs(xs[j] - xs[i]) >= 3 / 7) slopes.push((ys[j] - ys[i]) / (xs[j] - xs[i]));
  const slope = slopes.length ? median(slopes) : 0;
  const onLine = median(ys.map((y, i) => y - slope * xs[i])); // value at x = 0, today
  const recentBest = Math.max(...points.filter(point => now - point.t <= 28 * DAY).map(point => point.max), 0) || Math.max(...ys);
  const current = Math.round(Math.min(onLine, recentBest));
  const perWeek = Math.min(slope, current * 0.01);
  const weeksLeft = goalDate ? Math.max(0, (day(goalDate) - now) / (7 * DAY)) : 0;
  const projected = Math.round(current + Math.max(0, perWeek) * weeksLeft);
  const status = projected >= target ? 'on-track' : projected >= target * 0.98 ? 'close' : 'behind';
  const by = goalDate ? new Date(`${goalDate}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
  const rate = `${perWeek >= 0 ? '+' : '−'}${Math.abs(perWeek).toFixed(1)} ${unit}/week`;
  const sentence = perWeek <= 0
    ? `Calc max ${current} ${unit}, flat or down over ${weeks} weeks (${rate}). At this pace it won't reach ${Math.round(target)} ${unit}${by ? ` by ${by}` : ''}.`
    : status === 'on-track'
      ? `Calc max ${current} ${unit}, ${rate} over ${weeks} weeks. At this pace: ${projected}${by ? ` by ${by}` : ''} — on track for ${Math.round(target)}.`
      : `Calc max ${current} ${unit}, ${rate} over ${weeks} weeks. At this pace: ${projected}${by ? ` by ${by}` : ''} — ${Math.round(target) - projected} short of ${Math.round(target)}.`;
  return { current, perWeek: Math.round(perWeek * 10) / 10, weeks, projected, status, sentence };
}
