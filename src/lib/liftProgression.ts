import { WAVE_REPS, WAVE_LENGTH, ACCESSORY_REPS, ACCESSORY_LENGTH, FAILURES_BEFORE_BACKOFF, answeredThePlan } from '../features/training/aiPlanService';
import { canonicalLiftKey } from './liftAliases';

/* WHERE A LIFT IS, AND WHAT MOVES IT.

   Forge worked this out by counting how many times a lift had been logged. So
   anything counted: Preston's plan asked for a double, he took 320 x 6, and the
   wave wrapped from his max week back to the 8-rep week. Good work, and it cost
   him his place in the block.

   Position is not a rep count and it is not a session count. It is how many
   times the athlete has answered what the plan asked. Every logged set now
   carries the prescription it was answering, so that is a question the history
   can be asked rather than guessed at:

     - Did what was asked (within a rep) → the exposure counts, the rung moves.
     - Came up short of it              → a miss; the rung holds, and three of
                                          them drops the load to what was last
                                          completed there.
     - Did something else entirely      → off script. Evidence, not schedule:
                                          the loads rise from it and the rung
                                          does not move.
     - No prescription on the set       → free training, or a set logged before
                                          any of this existed. Counted as an
                                          exposure, so old history is not
                                          reinterpreted underneath the athlete.

   AND A PLAN THE ATHLETE IS NOT FOLLOWING IS A PLAN THAT IS WRONG. Holding the
   rung forever would leave someone who does sixes when asked for doubles stuck
   on the double for good, with Forge never admitting the mismatch. After three
   off-script sessions on a lift the rung is re-seated to the work actually
   being done, and the block carries on from there. The plan bends to the
   athlete rather than the athlete being marked wrong.

   All of it is derived. There is no stored cursor to drift between devices, and
   changing any of this arithmetic improves every athlete's next session without
   a rebuild or a migration. */

export const OFF_SCRIPT_BEFORE_RESEAT = 3;
/* The rule for "did they do it" lives beside the wave, in aiPlanService, and is
   re-exported here so a caller reading progression has it to hand. */
export { REP_TOLERANCE, answeredThePlan } from '../features/training/aiPlanService';

export type ProgressionSet = {
  date: string;
  reps: number;
  weight: number;
  completed?: boolean;
  prescribedReps?: number | null;
  prescribedWeight?: number | null;
};

export type LiftPosition = {
  /* How many prescriptions this lift has answered. The rung is this modulo the
     cycle length, so a projection is just addition. */
  exposures: number;
  /* Consecutive sessions that answered something other than what was asked. */
  offScript: number;
  /* Consecutive sessions that came up short at the rung the lift is on. */
  misses: number;
  /* Set when the rung was re-seated to the work actually being done. */
  reseated: boolean;
  /* The last prescription this lift was given, whether or not it was answered. */
  lastAsked?: { reps: number; weight: number };
};

const EMPTY: LiftPosition = { exposures: 0, offScript: 0, misses: 0, reseated: false };

const repsOfCycle = (accessory: boolean) => (accessory ? ACCESSORY_REPS : WAVE_REPS);
const lengthOfCycle = (accessory: boolean) => (accessory ? ACCESSORY_LENGTH : WAVE_LENGTH);

/* The rung whose rep target is nearest the work being done — how a re-seat
   decides where the athlete actually is. Ties go to the harder rung, because
   assuming someone is stronger than they showed is the error that hurts. */
export function rungNearest(reps: number, accessory: boolean): number {
  const cycle = repsOfCycle(accessory);
  let best = 0;
  let gap = Infinity;
  cycle.forEach((target, index) => {
    const distance = Math.abs(target - reps);
    if (distance < gap) { gap = distance; best = index; }
  });
  return best;
}

/* ONE WALK THROUGH ONE LIFT'S HISTORY, oldest first, so every counter means
   "since the last thing that reset it" rather than "ever". */
export function liftPosition(sets: ProgressionSet[], accessory: boolean): LiftPosition {
  const ordered = [...sets].filter(set => set.completed !== false || set.prescribedReps)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!ordered.length) return EMPTY;
  const length = lengthOfCycle(accessory);
  let exposures = 0;
  let offScript = 0;
  let misses = 0;
  let reseated = false;
  let lastAsked: LiftPosition['lastAsked'];

  ordered.forEach(set => {
    if (set.prescribedReps) lastAsked = { reps: set.prescribedReps, weight: set.prescribedWeight || 0 };
    /* A set the athlete marked failed is a miss at the rung they were on. It
       does not advance anything; three of them is what the back-off reads. */
    if (set.completed === false) { misses += 1; return; }
    if (!set.prescribedReps) { exposures += 1; offScript = 0; misses = 0; return; }
    const asked = set.prescribedReps;
    if (answeredThePlan(asked, set.reps)) { exposures += 1; offScript = 0; misses = 0; return; }
    /* A double asked and a single taken is a miss. A double asked and eight
       taken is a different session. */
    if (set.reps < asked) { misses += 1; return; }
    offScript += 1;
    if (offScript >= OFF_SCRIPT_BEFORE_RESEAT) {
      /* Re-seat to where the athlete has actually been working, and continue
         from there rather than from where the block thought they were. */
      const target = rungNearest(set.reps, accessory);
      exposures += ((target - (exposures % length)) % length + length) % length;
      offScript = 0;
      misses = 0;
      reseated = true;
    }
  });
  return { exposures, offScript, misses, reseated, lastAsked };
}

/* WHAT TO ASK FOR NEXT, as a rung index the wave and accessory cycles both
   understand. `ahead` projects forward: a future week is drawn as though the
   sessions between here and there were completed, which is what makes the plan
   a projection and not a promise. */
export const rungFor = (position: LiftPosition, ahead = 0) => position.exposures + Math.max(0, ahead);

/* Every lift's position in one pass, keyed canonically so "Squat" and "Back
   Squat" are one lift. */
export function liftPositions(
  records: Array<{ date: string; topSets?: Array<{ lift?: string; weight?: number; reps?: number; completed?: boolean; prescribedReps?: number | null; prescribedWeight?: number | null }> }>,
  isAccessory: (lift: string) => boolean,
): Map<string, LiftPosition> {
  const byLift = new Map<string, ProgressionSet[]>();
  records.forEach(record => (record.topSets || []).forEach(set => {
    if (!set.lift || !set.reps) return;
    const key = canonicalLiftKey(set.lift);
    byLift.set(key, [...(byLift.get(key) || []), {
      date: record.date, reps: set.reps, weight: set.weight || 0, completed: set.completed,
      prescribedReps: set.prescribedReps, prescribedWeight: set.prescribedWeight,
    }]);
  }));
  return new Map([...byLift].map(([key, sets]) => [key, liftPosition(sets, isAccessory(key))] as const));
}

/* The back-off's miss count is built by bestsFromHistory, keyed by the reps
   that were ASKED for. This is the reader for it, so a caller does not have to
   remember the threshold. */
export const backedOffAt = (misses: Map<number, number> | undefined, reps: number) =>
  (misses?.get(reps) || 0) >= FAILURES_BEFORE_BACKOFF;
