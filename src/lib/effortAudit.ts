/* WHEN THE EVIDENCE IS TOO GOOD, ASK BEFORE BUILDING ON IT.

   Every goal verdict, every training pace and every projection in Forge rests
   on ONE number: the athlete's best recent continuous effort. So a single bad
   record does not cause a small error, it causes a wrong plan — Preston's log
   held a 5.47-mile run at 5:29/mi that never happened, and off it Forge told
   him his 5K was already inside his goal and paced his whole block from it.

   THREE THINGS WERE TRIED BEFORE THIS, AND THE ORDER MATTERS:

     1. A world-record floor. Catches the impossible — a 1.4-mile at 3:39/mi —
        and nothing else. A 5:29 five-miler is a time plenty of people run.
     2. "A longer run cannot be faster per mile than a shorter one." True, and
        it does not fire here: his real mile is 5:19, so 5:29 for five miles
        is not a contradiction, just a very good day.
     3. A statistical outlier test. Sorted by mile-equivalent his log reads
        4:57, 5:12, 5:16, 5:28, 5:37, 5:41, 5:48 — smooth. Any rule tight
        enough to cut the 4:57 would also cut a genuine breakthrough, and
        silently discarding somebody's PR is the worse failure.

   It was also worth checking whether the imports themselves were wrong: the
   three bad records all became plausible easy-run paces if their distance were
   kilometres mislabelled as miles. Across his whole log, though, Strava-sourced
   runs and hand-logged ones have the same pace distribution — median 8:00/mi
   against 7:59 — so there is no import bug to fix, only bad individual records.

   Which leaves the honest answer: Forge cannot tell, so Forge asks. Once, about
   the one effort that is actually driving the numbers, and then it remembers. */

import { isRaceEvidence } from './runQuality';

/* WHAT MAKES A RESULT WORTH CONFIRMING — and the first attempt at this was
   wrong in an instructive way. "Better than the next-best effort by 3%" fires
   on a genuine personal best just as readily as on a bad record: Preston's
   real 5:19 mile is 5% clear of his 5:28, and being interrogated about a PR
   you are proud of is exactly how a question gets trained out of somebody.

   The suspicious shape is narrower than "very good". It is a LONG effort that
   beats the athlete's best SHORT one. A short time trial is the most direct
   measurement of fitness there is and there is nothing to doubt about it; a
   long run that implies better fitness than that time trial is either a
   breakthrough or a bad GPS lock, and those are worth telling apart. */
export const STANDOUT_MARGIN = 0.02;
/* A longer effort faster per mile than a shorter one READS like a
   contradiction, and for a while this excluded such efforts outright. That was
   wrong, and a test caught it: if the only shorter run on file is a warm-up
   jog at 9:00/mi, then a perfectly ordinary 3-mile tempo at 7:00/mi is "faster
   per mile than a shorter effort" and was silently thrown away.

   The comparison is only meaningful against the athlete's BEST short effort,
   and nothing can tell from the data whether the short effort on file was a
   time trial or a jog. So self-comparison no longer excludes anything by
   itself — it decides what is worth ASKING about. The only automatic exclusion
   left is the world-record floor in runQuality, which is about the human race
   rather than about this athlete and cannot produce a false positive. */
export const CONTRADICTION_MARGIN = 0.01;
export const DISTANCE_RATIO = 1.5;
export const CONFIRMED_PREFIX = 'ok:';

export type Effort = { date: string; miles: number; seconds: number };

/* The key an answer is remembered against. Rounded so a float that survives a
   round trip through JSON still matches. */
export const effortKey = (effort: Effort) =>
  `${effort.date}|${effort.miles.toFixed(2)}|${Math.round(effort.seconds)}`;

const mileEquivalent = (effort: Effort) => effort.seconds * Math.pow(1 / effort.miles, 1.06);
const clock = (seconds: number) => {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

/* IMPOSSIBLE FOR THIS ATHLETE — no question needed. */
export function contradicted(efforts: Effort[]): Effort[] {
  const real = efforts.filter(effort => isRaceEvidence(effort.miles, effort.seconds));
  return real.filter(effort => {
    const pace = effort.seconds / effort.miles;
    const shorter = real.filter(other => effort.miles / other.miles >= DISTANCE_RATIO);
    if (!shorter.length) return false;
    const best = Math.min(...shorter.map(other => other.seconds / other.miles));
    return pace < best * (1 - CONTRADICTION_MARGIN);
  });
}

export type StandoutAsk = {
  effort: Effort;
  key: string;
  /* The next best effort it is being measured against. */
  runnerUp: Effort;
  /* Seconds per mile of headroom between them, at mile-equivalent. */
  aheadBy: number;
  say: string;
  question: string;
};

/* THE ONE EFFORT WORTH ASKING ABOUT: the best one, when it stands clear of
   everything else the athlete has done. If it is only marginally the best it
   is not interesting — whichever of the top two is right, the answer is
   almost the same. */
export function standoutEffort(efforts: Effort[], answered: string[] = []): StandoutAsk | null {
  /* BOTH ANSWERS COUNT AS ANSWERED. A confirmed effort is stored with an "ok:"
     prefix so it is remembered without being excluded — recording only the
     rejections would mean a genuine personal best got queried again on every
     open, which teaches people to dismiss the question without reading it. */
  const seen = new Set(answered.map(key => key.startsWith(CONFIRMED_PREFIX) ? key.slice(CONFIRMED_PREFIX.length) : key));
  const real = efforts
    .filter(effort => isRaceEvidence(effort.miles, effort.seconds))
    .filter(effort => !seen.has(effortKey(effort)));
  const usable = real;
  if (usable.length < 2) return null;

  const ranked = [...usable].sort((a, b) => mileEquivalent(a) - mileEquivalent(b));
  const best = ranked[0];
  const bestEquivalent = mileEquivalent(best);
  /* The best SHORTER effort — the direct measurement this one has to beat
     before it is worth querying. With nothing shorter to check against there
     is no question to ask: a short time trial stands on its own. */
  const shorter = usable.filter(effort => best.miles / effort.miles >= DISTANCE_RATIO);
  if (!shorter.length) return null;
  const runnerUp = shorter.reduce((winner, effort) =>
    mileEquivalent(effort) < mileEquivalent(winner) ? effort : winner, shorter[0]);
  const nextEquivalent = mileEquivalent(runnerUp);
  if (bestEquivalent >= nextEquivalent * (1 - STANDOUT_MARGIN)) return null;

  const aheadBy = nextEquivalent - bestEquivalent;
  return {
    effort: best, key: effortKey(best), runnerUp, aheadBy,
    say: `Your ${best.miles.toFixed(2)} mi on ${best.date} at ${clock(best.seconds / best.miles)}/mi is worth more than your best short effort — ${runnerUp.miles.toFixed(2)} mi at ${clock(runnerUp.seconds / runnerUp.miles)}/mi — by ${Math.round(aheadBy)} seconds a mile.`,
    question: 'Every goal and every training pace is built on it. Was that a real effort?',
  };
}

/* What a prediction is allowed to use: everything real, minus what the athlete
   has said is not a real effort, minus what contradicts itself outright. */
export function trustedEfforts<T extends Effort>(efforts: T[], excluded: string[] = []): T[] {
  const out = new Set(excluded);
  return efforts.filter(effort => !out.has(effortKey(effort)));
}
