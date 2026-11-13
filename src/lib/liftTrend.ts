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
  const all: Array<{ t: number; max: number }> = [];
  for (const record of records) for (const set of record.topSets || []) {
    if (set.completed === false || !set.lift || !sameLift(set.lift, exercise) || !(set.weight > 0) || !(set.reps > 0)) continue;
    all.push({ t: day(record.date), max: estimateWithEffort(set.weight, set.reps, effortOf(record.date, set.lift)) });
  }
  const within = (weeks: number) => all.filter(point => now - point.t <= weeks * 7 * DAY && point.t <= now);
  let weeks = 8; let points = within(8);
  const spans = (list: typeof points) => list.length >= 3 && (Math.max(...list.map(p => p.t)) - Math.min(...list.map(p => p.t))) >= 21 * DAY;
  if (!spans(points)) { weeks = 12; points = within(12); }
  if (!spans(points)) return null;
  /* Least squares, x in weeks. */
  const xs = points.map(point => (point.t - now) / (7 * DAY));
  const ys = points.map(point => point.max);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0; let den = 0;
  xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
  const slope = den ? num / den : 0;
  const onLine = my - slope * mx; // value at x = 0, today
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
