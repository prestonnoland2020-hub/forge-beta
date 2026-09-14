import type { WorkoutRecord } from '../features/training/WorkoutHistoryProvider';
import { continuousRunEfforts } from './cardioSession';
import { localDayIso } from './time';
import { isRaceEvidence, countsAsRunVolume } from './runQuality';
import { volumeForPace } from './riegel';
import { weeklyMilesFrom, type DatedMiles } from './runVolume';
import { trustedEfforts, CONFIRMED_PREFIX } from './effortAudit';
import { fitnessCurve, predictFromCurve, type Effort as CurveEffort } from './fitnessCurve';

export type RacePrediction = {
  seconds: number;
  /* THE HONEST WIDTH OF IT. "19:00" reads as a measurement; it is an estimate
     off two or three runs, and a card that cannot say so invites an athlete to
     plan around a precision that does not exist. */
  low: number;
  high: number;
  /* The athlete's own fade rate, or 1.06 when their log cannot support one. */
  exponent: number;
  fittedExponent: boolean;
  confidence: 'low' | 'medium' | 'high';
  reason: string;
  supportingRuns: number;
  recentRunMiles: number;
  recentRunDays: number;
  /* The single effort this projection was computed from. Without it the number
     is unfalsifiable on screen: it sits there unchanged for weeks and the
     athlete has no way to tell whether it is stale or simply un-beaten. */
  source?: { date: string; miles: number; seconds: number };
  /* Every effort the level was blended from, best first — the answer to "which
     run is this off?" when the answer is no longer a single run. */
  sources?: Array<{ date: string; miles: number; seconds: number }>;
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

/* Every run the athlete has actually covered — everything that counts as
   running, not only the pieces good enough to predict a race from. */
export function runVolumeEntries(records: WorkoutRecord[]): DatedMiles[] {
  const out: DatedMiles[] = [];
  for (const record of records) {
    for (const session of record.cardioSessions || []) {
      if (nonRunning(`${session.activity} ${session.summary}`)) continue;
      for (const effort of continuousRunEfforts(session)) {
        if (countsAsRunVolume(effort.miles, effort.minutes * 60)) out.push({ date: record.date, miles: effort.miles });
      }
    }
  }
  return out;
}

/* WHAT THE ATHLETE RUNS IN A WEEK, from the one definition in runVolume — see
   the note there for why there used to be four of these and why they
   disagreed with each other on the same card. */
export function weeklyRunVolume(records: WorkoutRecord[]): number {
  return weeklyMilesFrom(runVolumeEntries(records), today());
}
const volumeShortfallFor = (secondsPerMile: number, weeklyMiles: number) => {
  const needed = volumeForPace(secondsPerMile);
  if (!needed) return 0;
  return Math.max(0, Math.min(1, 1 - weeklyMiles / needed));
};

export function predictRaceFromLegacyMethod(records: WorkoutRecord[], goalMiles: number, excluded: string[] = [], workouts: CurveEffort[] = []): RacePrediction | null {
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
  /* AND THE WORKOUTS COUNT TOO. An athlete who trains hard and races twice a
     year had a projection that only ever decayed — see workoutEvidence for
     what a judged session is worth as a continuous effort, and for why hitting
     the pace on the card cannot inflate it. They are appended AFTER the trust
     filter because they are not log rows: there is nothing for the athlete to
     mark false, and effortAudit has nothing to ask about them. */
  const evidence = [...qualifying, ...workouts.filter(run => daysAgo(run.date) <= windowDays)];
  if (!evidence.length) return null;

  /* THE CURVE, NOT THE SINGLE BEST RUN. What used to happen here was a
     tournament: score every effort by its Riegel-converted time with a penalty
     for how far it had to be stretched, and let the winner be the answer. That
     made one row load-bearing — Preston's fake 5.47-mile at 5:29/mi won it
     outright and paced his whole block — and it had no way to say how sure it
     was.

     fitnessCurve fits the athlete's own ln(time) = level + exponent·ln(distance)
     through the frontier of what they have actually run, with easy days and
     records that stand implausibly clear of the rest weighted out of it. The
     prediction is read off the curve, the range comes from the scatter around
     it, and the exponent is theirs rather than the population's. */
  const confirmed = new Set(excluded.filter(key => key.startsWith(CONFIRMED_PREFIX)).map(key => key.slice(CONFIRMED_PREFIX.length)));
  const curve = fitnessCurve(evidence, today(), confirmed);
  if (!curve) return null;

  /* AND THE VOLUME BEHIND IT COUNTS, but only past the distances the athlete
     has actually covered. A 17:42 5K carried straight to a marathon is a 2:37
     marathon, and this predictor said so about an athlete running thirteen
     miles a week. Inside their own range there is nothing to correct — the
     runs happened. */
  const weeklyMiles = weeklyRunVolume(records);
  const provisional = predictFromCurve(curve, goalMiles, 0)!;
  const shortfall = volumeShortfallFor(provisional.seconds / goalMiles, weeklyMiles);
  const prediction = predictFromCurve(curve, goalMiles, shortfall)!;

  const near = (run: Run) => Math.abs(Math.log(goalMiles / run.miles));
  const supporting = evidence.filter(run => near(run) <= NEAR_ENOUGH).length;
  const recent = runs.filter(run => daysAgo(run.date) <= 28);
  const recentMiles = recent.reduce((sum, run) => sum + run.miles, 0);
  const recentRunDays = new Set(recent.map(run => run.date)).size;
  const best = curve.sources[0];
  const round2 = (value: number) => Math.round(value * 100) / 100;
  return {
    seconds: prediction.seconds,
    low: prediction.low,
    high: prediction.high,
    exponent: Math.round(prediction.exponent * 1000) / 1000,
    fittedExponent: curve.fitted,
    confidence: prediction.confidence,
    reason: `Fitted to your best ${curve.sources.length === 1 ? 'continuous effort' : `${curve.sources.length} continuous efforts`} in the last 180 days${curve.fitted ? `, carried at your own fade rate of ${curve.exponent.toFixed(2)} rather than the 1.06 average` : ' — not enough spread of distances yet to read your own fade rate, so the 1.06 average is used'}. Interval repeats and untimed pieces are not efforts.`,
    supportingRuns: supporting,
    recentRunMiles: Math.round(recentMiles * 10) / 10,
    recentRunDays,
    source: { date: best.date, miles: round2(best.miles), seconds: Math.round(best.seconds) },
    sources: curve.sources.map(item => ({ date: item.date, miles: round2(item.miles), seconds: Math.round(item.seconds) })),
  };
}
