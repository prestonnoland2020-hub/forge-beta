import { RIEGEL, RIEGEL_UNDERTRAINED } from './riegel';

/* ONE CURVE THROUGH EVERYTHING THE ATHLETE HAS RUN, INSTEAD OF ONE RUN.

   Every number in Forge — the goal verdict, the training paces, the plan's
   whole shape — used to rest on a single record: the best continuous effort in
   the last six months, converted with a fixed exponent. Three things were
   wrong with that, and they are the same thing wearing different clothes.

     ONE ENTRY MOVED EVERYTHING. Preston's log held a 5.47-mile run at 5:29/mi
     that never happened, and off that one line Forge told him his 5K was
     already inside his goal and paced his entire block from it. Not a small
     error — a wrong plan. Asking him about it (effortAudit) helps, but a
     system where one row can be that load-bearing is fragile whatever you
     bolt onto the front of it.

     THE EXPONENT WAS A CONSTANT. Riegel's 1.06 is a population average. It is
     close for a 5K runner going to 10K and wrong at both ends: a pure speed
     athlete fades harder than 1.06 and an ultra-runner holds on better, and
     carrying a 5K straight out to a marathon at 1.06 flatters everybody.

     AND IT ADMITTED NO DOUBT. "19:00" reads as a measurement. It is an
     estimate off two or three runs and it should say so.

   So: fit the athlete's own distance-time curve. In log space a running
   performance curve is a straight line — ln(time) = a + b·ln(distance) — where
   b is how well they hold pace as distance grows and a is where their whole
   curve sits. Fit both from their log, keep the population value as a prior
   for when the evidence is thin, and read the residual spread as the range.

   One fit, and the one-entry problem, the constant exponent and the missing
   range are all answered by the same object. */

export type Effort = { date: string; miles: number; seconds: number };

/* Six months, matching every other window in the app. */
export const CURVE_WINDOW_DAYS = 180;
/* An effort from ten weeks ago is worth about half of one from this week. */
export const RECENCY_HALF_LIFE_DAYS = 70;
export const RECENCY_FLOOR = 0.2;

/* DISTANCE BINS, SO TWENTY EASY FOUR-MILERS CANNOT OUTVOTE ONE TIME TRIAL.

   A least-squares fit over every logged run fits the athlete's TRAINING, not
   their capability — and most people's training is mostly easy running at
   whatever distance they habitually run. Grouping by distance and keeping only
   the best in each group fits the frontier instead: the fastest they have
   proved they can cover each kind of distance. Bins are 0.35 of a log unit,
   about a 1.4x spread, so a 3-mile and a 3.5-mile effort compete with each
   other and a 3-mile and a 5-mile do not. */
export const BIN_WIDTH_LOG = 0.35;

/* WHAT COUNTS AS A HARD EFFORT, AND WHAT COUNTS AS TOO GOOD TO BE TRUE.

   Two kinds of record must not be allowed to bend the curve, and they sit on
   opposite sides of it.

   EASY RUNS. Most people's long runs are their easy runs, so a frontier built
   from "the best effort at each distance" still says an athlete fades badly
   with distance when all it really shows is that they never run long hard.
   That is what pushed a first version of this fit to an exponent of 1.13 for a
   perfectly ordinary 5K runner.

   AND BAD RECORDS. A 5.47-mile run at 5:29/mi from an athlete whose real mile
   is 5:19 is not a data point about fade, it is a bad GPS lock.

   Both are handled the same way: every effort is measured against a REFERENCE
   — the athlete's SECOND-best effort, which one bad row cannot be — and
   weighted by how far it sits from it. Easy running falls away quickly. A
   genuine personal best a few percent up is untouched, because that is what a
   personal best looks like. Something 10% clear of everything else the athlete
   has ever logged is weighted almost out of the fit and is exactly what the
   audit question asks about — and answering "yes, that was real" restores it
   in full. */
export const TOL_SLOW = 0.06;
export const CREDIBLE = 0.3;
/* WHAT THE FIT WILL SET ASIDE ON ITS OWN, AND WHY IT IS SO NARROW.

   The obvious rule — drop any record that stands well clear of the rest — was
   tried and is wrong, and a test caught it on a completely ordinary log: an
   athlete who runs one hard mile a fortnight and jogs the rest is 17% clear of
   his own second-best effort every single time, because his second-best effort
   is a jog. Any threshold tight enough to catch a bad record also throws away
   the only hard running most people do.

   The one shape that IS safe to set aside is the one that keeps showing up in
   real logs: a LONG effort implying a better short performance than the
   athlete's actual best short effort. A hard mile among easy runs can never
   trip it, because a mile is not longer than anything. A mismeasured five-mile
   at 5:29/mi trips it immediately.

   A fake fast MILE cannot be caught here by anything — there is no shorter
   effort to check it against, and "much faster than your jogs" describes every
   time trial ever run. That one is the question's job, and effortAudit asks
   about it at the same 6%. */
export const OUTLIER_GAP = 0.06;
export const OUTLIER_DISTANCE_RATIO = 1.5;
export const MIN_LOG_TO_SET_ASIDE = 4;

/* HOW MUCH EVIDENCE IT TAKES TO MOVE THE EXPONENT OFF THE POPULATION VALUE.

   With two distances a fitted slope is mostly noise, so the fit is shrunk
   toward Riegel by a prior worth about two and a half bins of evidence. Two
   bins barely moves it; five bins across a real spread of distances moves it
   most of the way. And the distances have to actually be spread out: fitting a
   slope through a 3-mile and a 3.2-mile effort is fitting nothing. */
export const PRIOR_STRENGTH = 2.5;
export const MIN_SPAN_LOG = 0.5;
/* Nobody's real fade rate is outside this. A fit that says otherwise is a bad
   log, not a physiology discovery. */
export const EXPONENT_MIN = 1.02;
export const EXPONENT_MAX = 1.14;

/* WHERE THE CURVE SITS — the answer to "should this come from more than one
   effort?", which is yes.

   The level is set by the athlete's best few performances rather than their
   single best: the best one leads, the next two anchor it. A genuine personal
   best still moves the number, because it also drags the second and third
   places up behind it over the following weeks. A single false entry moves it
   by about half of its error instead of all of it — and, because it now sits
   well off the curve its own log describes, it is exactly what the audit
   question asks about. */
export const LEVEL_BLEND = [0.5, 0.3, 0.2];

/* PAST THE LONGEST THING THEY HAVE RUN, THE CURVE STEEPENS.

   Inside the range of distances an athlete has covered, the fitted exponent is
   about them. Beyond it, it is a guess, and Riegel's particular failure is
   well known: it flatters long extrapolations. A 5K carried out to a marathon
   at a flat exponent produces the times people post on forums and never run.
   So the exponent drifts up with the size of the stretch, and the drift is
   capped — beyond a point the honest answer is the confidence flag, not a
   bigger number. */
export const LONG_DRIFT = 0.02;
export const LONG_DRIFT_MAX = 0.06;

/* The band never closes below this, however tight the log looks: a race is
   run on a day, and days differ by more than a percent. */
export const MIN_BAND = 0.012;
/* Efforts within this much of the curve's level are what the spread is read
   from — everything above it is easy running, and its scatter is about how
   easy the easy days were, not about race-day variance. */
export const SPREAD_WINDOW = 0.07;

const DAY = 86_400_000;
const ms = (iso: string) => new Date(`${iso}T12:00:00`).getTime();
const ageDays = (iso: string, todayIso: string) => Math.max(0, (ms(todayIso) - ms(iso)) / DAY);
const recency = (iso: string, todayIso: string) =>
  Math.max(RECENCY_FLOOR, Math.pow(0.5, ageDays(iso, todayIso) / RECENCY_HALF_LIFE_DAYS));

export type CurvePoint = Effort & { weight: number; level: number };

export type FitnessCurve = {
  /* ln(seconds) = level + exponent · ln(miles) */
  level: number;
  exponent: number;
  /* True when the exponent is the athlete's own rather than the population
     prior — i.e. their log spans enough distance to say anything about fade. */
  fitted: boolean;
  /* The frontier: best effort per distance bin, newest-weighted. */
  points: CurvePoint[];
  /* The efforts the level was actually blended from, best first. */
  sources: Effort[];
  /* Longest distance with real evidence — where extrapolation starts. */
  longest: number;
  /* One standard deviation of log-time scatter among the athlete's hard
     efforts. The range is built from this. */
  spread: number;
  confidence: 'low' | 'medium' | 'high';
};

export type CurvePrediction = {
  seconds: number;
  low: number;
  high: number;
  exponent: number;
  confidence: FitnessCurve['confidence'];
  /* How far past the athlete's longest evidence this asks the curve to go, in
     natural log units — 0 inside their range. */
  stretch: number;
};

/* A weighted least-squares slope through (ln distance, ln time). */
function weightedSlope(points: Array<{ x: number; y: number; weight: number }>) {
  const total = points.reduce((sum, point) => sum + point.weight, 0);
  if (!total) return null;
  const meanX = points.reduce((sum, point) => sum + point.weight * point.x, 0) / total;
  const meanY = points.reduce((sum, point) => sum + point.weight * point.y, 0) / total;
  const denominator = points.reduce((sum, point) => sum + point.weight * (point.x - meanX) ** 2, 0);
  if (denominator < 1e-9) return null;
  const numerator = points.reduce((sum, point) => sum + point.weight * (point.x - meanX) * (point.y - meanY), 0);
  return numerator / denominator;
}

/** Fit the athlete's distance-time curve from their qualifying efforts.
 *  `efforts` must already be filtered to real running (runQuality) and to what
 *  the athlete has not marked false (effortAudit). */
export function fitnessCurve(efforts: Effort[], todayIso: string, confirmed: Set<string> = new Set()): FitnessCurve | null {
  const inWindow = efforts.filter(effort =>
    effort.miles > 0 && effort.seconds > 0 && ageDays(effort.date, todayIso) <= CURVE_WINDOW_DAYS);
  if (!inWindow.length) return null;

  const keyOf = (effort: Effort) => `${effort.date}|${effort.miles.toFixed(2)}|${Math.round(effort.seconds)}`;
  const levelAt = (effort: Effort, exponent: number) => Math.log(effort.seconds) - exponent * Math.log(effort.miles);

  /* THE REFERENCE IS THE ATHLETE'S BEST DAY, and everything is weighted by how
     far behind it sits: easy running falls away within a few percent, which is
     what keeps a Sunday jog from being read as evidence about how the athlete
     fades over distance.

     With one exception. If the best record stands a long way clear of the
     SECOND best — further than any real personal best on file ever has — it is
     the one thing in the log that cannot be checked against anything, so it is
     set aside and the second best becomes the reference. It is not discarded:
     effortAudit asks about it, and "yes, that was real" puts it back in full.
     A first version measured everything from the second best instead, which
     read a hard tempo beside a warm-up jog as an outlier — with two efforts,
     the second best IS the jog. */
  /* Long efforts that beat the athlete's best short one, which are set aside
     until answered. Computed once under the population exponent: which records
     look like a bad GPS lock should not depend on the fit they are about to
     bend. */
  /* AND IT TAKES A REAL LOG. With two or three efforts on file, the "best short
     effort" a long run is being measured against may well be a warm-up jog —
     which makes an ordinary 3-mile tempo beside a 9:00 mile look like a bad
     record. Below four efforts, or when setting one aside would leave nothing
     to fit, Forge sets nothing aside and asks instead. */
  const setAside = new Set<Effort>();
  for (const effort of inWindow.length >= MIN_LOG_TO_SET_ASIDE ? inWindow : []) {
    if (confirmed.has(keyOf(effort))) continue;
    const shorter = inWindow.filter(other => effort.miles / other.miles >= OUTLIER_DISTANCE_RATIO);
    if (!shorter.length) continue;
    const bestShort = Math.min(...shorter.map(other => levelAt(other, RIEGEL)));
    if (bestShort - levelAt(effort, RIEGEL) > OUTLIER_GAP) setAside.add(effort);
  }
  if (inWindow.length - setAside.size < 2) setAside.clear();

  /* THE REFERENCE IS THE ATHLETE'S BEST DAY, and everything is weighted by how
     far behind it sits: easy running falls away within a few percent, which is
     what keeps a Sunday jog from being read as evidence about how the athlete
     fades over distance. */
  const referenceOf = (levels: number[]) => Math.min(...levels);
  const credence = (effort: Effort, level: number, reference: number) => {
    if (setAside.has(effort)) return 0;
    return Math.exp(-((Math.max(0, level - reference) / TOL_SLOW) ** 2));
  };

  /* ── The frontier and the exponent, fitted together ────────────────────── */

     /* Which efforts count and what the exponent is depend on each other: an
        effort is judged against the curve, and the curve is fitted from the
        efforts that count. So it is solved the way that kind of problem is
        always solved — start from the population exponent, see who survives,
        refit, and let the survivors settle. Two rounds is enough; a third never
        moved an answer in the scenarios. */
  let exponent = RIEGEL;
  let points: CurvePoint[] = [];
  let span = 0;
  let raw: number | null = null;

  for (let round = 0; round < 2; round += 1) {
    const roundLevels = inWindow.map(effort => levelAt(effort, exponent));
    const roundReference = referenceOf(roundLevels.filter((_, index) => !setAside.has(inWindow[index])));
    const weighed = inWindow.map((effort, index) => ({
      effort,
      level: roundLevels[index],
      weight: recency(effort.date, todayIso) * credence(effort, roundLevels[index], roundReference),
    }));

    /* One point per distance band: the fastest CREDIBLE effort there. A band
       holding nothing but easy running contributes no point at all, because it
       is evidence about the athlete's Sundays and not about their range. */
    const bins = new Map<number, typeof weighed[number]>();
    for (const item of weighed) {
      if (item.weight < CREDIBLE) continue;
      const bin = Math.round(Math.log(item.effort.miles) / BIN_WIDTH_LOG);
      const held = bins.get(bin);
      if (!held || item.level < held.level) bins.set(bin, item);
    }
    points = [...bins.values()]
      .map(item => ({ ...item.effort, weight: item.weight, level: item.level }))
      .sort((a, b) => a.miles - b.miles);
    if (!points.length) return null;

    const xs = points.map(point => Math.log(point.miles));
    span = points.length > 1 ? Math.max(...xs) - Math.min(...xs) : 0;
    raw = span >= MIN_SPAN_LOG && points.length >= 3
      ? weightedSlope(points.map(point => ({ x: Math.log(point.miles), y: Math.log(point.seconds), weight: point.weight })))
      : null;
    const evidence = raw === null ? 0 : points.reduce((sum, point) => sum + point.weight, 0) * Math.min(1, span / MIN_SPAN_LOG);
    const blended = raw === null ? RIEGEL : (raw * evidence + RIEGEL * PRIOR_STRENGTH) / (evidence + PRIOR_STRENGTH);
    exponent = Math.min(EXPONENT_MAX, Math.max(EXPONENT_MIN, blended));
  }
  const fitted = raw !== null && Math.abs(exponent - RIEGEL) > 0.002;

  /* ── Pass three: the level, re-measured under the fitted exponent ──────── */
  const levels = inWindow.map(effort => levelAt(effort, exponent));
  const reference = referenceOf(levels.filter((_, index) => !setAside.has(inWindow[index])));
  const ranked = inWindow
    .map((effort, index) => ({ effort, level: levels[index], weight: recency(effort.date, todayIso) * credence(effort, levels[index], reference) }))
    .filter(item => item.weight >= CREDIBLE)
    .sort((a, b) => a.level - b.level);
  const pool = ranked.length ? ranked : [{ effort: inWindow[0], level: levels[0], weight: 1 }];
  const top = pool.slice(0, LEVEL_BLEND.length);
  const weights = top.map((item, index) => LEVEL_BLEND[index] * item.weight);
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const level = top.reduce((sum, item, index) => sum + weights[index] * item.level, 0) / weightTotal;

  /* THE SPREAD, read only from the athlete's hard days. */
  const hard = pool.filter(item => item.level - level <= SPREAD_WINDOW);
  const spread = hard.length >= 2
    ? Math.sqrt(hard.reduce((sum, item) => sum + (item.level - level) ** 2, 0) / (hard.length - 1))
    : 0;

  const freshest = Math.min(...pool.map(item => ageDays(item.effort.date, todayIso)));
  const confidence: FitnessCurve['confidence'] =
    points.length >= 3 && span >= MIN_SPAN_LOG && freshest <= 60 ? 'high'
      : points.length >= 2 && freshest <= 120 ? 'medium'
        : 'low';

  return {
    level, exponent, fitted, points,
    sources: top.map(item => item.effort),
    longest: Math.max(...points.map(point => point.miles)),
    spread, confidence,
  };
}

/** What the curve says the athlete is worth at a distance TODAY.
 *  `volumeShortfall` is 0 when their weekly mileage already supports the pace
 *  and 1 when they are running nothing — it steepens extrapolation upward,
 *  the same correction the single-effort predictor applied. */
export function predictFromCurve(curve: FitnessCurve, miles: number, volumeShortfall = 0): CurvePrediction | null {
  if (!curve || !(miles > 0)) return null;
  const inside = Math.min(miles, curve.longest);
  const base = Math.exp(curve.level + curve.exponent * Math.log(inside));
  const stretch = miles > curve.longest ? Math.log(miles / curve.longest) : 0;
  /* Beyond the evidence: the fitted exponent, plus the long-extrapolation
     drift, plus whatever the athlete's volume does not support. */
  const drift = Math.min(LONG_DRIFT_MAX, LONG_DRIFT * stretch);
  const shortfall = Math.min(1, Math.max(0, volumeShortfall));
  const outside = curve.exponent + drift + (RIEGEL_UNDERTRAINED - RIEGEL) * shortfall;
  const seconds = stretch ? base * Math.pow(miles / curve.longest, outside) : base;

  /* THE RANGE. Day-to-day scatter, widened by how far this is being carried
     past what the athlete has shown and by how little there is to go on. */
  const thin = curve.points.length >= 3 ? 1 : curve.points.length === 2 ? 1.35 : 1.8;
  const band = Math.max(MIN_BAND, curve.spread) * (1 + 0.6 * stretch) * thin;
  return {
    seconds: Math.round(seconds),
    low: Math.round(seconds * Math.exp(-band)),
    high: Math.round(seconds * Math.exp(band)),
    exponent: stretch ? outside : curve.exponent,
    confidence: stretch > 0.7 ? 'low' : curve.confidence,
    stretch,
  };
}

/* HOW FAR CLEAR OF EVERYTHING ELSE AN EFFORT STANDS, with that effort left out
   of the fit so it cannot vote for itself.

   The comparison is against the BEST of the remaining efforts, not against the
   curve's blended level — measuring against the blend makes every genuine
   personal best look 5-6% clear, because the blend deliberately sits behind
   the athlete's best day. What the question is actually about is simpler:
   converted to a common distance at this athlete's own fade rate, is this
   record faster than the best thing they have ever logged, and by how much. */
export function leaveOneOutGap(efforts: Effort[], effort: Effort, todayIso: string): number | null {
  const rest = efforts.filter(other => other !== effort
    && other.miles > 0 && other.seconds > 0 && ageDays(other.date, todayIso) <= CURVE_WINDOW_DAYS);
  if (rest.length < 2) return null;
  const curve = fitnessCurve(rest, todayIso);
  if (!curve) return null;
  const levelOf = (item: Effort) => Math.log(item.seconds) - curve.exponent * Math.log(item.miles);
  return Math.min(...rest.map(levelOf)) - levelOf(effort);
}
