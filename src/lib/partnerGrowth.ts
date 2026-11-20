import { calculateEstimatedOneRepMax } from './strength';
import { canonicalLiftKey } from './liftAliases';

/* GROWTH, SIDE BY SIDE. Two numbers a partner actually wants: is each of us
   getting stronger, and how much is each of us running.

   Strength is percent growth from each person's own start, so a 500 lb squat
   and a 150 lb squat compare fairly. For every lift trained twice or more in
   the window: its best calculated max so far, each week, against its first.
   The week's figure is the average across those lifts. A best so far never
   drops, so the line is growth — a bad day doesn't erase it. */
export type LiftSet = { date: string; lift: string; weight: number; reps: number };
export type GrowthWeek = { start: string; strength: number | null; miles: number };

const mondayOf = (iso: string) => { const d = new Date(`${iso}T12:00:00`); const back = (d.getDay() + 6) % 7; d.setDate(d.getDate() - back); return d.toISOString().slice(0, 10); };

export function weekStarts(todayIso: string, weeks: number): string[] {
  const last = mondayOf(todayIso);
  return Array.from({ length: weeks }, (_, i) => { const d = new Date(`${last}T12:00:00`); d.setDate(d.getDate() - 7 * (weeks - 1 - i)); return d.toISOString().slice(0, 10); });
}

export function growthByWeek(sets: LiftSet[], runs: Array<{ date: string; miles: number }>, todayIso: string, weeks = 12): GrowthWeek[] {
  const starts = weekStarts(todayIso, weeks);
  const first = starts[0];
  const inWindow = sets.filter(set => set.date >= first && set.date <= todayIso && set.weight > 0 && set.reps > 0).sort((a, b) => a.date.localeCompare(b.date));
  const sessions = new Map<string, Set<string>>();
  inWindow.forEach(set => { const key = canonicalLiftKey(set.lift); if (!sessions.has(key)) sessions.set(key, new Set()); sessions.get(key)!.add(set.date); });
  const tracked = [...sessions].filter(([, dates]) => dates.size >= 2).map(([key]) => key);
  const base = new Map<string, number>(); const best = new Map<string, number>();
  let cursor = 0;
  return starts.map((start, index) => {
    const end = starts[index + 1] || '9999-12-31';
    while (cursor < inWindow.length && inWindow[cursor].date < end) {
      const set = inWindow[cursor++]; const key = canonicalLiftKey(set.lift);
      if (!tracked.includes(key)) continue;
      const max = calculateEstimatedOneRepMax(set.weight, set.reps) || 0;
      if (!base.has(key)) base.set(key, max);
      best.set(key, Math.max(best.get(key) || 0, max));
    }
    const gains = [...best].filter(([key]) => (base.get(key) || 0) > 0).map(([key, value]) => (value / base.get(key)! - 1) * 100);
    const miles = runs.filter(run => run.date >= start && run.date < end && run.date <= todayIso).reduce((sum, run) => sum + run.miles, 0);
    return { start, strength: gains.length ? Math.round(gains.reduce((a, b) => a + b, 0) / gains.length * 10) / 10 : null, miles: Math.round(miles * 10) / 10 };
  });
}

/* "Run · 2.27 mi · 21:04" → 2.27; "5 km" → 3.11; nothing → 0. Runs only. */
export function milesFromSummary(name: string, summary: string): number {
  if (!/run|jog|treadmill/i.test(`${name} ${summary}`)) return 0;
  const mi = summary.match(/([\d.]+)\s*mi\b/i); if (mi) return Number(mi[1]) || 0;
  const km = summary.match(/([\d.]+)\s*km\b/i); if (km) return (Number(km[1]) || 0) * 0.621371;
  return 0;
}
