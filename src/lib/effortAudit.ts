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
import { leaveOneOutGap } from './fitnessCurve';
import { localDayIso } from './time';

/* WHAT MAKES A RESULT WORTH CONFIRMING — and the first two attempts at this
   were wrong in instructive ways.

   "Better than the next-best effort by 3%" fires on a genuine personal best
   just as readily as on a bad record: Preston's real 5:19 mile is 5% clear of
   his 5:28, and being interrogated about a PR you are proud of is exactly how
   a question gets trained out of somebody.

   Narrowing it to "a LONG effort that beats the athlete's best SHORT one"
   fixed that and left a hole you could drive a bus through: a fake fast MILE
   is not long, so nothing looked at it at all. Every mislog Forge had actually
   seen happened to be a long one, which is not a reason to believe the next
   one will be.

   The right comparison is against the athlete's own distance-time curve, fitted
   WITHOUT the effort in question so it cannot vote for itself. That works at
   any distance and it separates cleanly on every case on file: genuine
   personal bests land 2-4% clear of the curve their own log describes, and the
   records Preston confirmed were false land at 12% and 22%. Six percent is the
   line between them, with room on both sides. */
export const ASK_GAP = 0.06;

/* AND THE OLD RULE STAYS, BECAUSE IT CATCHES SOMETHING THE NEW ONE CANNOT.

   Preston's actual log is the awkward case. Fitted to his own curve, the false
   5.47-mile at 5:29/mi stands only 4.8% clear of his genuine 5:19 mile —
   inside any threshold loose enough to leave real personal bests alone. It is
   not a statistical outlier at all. What it IS, unmistakably, is a long effort
   that implies better fitness than the athlete's best short time trial, and a
   short time trial is the most direct measurement of fitness there is.

   So there are two questions, and either can fire. The curve gap catches a
   record that is implausible at ANY distance, including a fake fast mile that
   the shape rule cannot see. The shape rule catches the specific thing that
   keeps happening in real logs: a GPS-mismeasured long run. Neither alone
   covers both, and between them nothing on file gets through. */
export const STANDOUT_MARGIN = 0.02;
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
  /* How far clear of the athlete's own curve it sits, in percent. */
  aheadBy: number;
  say: string;
  question: string;
};

/* THE ONE EFFORT WORTH ASKING ABOUT. Two independent reasons to doubt a
   record; whichever is more sure of itself is the one that gets asked. */
export function standoutEffort(efforts: Effort[], answered: string[] = [], todayIso = localDayIso()): StandoutAsk | null {
  /* BOTH ANSWERS COUNT AS ANSWERED. A confirmed effort is stored with an "ok:"
     prefix so it is remembered without being excluded — recording only the
     rejections would mean a genuine personal best got queried again on every
     open, which teaches people to dismiss the question without reading it. */
  const seen = new Set(answered.map(key => key.startsWith(CONFIRMED_PREFIX) ? key.slice(CONFIRMED_PREFIX.length) : key));
  const real = efforts.filter(effort => isRaceEvidence(effort.miles, effort.seconds));
  const unanswered = real.filter(effort => !seen.has(effortKey(effort)));
  if (real.length < 2 || !unanswered.length) return null;

  const ask = (effort: Effort, runnerUp: Effort, gap: number, why: string): StandoutAsk => ({
    effort, key: effortKey(effort), runnerUp, aheadBy: Math.round(gap * 1000) / 10,
    say: `Your ${effort.miles.toFixed(2)} mi on ${effort.date} at ${clock(effort.seconds / effort.miles)}/mi is about ${Math.max(1, Math.round(gap * 100))}% ${why} — your ${runnerUp.miles.toFixed(2)} mi at ${clock(runnerUp.seconds / runnerUp.miles)}/mi.`,
    question: 'Every goal and every training pace is built on it. Was that a real effort?',
  });

  type Candidate = { ask: StandoutAsk; gap: number };
  const found: Candidate[] = [];
  const offer = (candidate: Candidate) => { found.push(candidate); };

  /* ONE: A RECORD THAT BEATS THE ATHLETE'S WHOLE LOG. Works at any distance,
     including a fake fast mile, because the comparison is the athlete's own
     fitted curve rather than a fixed idea of what a suspicious shape is. */
  if (real.length >= 3) {
    for (const effort of unanswered) {
      const gap = leaveOneOutGap(real, effort, todayIso);
      if (gap === null || gap < ASK_GAP) continue;
      const others = real.filter(other => other !== effort);
      const runnerUp = others.reduce((winner, other) => mileEquivalent(other) < mileEquivalent(winner) ? other : winner, others[0]);
      offer({ gap, ask: ask(effort, runnerUp, gap, 'faster than everything else in your log, including') });
    }
  }

  /* TWO: A LONG EFFORT THAT BEATS A SHORT TIME TRIAL. There is nothing to
     doubt about a hard mile; a five-miler implying a better mile than the mile
     did is either a breakthrough or a bad GPS lock. */
  const ranked = [...unanswered].sort((a, b) => mileEquivalent(a) - mileEquivalent(b));
  const standout = ranked[0];
  const shorter = real.filter(effort => standout.miles / effort.miles >= DISTANCE_RATIO);
  if (shorter.length) {
    const runnerUp = shorter.reduce((winner, effort) => mileEquivalent(effort) < mileEquivalent(winner) ? effort : winner, shorter[0]);
    const gap = 1 - mileEquivalent(standout) / mileEquivalent(runnerUp);
    if (gap >= STANDOUT_MARGIN) offer({ gap, ask: ask(standout, runnerUp, gap, 'worth more per mile than your best short effort') });
  }

  if (!found.length) return null;
  return found.reduce((winner, candidate) => candidate.gap > winner.gap ? candidate : winner).ask;
}

/* What a prediction is allowed to use: everything real, minus what the athlete
   has said is not a real effort, minus what contradicts itself outright. */
export function trustedEfforts<T extends Effort>(efforts: T[], excluded: string[] = []): T[] {
  const out = new Set(excluded);
  return efforts.filter(effort => !out.has(effortKey(effort)));
}
