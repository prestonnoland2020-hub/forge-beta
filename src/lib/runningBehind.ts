import type { WorkoutRecord } from '../features/training/WorkoutHistoryProvider';
import { runMilesOfRecord } from './stats';
import { localDayIso } from './time';

/* FALLING BEHIND THE RUNNING IS A PLAN PROBLEM, NOT A WILLPOWER ONE.

   The block asks for a weekly mileage and the athlete runs what their week
   allows. When the two drift apart for a fortnight, every week after is built
   on miles that are not happening: the long run grows from a base that is not
   there, the quality session lands on legs that have not done the easy work,
   and the goal projection flatters a volume the athlete is not running.

   A coach would say so and lower the target to something they can hit. This
   is that check: the last two COMPLETED plan weeks, what each asked for and
   what was run. Both under three quarters of the plan and the coach offers a
   new weekly range drawn from what the athlete actually ran — a little above
   it, so the plan still builds — which they can edit before it is used. */

export const BEHIND_SHARE = 0.75;
/* Weeks that ask for less than this are rest or race weeks; missing a few
   miles of a five-mile week is not a pattern. */
const MIN_PLANNED_MILES = 5;

export type RunningWeek = { start: string; planned: number; ran: number };
export type RunningBehind = {
  weeks: RunningWeek[];
  plannedAvg: number;
  ranAvg: number;
  /* The suggested new weekly range, in miles. */
  suggestMin: number;
  suggestMax: number;
  /* Keyed to the two weeks judged, so an answer — a new range or "not now" —
     holds until another week completes. Keying it to the numbers too meant
     lowering the range re-judged the same weeks and asked again at once. */
  fingerprint: string;
};

const addDays = (iso: string, days: number) => { const date = new Date(`${iso}T12:00:00`); date.setDate(date.getDate() + days); return localDayIso(date); };
const round1 = (value: number) => Math.round(value * 10) / 10;

export function runningBehind(startDate: string | undefined, plannedMiles: number[], records: WorkoutRecord[], today = localDayIso()): RunningBehind | null {
  if (!startDate || !plannedMiles.length) return null;
  const elapsed = Math.floor((new Date(`${today}T12:00:00`).getTime() - new Date(`${startDate}T12:00:00`).getTime()) / 604800000);
  /* Two whole weeks have to be behind us; the week in progress is not judged. */
  if (elapsed < 2) return null;
  const weeks = [elapsed - 2, elapsed - 1].map(index => {
    const start = addDays(startDate, index * 7);
    const end = addDays(start, 6);
    const planned = plannedMiles[Math.min(index, plannedMiles.length - 1)] || 0;
    const ran = round1(records.filter(record => record.date >= start && record.date <= end).reduce((sum, record) => sum + runMilesOfRecord(record), 0));
    return { start, planned, ran };
  });
  if (weeks.some(week => week.planned < MIN_PLANNED_MILES)) return null;
  if (!weeks.every(week => week.ran < week.planned * BEHIND_SHARE)) return null;
  const plannedAvg = round1(weeks.reduce((sum, week) => sum + week.planned, 0) / weeks.length);
  const ranAvg = round1(weeks.reduce((sum, week) => sum + week.ran, 0) / weeks.length);
  /* What they ran, give or take: the floor a little under it so a short week
     is not a failure, the ceiling 10% over it so the plan still climbs. But
     never more than half the plan in one cut — a week lost to illness or
     travel would otherwise turn a 24-mile block into a 6-mile one. */
  const suggestMax = Math.max(3, Math.round(Math.max(ranAvg * 1.1, plannedAvg * 0.5)));
  const suggestMin = Math.min(suggestMax, Math.max(0, Math.round(Math.max(ranAvg * 0.8, plannedAvg * 0.4))));
  return { weeks, plannedAvg, ranAvg, suggestMin, suggestMax,
    fingerprint: weeks.map(week => week.start).join('|') };
}
