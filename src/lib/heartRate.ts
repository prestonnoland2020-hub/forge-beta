import { cardioMiles, summarizeCardioDraft, type CardioLogDraft } from './cardioSession';

/* HEART RATE IS HOW HARD IT WAS. Pace alone cannot tell an easy 9:30 mile from
   a hard one, so until now an athlete's easy running — most of their running —
   said nothing about their fitness, and an athlete who never raced had no
   evidence at all. A watch records how hard the heart worked for every run;
   this module turns that into four things:

     1. the athlete's maximum heart rate, from their own watch where it can be;
     2. zones, and an effort grade for every run;
     3. their threshold pace as heart rate implies it — the pace they hold at
        about 89% of max — fitted across the last six weeks of running;
     4. how that pace is moving, week by week.

   Everything here reads `recorded` on a session: the watch's own minutes,
   miles and heart rate, kept beside the athlete's numbers by the import.
   Nothing is guessed when the watch said nothing. */

type HrRecord = { date: string; cardioSessions?: Array<Record<string, unknown>> };
export type HrRun = { date: string; miles: number; minutes: number; averageHr: number; maxHr?: number };

/* Kept here rather than imported, so the pace model can depend on this module
   without a cycle. Same value as paceModel's THRESHOLD_MILES (~10K). */
const THRESHOLD_EFFORT_MILES = 6.214;

/* Threshold heart rate as a share of max: the top of what can be held for
   about an hour. 0.89 sits in the middle of the 0.86–0.92 every lab range
   lands in. */
export const THRESHOLD_SHARE = 0.89;
/* The effort bands, as shares of max heart rate. */
export const EASY_CEILING_SHARE = 0.76;
export const STEADY_CEILING_SHARE = 0.84;
export const THRESHOLD_CEILING_SHARE = 0.92;

/* A run has to be long enough for its average to settle, and the pace fit
   only trusts the window of running that describes the athlete today. */
const MIN_RUN_MILES = 1.5;
export const FIT_WINDOW_DAYS = 42;
const MIN_FIT_RUNS = 4;
/* How wide the heart rates have to spread before a line through them means
   anything; narrower than this and the fit is anchored instead (below). */
const MIN_FIT_SPREAD = 0.06;
/* Running speed falls to nothing at roughly 45% of max heart rate (standing
   and walking). Used only to anchor a single-intensity history. */
const ZERO_SPEED_SHARE = 0.45;

const isRun = (activity: unknown) => /run|jog|tempo|track|base|easy|speed|long/i.test(String(activity || ''));
const daysBetween = (from: string, to: string) => Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86400000);

/* Every run the watch put a heart rate on. */
export function heartRateRuns(records: HrRecord[]): HrRun[] {
  const out: HrRun[] = [];
  for (const record of records || []) {
    for (const raw of record.cardioSessions || []) {
      const session = raw as CardioLogDraft;
      const hr = session.recorded;
      if (!hr?.averageHr || !isRun(session.activity)) continue;
      const miles = Number(hr.miles) || cardioMiles(session);
      const minutes = Number(hr.minutes) || summarizeCardioDraft(session).minutes;
      if (!(miles > 0) || !(minutes > 0)) continue;
      out.push({ date: record.date, miles, minutes, averageHr: hr.averageHr, ...(hr.maxHr ? { maxHr: hr.maxHr } : {}) });
    }
  }
  return out;
}

/* MAX HEART RATE, FROM THE ATHLETE'S OWN WATCH WHEN IT CAN BE. The highest
   reading in a year of activities is usually real — and once in a while a
   strap glitch. The second-highest survives a single spike and is still the
   athlete's own number. With no watch maxima at all, the age formula
   (Tanaka: 208 − 0.7 × age) stands in, and says so. */
export type MaxHeartRate = { bpm: number; source: 'watch' | 'age' };
/* THE ATHLETE'S BIRTH DATE, FOR CALLERS THAT DO NOT HAVE IT. The pace model
   and the race predictor are called from a dozen places with records and no
   profile; an athlete who never runs hard has a watch maximum well below their
   real one, and only age catches that. ProfileSetupProvider hands it over. */
let knownBirthDate = '';
export const rememberBirthDate = (birthDate?: string) => { knownBirthDate = birthDate || ''; };
export function estimateMaxHr(records: HrRecord[], birthDate: string | undefined = knownBirthDate, todayIso = new Date().toISOString().slice(0, 10)): MaxHeartRate | null {
  const maxima: number[] = [];
  for (const record of records || []) {
    if (daysBetween(record.date, todayIso) > 365) continue;
    for (const raw of record.cardioSessions || []) {
      const value = Number((raw as CardioLogDraft).recorded?.maxHr);
      if (value >= 120 && value <= 230) maxima.push(value);
    }
  }
  maxima.sort((a, b) => b - a);
  const observed = maxima.length >= 3 ? maxima[1] : maxima[0];
  const age = birthDate && /^\d{4}-\d{2}-\d{2}$/.test(birthDate) ? Math.floor(daysBetween(birthDate, todayIso) / 365.25) : 0;
  const predicted = age >= 12 && age <= 90 ? 208 - 0.7 * age : 0;
  /* A watch max well under what the athlete's age predicts usually means they
     have never run hard with it on — not that their heart tops out there. */
  if (observed && (!predicted || observed >= predicted * 0.93)) return { bpm: Math.round(Math.min(215, Math.max(150, observed))), source: 'watch' };
  if (predicted) return { bpm: Math.round(predicted), source: 'age' };
  return observed ? { bpm: Math.round(Math.min(215, Math.max(150, observed))), source: 'watch' } : null;
}

export type HrEffort = 'easy' | 'steady' | 'threshold' | 'hard';
export const effortOf = (averageHr: number, maxHr: number): HrEffort => {
  const share = averageHr / maxHr;
  return share < EASY_CEILING_SHARE ? 'easy' : share < STEADY_CEILING_SHARE ? 'steady' : share < THRESHOLD_CEILING_SHARE ? 'threshold' : 'hard';
};
export const EFFORT_LABEL: Record<HrEffort, string> = { easy: 'Easy', steady: 'Steady', threshold: 'Threshold', hard: 'Hard' };

/* The numbers a workout card prints. */
export type HeartRateTargets = { max: number; source: MaxHeartRate['source']; easyCeiling: number; thresholdLow: number; thresholdHigh: number };
export const heartRateTargets = (max: MaxHeartRate | null): HeartRateTargets | null => max ? {
  max: max.bpm, source: max.source,
  easyCeiling: Math.round(max.bpm * EASY_CEILING_SHARE),
  thresholdLow: Math.round(max.bpm * 0.86),
  thresholdHigh: Math.round(max.bpm * 0.91),
} : null;

/* THRESHOLD PACE AS HEART RATE IMPLIES IT.

   Across a few weeks of running, speed rises in a near-straight line with
   heart rate. Fit that line through the athlete's runs and read off the
   speed at threshold heart rate: that is the pace they could hold for about
   an hour, from runs that were never run hard. Fitted on speed, not pace,
   because speed is the quantity that is linear in heart rate.

   When every run sat at about the same heart rate there is no line to fit,
   so the athlete's average run is carried to threshold along a line through
   zero speed at 45% of max — a population slope, labelled 'anchored' so a
   consumer can trust it less. */
export type AerobicFit = { thresholdSecondsPerMile: number; runs: number; method: 'fit' | 'anchored'; asOf: string };
export function aerobicFit(runs: HrRun[], maxHr: number, asOf: string, windowDays = FIT_WINDOW_DAYS): AerobicFit | null {
  const points = runs
    .filter(run => run.miles >= MIN_RUN_MILES && run.date <= asOf && daysBetween(run.date, asOf) <= windowDays)
    .map(run => ({ share: run.averageHr / maxHr, speed: run.miles / (run.minutes / 60) }))
    .filter(point => point.share >= 0.6 && point.share <= 0.97 && point.speed > 3 && point.speed < 16);
  if (points.length < MIN_FIT_RUNS) return null;
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const shares = points.map(point => point.share);
  const spread = Math.max(...shares) - Math.min(...shares);
  let speedAtThreshold = 0;
  let method: AerobicFit['method'] = 'anchored';
  if (spread >= MIN_FIT_SPREAD) {
    const mx = mean(shares); const my = mean(points.map(point => point.speed));
    const sxx = points.reduce((sum, point) => sum + (point.share - mx) ** 2, 0);
    const sxy = points.reduce((sum, point) => sum + (point.share - mx) * (point.speed - my), 0);
    const slope = sxx ? sxy / sxx : 0;
    /* A flat or backwards line (faster at lower heart rate) is noise — heat,
       hills, a bad strap — not physiology; fall back to the anchor. */
    if (slope > 0) { speedAtThreshold = my + slope * (THRESHOLD_SHARE - mx); method = 'fit'; }
  }
  if (method === 'anchored') {
    const ratios = points.map(point => point.speed / (point.share - ZERO_SPEED_SHARE)).sort((a, b) => a - b);
    const median = ratios[Math.floor(ratios.length / 2)];
    speedAtThreshold = median * (THRESHOLD_SHARE - ZERO_SPEED_SHARE);
  }
  if (!(speedAtThreshold > 4) || speedAtThreshold > 14) return null;
  return { thresholdSecondsPerMile: 3600 / speedAtThreshold, runs: points.length, method, asOf };
}

/* HOW THAT PACE IS MOVING. The fit is taken as of each of the last twelve
   weeks, and the slope through those points (Theil–Sen, as everywhere else
   in Forge: one odd week cannot tip it) is the athlete's real rate of
   improvement — the number a goal projection should use instead of assuming
   one. Returned as a share of pace per week; positive means getting faster. */
export type AerobicTrend = { weeklyRate: number; secondsPerMilePerWeek: number; points: number };
export function aerobicTrend(runs: HrRun[], maxHr: number, todayIso: string, weeks = 12): AerobicTrend | null {
  const series: Array<{ week: number; pace: number }> = [];
  for (let back = weeks; back >= 0; back--) {
    const asOf = new Date(`${todayIso}T12:00:00`); asOf.setDate(asOf.getDate() - back * 7);
    const fit = aerobicFit(runs, maxHr, asOf.toISOString().slice(0, 10));
    if (fit) series.push({ week: -back, pace: fit.thresholdSecondsPerMile });
  }
  if (series.length < 4) return null;
  const slopes: number[] = [];
  for (let i = 0; i < series.length; i++) for (let j = i + 1; j < series.length; j++) slopes.push((series[j].pace - series[i].pace) / (series[j].week - series[i].week));
  slopes.sort((a, b) => a - b);
  const slope = slopes[Math.floor(slopes.length / 2)];
  const current = series[series.length - 1].pace;
  return { weeklyRate: -slope / current, secondsPerMilePerWeek: Math.round(-slope * 10) / 10, points: series.length };
}

/* THE ONE NUMBER THE PACE MODEL AND THE RACE PREDICTOR TAKE: a dated effort
   at threshold distance, run at the pace heart rate implies — the same shape
   as a logged race, so it enters the same curve. Null whenever the watch has
   not said enough: no max heart rate, or fewer than four recent runs. */
export function heartRateEffort(records: HrRecord[], todayIso: string, birthDate: string | undefined = knownBirthDate): { date: string; miles: number; seconds: number } | null {
  const max = estimateMaxHr(records, birthDate, todayIso);
  if (!max) return null;
  const fit = aerobicFit(heartRateRuns(records), max.bpm, todayIso);
  if (!fit) return null;
  return { date: todayIso, miles: THRESHOLD_EFFORT_MILES, seconds: fit.thresholdSecondsPerMile * THRESHOLD_EFFORT_MILES };
}

/* EASY DAYS RUN HARD, BY HEART RATE. The pace check cannot see a hot week or
   a hilly route; heart rate can. Over the last seven days, the runs that were
   not the week's hard session (those dates are passed in), and how many of
   them sat at threshold effort or above. Worth a word at two or more, when
   they are most of the easy running. */
export function easyRunsTooHard(runs: HrRun[], maxHr: number, todayIso: string, hardSessionDates: string[] = []): { runs: number; tooHard: number; ceiling: number; averageHr: number } | null {
  const skip = new Set(hardSessionDates);
  const week = runs.filter(run => !skip.has(run.date) && run.date <= todayIso && daysBetween(run.date, todayIso) < 7);
  const hard = week.filter(run => effortOf(run.averageHr, maxHr) === 'threshold' || effortOf(run.averageHr, maxHr) === 'hard');
  if (hard.length < 2 || hard.length * 2 < week.length) return null;
  return { runs: week.length, tooHard: hard.length, ceiling: Math.round(maxHr * EASY_CEILING_SHARE), averageHr: Math.round(hard.reduce((sum, run) => sum + run.averageHr, 0) / hard.length) };
}
