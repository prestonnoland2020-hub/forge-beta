import type { WorkoutRecord } from '../features/training/WorkoutHistoryProvider';
import { continuousRunEfforts } from './cardioSession';
import { localDayIso } from './time';
import { isRaceEvidence } from './runQuality';

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
const today = () => localDayIso();
const dateMs = (date: string) => new Date(`${date}T12:00:00`).getTime();
const nonRunning = (value: string) => /row|ski|bike|cycl|wall ball|assault|hyrox|circuit|swim|elliptical|erg/i.test(value);
const daysAgo = (date: string) => Math.max(0, Math.floor((dateMs(today()) - dateMs(date)) / DAY));

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
  /* ONE PIECE, RUN IN ONE GO — never a session's totals.

     This read the whole session: distance summed across every logged line,
     time summed across every logged line. Preston's Saturday was 6 x 400 m
     plus a separate 1.81 mile piece logged with no time, so the totals came to
     3.31 miles in 8:00 — a 2:25/mi pace he has never run — and the 5K goal
     projected 7:30 against an 18:59 target and reported him ON TRACK off a
     card that said, one tile to the left, "Not logged".

     A race is a continuous effort and the only evidence for one is a single
     continuous segment. continuousRunEfforts hands those over one at a time,
     and never hands over a piece that has distance without a time. */
  const runs = records.flatMap(record => (record.cardioSessions || []).flatMap(session => {
    if (nonRunning(`${session.activity} ${session.summary}`)) return [];
    /* AND THE EFFORT HAS TO BE ONE. A walk at 20:00 a mile and a 2:25/mi
       "mile" are both in this athlete's log, and both were eligible to become
       a race prediction. runQuality throws out what is not running before any
       of it is converted to the goal distance. */
    return continuousRunEfforts(session)
      .filter(effort => isRaceEvidence(effort.miles, effort.minutes * 60))
      .map(effort => ({ date: record.date, miles: effort.miles, seconds: effort.minutes * 60 }));
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
    reason: `Best single continuous effort within 80–125% of the goal distance in the last 180 days, adjusted to the goal distance (Riegel). Interval repeats and untimed pieces are not efforts.`,
    supportingRuns: qualifying.length,
    recentRunMiles: Math.round(recentMiles * 10) / 10,
    recentRunDays,
    source: { date: best.date, miles: Math.round(best.miles * 100) / 100, seconds: Math.round(best.seconds) },
  };
}
