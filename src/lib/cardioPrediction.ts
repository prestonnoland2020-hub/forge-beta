import type { WorkoutRecord } from '../features/training/WorkoutHistoryProvider';
import { cardioMiles, summarizeCardioDraft } from './cardioSession';

export type RacePrediction = {
  seconds: number;
  confidence: 'low' | 'medium' | 'high';
  reason: string;
  supportingRuns: number;
  recentRunMiles: number;
  recentRunDays: number;
  /* The single effort this projection was computed from. Without it the number
     is unfalsifiable on screen: it sits there unchanged for weeks and the
     athlete has no way to tell whether it is stale or simply un-beaten. */
  source?: { date: string; miles: number; seconds: number };
};

type Run = { date: string; miles: number; seconds: number };

const DAY = 86_400_000;
const today = () => new Date().toISOString().slice(0, 10);
const dateMs = (date: string) => new Date(`${date}T12:00:00`).getTime();
const nonRunning = (value: string) => /row|ski|bike|cycl|wall ball|assault|hyrox|circuit|swim|elliptical|erg/i.test(value);
const daysAgo = (date: string) => Math.max(0, Math.floor((dateMs(today()) - dateMs(date)) / DAY));

function runsFrom(records: WorkoutRecord[]): Run[] {
  return records.flatMap(record => (record.cardioSessions || []).flatMap(session => {
    const totals = summarizeCardioDraft(session);
    const miles = cardioMiles(session);
    const description = `${session.activity} ${session.summary}`;
    if (!miles || !totals.minutes || nonRunning(description)) return [];
    return [{ date: record.date, miles, seconds: totals.minutes * 60 }];
  }));
}

function regression(points: Array<{ x: number; y: number }>) {
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const denominator = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
  if (!denominator) return null;
  return { slope: points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) / denominator };
}

/** The old app's current-race method: fastest qualifying continuous effort in
 * the last 180 days, Riegel-adjusted to the target distance. */
export function predictRaceFromLegacyMethod(records: WorkoutRecord[], goalMiles: number): RacePrediction | null {
  if (!goalMiles) return null;
  const runs = records.flatMap(record => (record.cardioSessions || []).flatMap(session => {
    if (session.structure !== 'steady' && session.structure !== 'custom') return [];
    const totals = summarizeCardioDraft(session);
    const miles = cardioMiles(session);
    const description = `${session.activity} ${session.summary}`;
    if (!miles || !totals.minutes || nonRunning(description)) return [];
    return [{ date: record.date, miles, seconds: totals.minutes * 60 }];
  }));
  const windowDays = 180;
  const qualifying = runs.filter(run => daysAgo(run.date) <= windowDays && run.miles >= goalMiles * .8 && run.miles <= goalMiles * 1.25);
  if (!qualifying.length) return null;
  const best = qualifying.reduce((winner, run) => {
    const equivalentSeconds = run.seconds * Math.pow(goalMiles / run.miles, 1.06);
    return !winner || equivalentSeconds < winner.equivalentSeconds ? { ...run, equivalentSeconds } : winner;
  }, null as (Run & { equivalentSeconds: number }) | null)!;
  const recent = runs.filter(run => daysAgo(run.date) <= 28);
  const recentMiles = recent.reduce((sum, run) => sum + run.miles, 0);
  const recentRunDays = new Set(recent.map(run => run.date)).size;
  const confidence: RacePrediction['confidence'] = qualifying.length >= 3 ? 'high' : qualifying.length >= 2 ? 'medium' : 'low';
  return {
    seconds: Math.round(best.equivalentSeconds),
    confidence,
    reason: `Best continuous run within 80–125% of the goal distance in the last 180 days, adjusted to the goal distance (Riegel).`,
    supportingRuns: qualifying.length,
    recentRunMiles: Math.round(recentMiles * 10) / 10,
    recentRunDays,
    source: { date: best.date, miles: Math.round(best.miles * 100) / 100, seconds: Math.round(best.seconds) },
  };
}
