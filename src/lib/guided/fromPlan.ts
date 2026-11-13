import { MOVES, MOVE, type Move } from './catalog';
import type { Step, Workout } from './builder';
import { canonicalLiftKey } from '../liftAliases';

/* COACH ME THROUGH TODAY'S PLAN.

   The same coach and flashcards, but the workout is the one Forge already
   planned: each planned lift becomes one card for its top set, with the
   warm-up ramp said out loud before it. Weights and reps are the plan's, not
   Guided's guesses, and the result is logged under the plan's lift names so
   progression reads it like any other session.

   A lift that is in the Guided move list keeps its photos and cues; one that
   is not (a barbell bench press, a machine Forge knows but Guided does not)
   gets a card with the muscle map in place of photos. */

export type PlanLift = { exercise: string; muscle: string; weight: number; reps: number; sets?: number; accessory?: boolean };
export const FROM_PLAN_KEY = 'forge-guided-fromplan-v1';

/* Forge's muscle names to the body map's. */
const MAP: Record<string, string[]> = {
  Chest: ['chest'], Back: ['upper-back'], Lats: ['upper-back'], Shoulders: ['front-deltoids', 'back-deltoids'], Biceps: ['biceps'], Triceps: ['triceps'],
  Quads: ['quadriceps'], Hamstrings: ['hamstring'], Glutes: ['gluteal'], Calves: ['calves'], Abs: ['abs'], Core: ['abs', 'obliques'], Forearms: ['forearm'], Traps: ['trapezius'],
};

const plate = (weight: number, metric: boolean) => { const step = metric ? 2.5 : 5; return Math.max(step, Math.round(weight / step) * step); };

function moveFor(lift: PlanLift, metric: boolean): Move {
  const key = canonicalLiftKey(lift.exercise);
  const known = MOVES.find(move => canonicalLiftKey(move.name) === key);
  const unit = metric ? 'kilos' : 'pounds';
  const ramp = lift.accessory
    ? `${lift.sets || 3} sets of ${lift.reps}${lift.weight > 0 ? ` at ${lift.weight} ${unit}` : ''}. About a minute between sets.`
    : lift.weight > 0
    ? `Warm up first: ${plate(lift.weight * 0.5, metric)} for 8, then ${plate(lift.weight * 0.75, metric)} for 3. Then your top set: ${lift.weight} ${unit} for ${lift.reps}.`
    : `Work up to a weight you could do for ${lift.reps} with two reps left in the tank. That one set is your top set.`;
  if (known) return { ...known, name: lift.exercise, cue: ramp };
  return {
    id: `plan-${key}`, name: lift.exercise, photo: '', pattern: 'push', equip: ['none'], load: lift.weight > 0 ? 'barbell' : 'none', styles: [],
    map: { primary: MAP[lift.muscle] || ['abs'], secondary: [] }, muscles: [lift.muscle || 'Full body'],
    cue: ramp,
    steps: ['Warm up with a couple of lighter sets, fewer reps each time.', 'Load your top-set weight and take a breath.', `Do ${lift.reps} clean reps, then rack it.`],
    feel: `Your ${(lift.muscle || 'target muscles').toLowerCase()}.`,
    mistake: 'Skipping the warm-up. Build up to the top set.',
  };
}

export function planWorkout(title: string, lifts: PlanLift[], metric: boolean): Workout {
  const steps: Step[] = [];
  const warm = MOVE('worlds-greatest') || MOVE('hip-circles');
  if (warm) steps.push({ move: warm, sets: 1, reps: 60, weight: null, rest: 10, part: 'warmup' });
  for (const raw of lifts) {
    /* A first-time lift arrives with no reps yet; Today says "work up to 5". */
    const lift = { ...raw, reps: raw.reps > 0 ? raw.reps : 5 };
    const move = moveFor(lift, metric);
    /* No number yet: start from the empty bar and let her set what she lifted
       with − and +, so the set is logged with a real weight. */
    const bare = metric ? 20 : 45;
    /* An accessory from Build my workout: its working sets, shorter rest. */
    steps.push({ move, sets: raw.sets || 1, reps: lift.reps, weight: lift.weight > 0 ? lift.weight : (move.load === 'none' ? null : bare), weightNote: lift.weight > 0 ? undefined : 'Set the weight you actually lift with − and +.', rest: raw.accessory ? 75 : 120, part: 'main' });
  }
  return { title, focus: 'Full body', minutes: Math.max(10, lifts.reduce((sum, lift) => sum + (lift.accessory ? 5 : 7), 0)), steps };
}
