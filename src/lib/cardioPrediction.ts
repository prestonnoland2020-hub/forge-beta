import type { WorkoutRecord } from '../features/training/WorkoutHistoryProvider';
import { continuousRunEfforts } from './cardioSession';
import { localDayIso } from './time';
import { isRaceEvidence, countsAsRunVolume } from './runQuality';
import { equivalentSeconds as riegel, volumeForPace } from './riegel';
import { trustedEfforts } from './effortAudit';

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
/* How much a prediction is discounted per natural-log unit of extrapolation.
   Converting a 5K result to a 10K costs 0.69 of a log unit; converting a mile
   to a marathon costs 3.3, and should be believed accordingly.

   The size of this is a judgement and it was tuned against real cases rather
   than picked. At 0.15 it was strong enough to let a four-mile TRAINING RUN
   at 7:30/mi outrank an all-out 5:48 mile as the source for a 5K prediction,
   purely for being nearer in distance — which is the same mistake as
   preferring a jog to a time trial, in a milder form. At 0.10 the mile wins
   that one, a near-distance effort still beats a far one on anything like a
   tie, and the 5K-predicted-from-a-2.5-mile-jog case stays fixed. */
export const EXTRAPOLATION_PENALTY = 0.10;
/* Inside this much of the goal distance, an effort is near enough that the
   conversion is not really a stretch at all. */
export const NEAR_ENOUGH = 0.25;

/* Running actually covered in the last four weeks, per week — everything that
   counts as running, not only the pieces good enough to predict a race from. */
const VOLUME_WINDOW_DAYS = 28;
export function weeklyRunVolume(records: WorkoutRecord[]): number {
  let miles = 0;
  for (const record of records) {
    if (daysAgo(record.date) > VOLUME_WINDOW_DAYS) continue;
    for (const session of record.cardioSessions || []) {
      if (nonRunning(`${session.activity} ${session.summary}`)) continue;
      for (const effort of continuousRunEfforts(session)) {
        if (countsAsRunVolume(effort.miles, effort.minutes * 60)) miles += effort.miles;
      }
    }
  }
  return (miles / VOLUME_WINDOW_DAYS) * 7;
}
const volumeShortfallFor = (secondsPerMile: number, weeklyMiles: number) => {
  const needed = volumeForPace(secondsPerMile);
  if (!needed) return 0;
  return Math.max(0, Math.min(1, 1 - weeklyMiles / needed));
};

export function predictRaceFromLegacyMethod(records: WorkoutRecord[], goalMiles: number, excluded: string[] = []): RacePrediction | null {
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
  /* EVERY EFFORT IS ELIGIBLE; THE DISTANT ONES ARE JUST TRUSTED LESS.

     This used to accept only efforts within 80–125% of the goal distance,
     which produced two opposite failures depending on what the athlete had
     logged. Restricted like that, Preston's 5K was once predicted from an easy
     2.5-mile jog at 10:00/mi — the only thing in the window — and came back
     31:29 against an 18:59 target. Meanwhile the feasibility banner, which
     took the best effort at ANY distance, predicted his mile from a 5.5-mile
     run and came back 4:57. Same athlete, same day, same card: 5:13 on the
     pill and 4:57 in the banner, because two functions disagreed about which
     efforts were allowed to speak.

     Riegel converts between distances perfectly well; what degrades is how
     much you should believe it, and that degrades with how far you stretch.
     So everything is eligible and each candidate is scored with a penalty
     that grows with the size of the extrapolation. A near-distance effort
     wins on a tie, a genuinely better effort at a distant one can still win,
     and an easy jog never beats a time trial just for being the right length. */
  /* MINUS WHAT THE ATHLETE HAS SAID IS NOT REAL, and minus what contradicts
     itself. One bad record does not cause a small error here — every goal
     verdict and every training pace is built on the single best effort, so it
     causes a wrong plan. */
  const qualifying = trustedEfforts(runs.filter(run => daysAgo(run.date) <= windowDays), excluded);
  if (!qualifying.length) return null;
  const near = (run: Run) => Math.abs(Math.log(goalMiles / run.miles));

  /* AND THE VOLUME BEHIND IT COUNTS. A 17:42 5K carried straight to a marathon
     is a 2:37 marathon, and this predictor said so about an athlete running
     thirteen miles a week — "On track" on his goal card, while the banner
     beside it, which did apply the correction, said the volume was not there.
     Going UP in distance is stretched by how far the athlete's running falls
     short of what the pace is normally built on; going down needs no help. */
  const weeklyMiles = weeklyRunVolume(records);
  const best = qualifying.reduce((winner, run) => {
    const shortfall = volumeShortfallFor(run.seconds / run.miles, weeklyMiles);
    const equivalentSeconds = riegel(run.seconds, run.miles, goalMiles, shortfall);
    const score = equivalentSeconds * (1 + EXTRAPOLATION_PENALTY * near(run));
    return !winner || score < winner.score ? { ...run, equivalentSeconds, score } : winner;
  }, null as (Run & { equivalentSeconds: number; score: number }) | null)!;
  /* Confidence is about the effort that actually won, not about how many were
     considered: one time trial at the goal distance is worth more than five
     easy runs near it. */
  const supporting = qualifying.filter(run => near(run) <= NEAR_ENOUGH).length;
  const recent = runs.filter(run => daysAgo(run.date) <= 28);
  const recentMiles = recent.reduce((sum, run) => sum + run.miles, 0);
  const recentRunDays = new Set(recent.map(run => run.date)).size;
  const confidence: RacePrediction['confidence'] = near(best) > NEAR_ENOUGH ? 'low'
    : supporting >= 3 ? 'high' : supporting >= 2 ? 'medium' : 'low';
  return {
    seconds: Math.round(best.equivalentSeconds),
    confidence,
    reason: `Best single continuous effort in the last 180 days, carried to the goal distance (Riegel) and discounted for how far it had to be stretched. Interval repeats and untimed pieces are not efforts.`,
    supportingRuns: supporting,
    recentRunMiles: Math.round(recentMiles * 10) / 10,
    recentRunDays,
    source: { date: best.date, miles: Math.round(best.miles * 100) / 100, seconds: Math.round(best.seconds) },
  };
}
