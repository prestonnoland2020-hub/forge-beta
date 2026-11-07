import type { WorkoutRecord } from '../features/training/WorkoutHistoryProvider';
import { continuousRunEfforts } from './cardioSession';
import { localDayIso } from './time';
import { isRaceEvidence, countsAsRunVolume } from './runQuality';
import { volumeForPace, equivalentSeconds, RIEGEL, RIEGEL_UNDERTRAINED } from './riegel';
import { heartRateEffort } from './heartRate';
import { weeklyMilesFrom, type DatedMiles } from './runVolume';
import { runLines } from './stats';
import { trustedEfforts, CONFIRMED_PREFIX } from './effortAudit';
import { fitnessCurve, predictFromCurve, type Effort as CurveEffort } from './fitnessCurve';
import { latestVo2, vo2RaceSeconds, CURVE_FULL_DAYS, CURVE_HALF_LIFE_DAYS, CURVE_WEIGHT_FLOOR } from './vo2';

/* VO2 max and heart rate at pace each count this much in an estimate; see predictRaceFromLegacyMethod. */
export const AEROBIC_WEIGHT = 1;
const FIVE_K = 3.10686;

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
  /* Garmin's VO2 max, when it took part: the reading, what it alone would
     predict, and how much of the answer it carried (0–1). */
  vo2?: { value: number; date: string; seconds: number; share: number };
  /* Heart rate at pace, when it took part: what it alone predicts and its share. */
  heartRate?: { seconds: number; share: number };
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
  return runLines(records).map(line => ({ date: line.date, miles: line.miles }));
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

/* EVERY CONTINUOUS RUN THAT COULD STAND AS RACE EVIDENCE, one per effort,
   dated. The predictor reads these; the feasibility gate counts them. */
export function raceEvidenceEfforts(records: WorkoutRecord[]): Array<{ date: string; miles: number; seconds: number }> {
  return records.flatMap(record => (record.cardioSessions || []).flatMap(session => {
    if (nonRunning(`${session.activity} ${session.summary}`)) return [];
    /* AND THE EFFORT HAS TO BE ONE. A walk at 20:00 a mile and a 2:25/mi
       "mile" are both in this athlete's log, and both were eligible to become
       a race prediction. runQuality throws out what is not running before any
       of it is converted to the goal distance. */
    return continuousRunEfforts(session)
      .filter(effort => isRaceEvidence(effort.miles, effort.minutes * 60))
      .map(effort => ({ date: record.date, miles: effort.miles, seconds: effort.minutes * 60 }));
  }));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

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
  const runs = raceEvidenceEfforts(records);
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
  const weeklyMiles = weeklyRunVolume(records);
  const recent = runs.filter(run => daysAgo(run.date) <= 28);
  const recentMiles = Math.round(recent.reduce((sum, run) => sum + run.miles, 0) * 10) / 10;
  const recentRunDays = new Set(recent.map(run => run.date)).size;
  const round2 = (value: number) => Math.round(value * 100) / 100;

  /* RUNNING FITNESS IS AEROBIC, SO THE AEROBIC READS LEAD.

     A lifting max is read off the heaviest set. A running estimate is not:
     what the athlete is worth at a distance is mostly their engine, and the
     watch measures that every run. Three sources, each carried to the goal
     distance on its own and each stretched by the same mileage correction:

       VO2 max      Garmin's daily read, through the Daniels race equations
       heart rate   the pace their heart rate implies at threshold, fitted
                    through every run the watch put a heart rate on
       hard runs    the fitness curve through their best continuous efforts

     VO2 max and heart rate count 1 each. Hard runs count 1 while the freshest
     is up to six weeks old (a third of the answer), then halve every six
     weeks after that, down to a quarter.
     Blended in log space, so 18:00 and 20:00 average the same either way. */
  const vo2 = latestVo2();
  const heart = heartRateEffort(records, today());
  const confirmed = new Set(excluded.filter(key => key.startsWith(CONFIRMED_PREFIX)).map(key => key.slice(CONFIRMED_PREFIX.length)));
  const curve = evidence.length ? fitnessCurve(evidence, today(), confirmed) : null;

  /* MILEAGE, FOR EVERY SOURCE. Past the distance a source speaks for, the
     athlete's weekly miles decide how much the pace fades — a 17:42 5K or a
     VO2 max of 55 is not a 2:37 marathon off thirteen miles a week. The
     shortfall is read at a provisional pace from whatever sources there are. */
  const vo2Raw = vo2 ? vo2RaceSeconds(vo2.value, goalMiles) : null;
  const heartRaw = heart ? equivalentSeconds(heart.seconds, heart.miles, goalMiles) : null;
  const curveRaw = curve ? predictFromCurve(curve, goalMiles, 0)?.seconds ?? null : null;
  const raw = [vo2Raw, heartRaw, curveRaw].filter((value): value is number => Boolean(value && value > 0));
  if (!raw.length) return null;
  const provisional = Math.exp(raw.reduce((sum, value) => sum + Math.log(value), 0) / raw.length);
  const shortfall = volumeShortfallFor(provisional / goalMiles, weeklyMiles);
  const vo2Seconds = vo2Raw ? Math.round(goalMiles > FIVE_K ? vo2Raw * Math.pow(goalMiles / FIVE_K, (RIEGEL_UNDERTRAINED - RIEGEL) * shortfall) : vo2Raw) : null;
  const heartSeconds = heart && heartRaw ? Math.round(equivalentSeconds(heart.seconds, heart.miles, goalMiles, shortfall)) : null;
  const prediction = curve ? predictFromCurve(curve, goalMiles, shortfall) : null;
  const freshest = curve ? Math.min(...curve.sources.map(item => daysAgo(item.date))) : 0;

  const parts: Array<{ seconds: number; weight: number }> = [];
  if (vo2Seconds) parts.push({ seconds: vo2Seconds, weight: AEROBIC_WEIGHT });
  if (heartSeconds) parts.push({ seconds: heartSeconds, weight: AEROBIC_WEIGHT });
  const curveWeight = prediction ? Math.max(CURVE_WEIGHT_FLOOR, 0.5 ** (Math.max(0, freshest - CURVE_FULL_DAYS) / CURVE_HALF_LIFE_DAYS)) : 0;
  if (prediction) parts.push({ seconds: prediction.seconds, weight: curveWeight });
  const total = parts.reduce((sum, part) => sum + part.weight, 0);
  const seconds = Math.round(Math.exp(parts.reduce((sum, part) => sum + part.weight * Math.log(part.seconds), 0) / total));
  const share = (weight: number) => Math.round((weight / total) * 100) / 100;

  /* THE RANGE takes in every source on its own, and never narrows below the
     curve's own scatter (or ±5% when there is no curve to read one from). */
  const scale = prediction ? seconds / prediction.seconds : 1;
  const low = Math.round(Math.min(prediction ? prediction.low * scale : seconds * 0.95, ...parts.map(part => part.seconds)));
  const high = Math.round(Math.max(prediction ? prediction.high * scale : seconds * 1.06, ...parts.map(part => part.seconds)));
  const aerobicCount = (vo2Seconds ? 1 : 0) + (heartSeconds ? 1 : 0);
  const confidence: RacePrediction['confidence'] = prediction
    ? (aerobicCount && prediction.confidence === 'low' ? 'medium' : prediction.confidence)
    : aerobicCount === 2 ? 'medium' : 'low';

  const said: string[] = [];
  if (vo2 && vo2Seconds) said.push(`your Garmin VO2 max of ${vo2.value} (${shortDate(vo2.date)}, ${Math.round(share(AEROBIC_WEIGHT) * 100)}%)`);
  if (heartSeconds) said.push(`the pace your heart rate holds on recent runs (${Math.round(share(AEROBIC_WEIGHT) * 100)}%)`);
  if (curve && prediction) said.push(`your best ${curve.sources.length === 1 ? 'hard run' : `${curve.sources.length} hard runs`} (${Math.round(share(curveWeight) * 100)}%, freshest ${freshest === 0 ? 'today' : freshest === 1 ? '1 day ago' : `${freshest} days ago`})`);
  const listed = said.length > 1 ? `${said.slice(0, -1).join(', ')} and ${said.at(-1)}` : said[0];
  const reason = `Built from ${listed}, adjusted for your ${Math.round(weeklyMiles)} miles a week.${!curve ? ' One timed hard run will sharpen it.' : ''}`;

  const best = curve?.sources[0];
  return {
    seconds,
    low,
    high,
    ...(vo2 && vo2Seconds ? { vo2: { value: vo2.value, date: vo2.date, seconds: vo2Seconds, share: share(AEROBIC_WEIGHT) } } : {}),
    ...(heartSeconds ? { heartRate: { seconds: heartSeconds, share: share(AEROBIC_WEIGHT) } } : {}),
    exponent: Math.round((prediction?.exponent ?? RIEGEL) * 1000) / 1000,
    fittedExponent: Boolean(curve?.fitted),
    confidence,
    reason,
    supportingRuns: curve ? evidence.filter(run => Math.abs(Math.log(goalMiles / run.miles)) <= NEAR_ENOUGH).length : 0,
    recentRunMiles: recentMiles,
    recentRunDays,
    ...(best ? { source: { date: best.date, miles: round2(best.miles), seconds: Math.round(best.seconds) } } : {}),
    ...(curve ? { sources: curve.sources.map(item => ({ date: item.date, miles: round2(item.miles), seconds: Math.round(item.seconds) })) } : {}),
  };
}

/* THE TESTED TIME AT A DISTANCE — the running side of "Tested max". Only a
   continuous effort that actually covered the goal distance counts (2% slack
   for GPS), and a longer one is read at its own average pace, so the number
   is something the athlete has run, never a projection up from a shorter
   effort. Efforts the athlete threw out of the predictor stay out here too.
   Null when no effort that long has been logged. */
export function testedRaceSeconds(records: WorkoutRecord[], goalMiles: number, excluded: string[] = []): number | null {
  if (!goalMiles) return null;
  let best: number | null = null;
  for (const run of trustedEfforts(raceEvidenceEfforts(records), excluded)) {
    if (run.miles < goalMiles * 0.98) continue;
    const seconds = run.seconds * (goalMiles / run.miles);
    if (best === null || seconds < best) best = seconds;
  }
  return best;
}
