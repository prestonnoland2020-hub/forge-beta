import { parsePrescription, type PrescriptionKind, type VerdictOutcome } from './sessionVerdict';
import type { Effort } from './fitnessCurve';

/* A WORKOUT YOU ACTUALLY COMPLETED IS EVIDENCE ABOUT YOUR FITNESS.

   Every number Forge predicts came off RACES and time trials — continuous
   efforts pulled out of the log. Which meant an athlete who trains hard and
   never races got a projection that only ever decayed: the mile from July aged
   out of relevance week by week while three months of hitting every session on
   the nose said nothing at all.

   That is wrong, and it is wrong in the direction that matters most, because
   most people race two or three times a year and train fifty weeks of it.

   SO A JUDGED SESSION BECOMES A DATED EFFORT ON THE SAME CURVE. Forge already
   knows what it asked for (the card), what was actually run (the log), and
   whether the two matched (sessionVerdict). The only new question is what a
   set of repeats is WORTH as a continuous performance, and that has an honest
   answer per kind of session — see CONTINUOUS_SHARE.

   AND IT IS SELF-LIMITING BY CONSTRUCTION, which is the part that makes this
   safe rather than a flattery machine. The pace on the card was computed FROM
   the curve. Hit it exactly and the equivalent effort lands at or just behind
   where the curve already sits, so nothing moves — hitting a session written
   for you proves only that the plan was right about you. Beat it, and the
   point clears the curve and pulls it up by about the margin you beat it by.
   Which is precisely the claim an athlete is entitled to make. */

/* WHAT A SET OF REPEATS IS WORTH AS ONE CONTINUOUS EFFORT.

   The share of the total fast running that may be credited as a race-equivalent
   distance at the pace actually run. These are not tuning knobs — each comes
   out of what the zone's pace IS:

     THRESHOLD is by definition about one-hour race pace, and cruise intervals
     break it with jogs of a minute or two. Twenty-four minutes of work in
     three pieces is very nearly twenty-four minutes of continuous running, so
     almost all of it counts. It also almost never moves anybody's curve, and
     should not: a tempo run is sub-maximal by design.

     INTERVAL pace is roughly 3K–5K race pace and a session totals roughly that
     distance, so the total work at the pace achieved is close to a race over
     it. This is the session that can genuinely move a projection, and the one
     most athletes have far more of than races.

     RACE PACE is continuous by construction, with one or two breaks.

     REPETITION work is short and fully recovered. Eight three-hundreds at mile
     pace does not mean you could race that far at mile pace, and crediting it
     as though it did is the obvious way to turn a speed session into a fake
     personal best. Under half, and in practice it almost never clears the
     minimum below. */
export const CONTINUOUS_SHARE: Record<PrescriptionKind, number> = {
  threshold: 0.95,
  intervals: 0.85,
  racepace: 0.9,
  reps: 0.4,
  /* A test IS a race. It is already in the log as a continuous effort, and
     counting it twice would let one good day vote twice. */
  test: 0,
};

/* ONLY A SESSION THAT WENT IN COUNTS. A faded, short or slow session is not
   evidence that the athlete is faster than the curve says — the progression
   level is what carries the downside, by making the next dose smaller. Letting
   a bad day drag the curve down as well would punish it twice, and would mean
   an athlete who trains through a hard week watches their race predictions
   fall for it. */
export const CREDITED: VerdictOutcome[] = ['on', 'faster'];

/* AND AN EQUIVALENT SHORTER THAN THIS IS NOT CREDITED AT ALL. Below about a
   mile the conversion to a common distance is dominated by the exponent rather
   than by the running: half a mile of fast repeats converts to a flattering
   mile whatever the athlete is actually worth. The floor is what keeps a
   speed session out of the race predictor. */
export const MIN_EVIDENCE_MILES = 1;

/* A SESSION RUN WILDLY FASTER THAN ASKED IS A MEASUREMENT PROBLEM, NOT A
   BREAKTHROUGH. Nobody beats a target pace built from their own log by a sixth
   — a watch that lost the track, a rep logged in the wrong unit, or a card
   parsed wrong will, and each of those would go straight into the curve as a
   personal best. */
export const IMPLAUSIBLE_GAIN = 0.15;

const METRES_PER_MILE = 1609.344;

/* The shape sessionVerdicts hands back, narrowed to what this needs — so the
   evidence rule stays in lib and does not reach into the plan feature. */
export type JudgedSessionRef = {
  date: string;
  outcome: VerdictOutcome;
  /* Seconds per mile actually run across the work. */
  actualPace: number;
  /* Repeats completed, and the card that was written. */
  completed: number;
  text: string;
};

/** One judged session as a dated effort on the fitness curve, or null when it
 *  is not the kind of evidence a race prediction may be built from. */
export function effortFromWorkout(session: JudgedSessionRef): Effort | null {
  if (!session || !CREDITED.includes(session.outcome)) return null;
  if (!(session.actualPace > 0) || !(session.completed > 0)) return null;
  const prescription = parsePrescription(session.text);
  if (!prescription) return null;
  const share = CONTINUOUS_SHARE[prescription.kind];
  if (!share) return null;
  if (session.actualPace < prescription.targetPace * (1 - IMPLAUSIBLE_GAIN)) return null;

  /* The total fast running that was actually done — repeats completed, not
     repeats asked for, so a session cut short is credited for what went in. */
  const workMiles = prescription.metres
    ? (session.completed * prescription.metres) / METRES_PER_MILE
    : prescription.minutes
      ? (session.completed * prescription.minutes * 60) / session.actualPace
      : 0;
  const miles = workMiles * share;
  if (!(miles >= MIN_EVIDENCE_MILES)) return null;
  return { date: session.date, miles: Math.round(miles * 100) / 100, seconds: Math.round(session.actualPace * miles) };
}

/** Every judged session in the block that counts as evidence. */
export function workoutEfforts(sessions: JudgedSessionRef[] | null | undefined): Effort[] {
  const out: Effort[] = [];
  for (const session of sessions || []) {
    const effort = effortFromWorkout(session);
    if (effort) out.push(effort);
  }
  return out;
}
