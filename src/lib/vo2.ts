/* THE WATCH'S READ ON CURRENT FITNESS.

   Every race number in Forge is fitted to the athlete's own hard efforts
   (fitnessCurve). That is the right primary evidence, and it has one blind
   spot: it can only move when a hard effort is logged. Preston's 5K card read
   19:50 off efforts from weeks back while he felt slower than that -- and his
   Garmin was estimating his fitness every day the whole time.

   Garmin's VO2 max is that daily estimate. It is not a race: it is a model
   on heart rate and pace, and it can sit a few points off for an individual.
   So it never replaces the curve; it is blended in, and it counts for more
   the older the athlete's freshest hard effort is. A time trial last week
   dominates; a curve built on runs from two months ago yields to the watch. */

export type Vo2Reading = { value: number; date: string };

/* Daniels & Gilbert. The oxygen cost of running at v metres per minute, and
   the fraction of VO2 max that can be held for t minutes. A race time is the
   t at which the two meet. These are the equations behind the VDOT tables and
   the same family Garmin's own race predictor uses. */
const oxygenCost = (metresPerMinute: number) => -4.60 + 0.182258 * metresPerMinute + 0.000104 * metresPerMinute ** 2;
const sustainable = (minutes: number) => 0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes);

/** The race time (seconds) a VO2 max predicts for a distance in miles. */
export function vo2RaceSeconds(vo2max: number, miles: number): number | null {
  if (!(vo2max > 20 && vo2max < 95) || !(miles > 0)) return null;
  const metres = miles * 1609.344;
  let fast = metres / 600; // 600 m/min is faster than any human
  let slow = metres / 60;  // 60 m/min is a walk
  for (let step = 0; step < 60; step += 1) {
    const minutes = (fast + slow) / 2;
    // Too fast for this VO2 max -> go slower.
    if (oxygenCost(metres / minutes) > vo2max * sustainable(minutes)) fast = minutes;
    else slow = minutes;
  }
  return Math.round(((fast + slow) / 2) * 60);
}

/* The latest reading, kept on the device so the first paint of a goal card
   already has it. Refreshed from health_daily_snapshots by the training
   provider; a reading older than this is not "current" fitness. */
export const VO2_FRESH_DAYS = 45;
const KEY = 'forge-garmin-vo2-v1';

export function latestVo2(): Vo2Reading | null {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || 'null') as Vo2Reading | null;
    if (!stored || !(stored.value > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(stored.date)) return null;
    const age = (Date.now() - new Date(`${stored.date}T12:00:00`).getTime()) / 86400000;
    return age <= VO2_FRESH_DAYS ? stored : null;
  } catch { return null; }
}

export function rememberVo2(reading: Vo2Reading | null) {
  try {
    const before = localStorage.getItem(KEY);
    const next = reading ? JSON.stringify(reading) : null;
    if (before === next) return;
    if (next) localStorage.setItem(KEY, next); else localStorage.removeItem(KEY);
    window.dispatchEvent(new Event('forge:vo2'));
  } catch { /* storage unavailable: predictions simply go without it */ }
}

/* HOW MUCH THE WATCH COUNTS. 0.35 against a hard effort from this week, so a
   fresh time trial still carries about three quarters of the answer; the
   curve's weight halves every six weeks its freshest effort ages, down to a
   quarter -- so with nothing hard in two or three months, the watch leads. */
export const VO2_WEIGHT = 0.35;
export const CURVE_HALF_LIFE_DAYS = 42;
export const CURVE_WEIGHT_FLOOR = 0.25;

export function blendWithVo2(curveSeconds: number, freshestEffortAgeDays: number, vo2Seconds: number) {
  const curveWeight = Math.max(CURVE_WEIGHT_FLOOR, 0.5 ** (Math.max(0, freshestEffortAgeDays) / CURVE_HALF_LIFE_DAYS));
  const share = VO2_WEIGHT / (VO2_WEIGHT + curveWeight);
  /* In log space: a time is a ratio scale, and a blend of 18:00 and 20:00
     should not depend on which way round they are written. */
  const seconds = Math.round(Math.exp((1 - share) * Math.log(curveSeconds) + share * Math.log(vo2Seconds)));
  return { seconds, vo2Share: Math.round(share * 100) / 100 };
}

