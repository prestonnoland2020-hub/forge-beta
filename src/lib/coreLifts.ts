import { canonicalLiftKey } from './liftAliases';

/* THE FOUR LIFTS EVERY PROGRAM IS ACTUALLY BUILT ON.

   The exercise library holds thirty-seven movements and the goal picker
   offered all of them, alphabetically, to somebody who had been using the app
   for ninety seconds. "Assault Bike" and "Burpee Broad Jumps" are above
   "Deadlift" in that list. A first-time athlete does not need a menu, they
   need the four lifts that a strength program is measured by — and everything
   else, at that moment, is noise.

   So the first goal is chosen from these, and everywhere else they come first
   rather than instead: an athlete six months in who wants a goal on their
   overhead press still has the whole library, one line further down.

   PULL UPS ARE HERE AND THEY ARE MEASURED TWO WAYS. Most people's pull-up
   goal is a rep count at their own body weight; a strong lifter's is a weight
   hanging off a belt. Both are real goals and they are different units, so the
   goal builder asks which rather than assuming — see WEIGHTED_BODYWEIGHT. */
export const CORE_LIFTS = ['Bench Press', 'Deadlift', 'Back Squat', 'Pull Ups'] as const;

/* What the athlete calls them, which is not always what the library row is
   named — nobody's first goal is "a Back Squat". The key is the library name;
   the label is what goes on screen. */
export const CORE_LIFT_LABELS: Record<string, string> = {
  'Bench Press': 'Bench',
  'Deadlift': 'Deadlift',
  'Back Squat': 'Squat',
  'Pull Ups': 'Pull Ups',
};

/* Lifts whose goal can be a rep count at body weight OR a load added to it.
   A pull-up goal of "12" and a pull-up goal of "45 lb" are both sensible and
   mean completely different things, and a picker that silently chose one of
   them would be wrong for half the people who use it. */
export const WEIGHTED_BODYWEIGHT = new Set(['pull ups', 'chin ups', 'dips', 'push ups']);
export const isWeightedBodyweight = (name: string | undefined | null) =>
  WEIGHTED_BODYWEIGHT.has(canonicalLiftKey(String(name || '')));

const CORE_KEYS = CORE_LIFTS.map(name => canonicalLiftKey(name));
export const isCoreLift = (name: string | undefined | null) =>
  CORE_KEYS.includes(canonicalLiftKey(String(name || '')));

/* The core four first, in the order above — bench, deadlift, squat, pull ups,
   which is the order people say them in — and then everything else exactly as
   it arrived. Sorting the remainder is the caller's business; this only moves
   the four to the front. */
export function coreFirst(names: string[]): string[] {
  const core: string[] = [];
  for (const key of CORE_KEYS) {
    const found = names.find(name => canonicalLiftKey(name) === key);
    if (found) core.push(found);
  }
  return [...core, ...names.filter(name => !core.includes(name))];
}

/* Just the four, for the one screen where the rest is noise: a first goal.
   Matched against the athlete's own library rather than hardcoded, so a name
   that is not in their library is not offered and cannot create a goal that
   no logged set will ever match. */
export const coreOnly = (names: string[]) =>
  CORE_KEYS.map(key => names.find(name => canonicalLiftKey(name) === key)).filter((name): name is string => Boolean(name));
