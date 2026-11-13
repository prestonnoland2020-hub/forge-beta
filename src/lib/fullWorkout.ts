import { canonicalLiftKey } from './liftAliases';

/* BUILD MY WORKOUT.

   Today's top sets are the point; this wraps them in a whole session for the
   athlete who wants one written: each top set gets two back-off sets under it,
   and every muscle the day trains gets an accessory with a rep range and a
   weight from the last time it was logged. Nothing here changes what counts:
   progression still reads the top sets. */

export type TopLine = { exercise: string; muscle: string; weight: number; reps: number };
export type LibraryLike = { name: string; kind: string; muscles: string[]; detail: string; enabled: boolean };
export type HistoryLike = { date: string; topSets?: Array<{ lift: string; weight: number; reps: number; completed?: boolean }> };

export type WorkoutBlock = {
  exercise: string;
  muscle: string;
  kind: 'top' | 'accessory';
  /* The top set (kind top) or the working weight (accessory); 0 = not known yet. */
  weight: number;
  reps: number;
  /* What the line says under the name: "2 × 7 @ 190 back-off", "3 × 10–12". */
  plan: string;
};

const MAX_ACCESSORIES = 4;
const plate = (weight: number, metric: boolean) => { const step = metric ? 2.5 : 5; return Math.round(weight / step) * step; };

/* A back-off set: 85% of the top set for two more reps, twice. The volume
   that builds the top set without asking for another one. */
export function backOff(weight: number, reps: number, metric: boolean) {
  return { sets: 2, reps: reps + 2, weight: weight > 0 ? plate(weight * 0.85, metric) : 0 };
}

const lastWeight = (records: HistoryLike[], name: string) => {
  const key = canonicalLiftKey(name);
  let best: { date: string; weight: number } | null = null;
  for (const record of records) for (const set of record.topSets || []) {
    if (set.completed === false || canonicalLiftKey(set.lift) !== key || !(Number(set.weight) > 0)) continue;
    if (!best || record.date > best.date) best = { date: record.date, weight: Number(set.weight) };
  }
  return best?.weight || 0;
};

export function buildFullWorkout(input: { topSets: TopLine[]; dayMuscles: string[]; library: LibraryLike[]; records: HistoryLike[]; metric: boolean; unit: string }): WorkoutBlock[] {
  const { topSets, library, records, metric, unit } = input;
  const used = new Set(topSets.map(set => canonicalLiftKey(set.exercise)));
  const blocks: WorkoutBlock[] = topSets.map(set => {
    /* A high-rep top set is already volume: two more of the same, not a
       lighter set of fourteen. */
    if ((set.reps || 5) >= 10) return { exercise: set.exercise, muscle: set.muscle, kind: 'top', weight: set.weight, reps: set.reps, plan: `Then 2 more sets of ${set.reps}` };
    const back = backOff(set.weight, set.reps || 5, metric);
    return { exercise: set.exercise, muscle: set.muscle, kind: 'top', weight: set.weight, reps: set.reps,
      plan: back.weight ? `Then ${back.sets} × ${back.reps} @ ${back.weight} ${unit}` : `Then ${back.sets} × ${back.reps} a little lighter` };
  });
  /* Every muscle the day names, plus the top sets' own, each gets one
     accessory — the ones the top sets do not lead come first. */
  const muscles = [...new Set([...input.dayMuscles, ...topSets.map(set => set.muscle)])].filter(muscle => muscle && muscle !== 'Cardio' && muscle !== 'Primary');
  const ledByTop = new Set(topSets.map(set => set.muscle));
  const order = [...muscles.filter(muscle => !ledByTop.has(muscle)), ...muscles.filter(muscle => ledByTop.has(muscle))];
  const strength = library.filter(item => item.enabled && item.kind === 'Strength' && !/hyrox|crossfit/i.test(item.detail));
  for (const muscle of order) {
    if (blocks.filter(block => block.kind === 'accessory').length >= MAX_ACCESSORIES) break;
    const leads = strength.filter(item => item.muscles[0] === muscle && !used.has(canonicalLiftKey(item.name)));
    /* An accessory movement before a second main lift, and one with history
       before one without, so the weight can be given. */
    const pick = [...leads].sort((a, b) => Number(/accessory/i.test(b.detail)) - Number(/accessory/i.test(a.detail)) || Number(lastWeight(records, b.name) > 0) - Number(lastWeight(records, a.name) > 0))[0];
    if (!pick) continue;
    used.add(canonicalLiftKey(pick.name));
    const weight = lastWeight(records, pick.name);
    const bodyweight = /bodyweight/i.test(pick.detail);
    blocks.push({ exercise: pick.name, muscle, kind: 'accessory', weight: bodyweight ? 0 : weight, reps: 10,
      plan: bodyweight ? '3 × 10–15' : weight ? `3 × 10–12 @ ${weight} ${unit}` : '3 × 10–12 · pick a weight you could do 14 times' });
  }
  return blocks;
}

/* The main thing today asks for, said once: the first goal lift on the day,
   or the first lift. */
export function todaysObjective(topSets: TopLine[], isGoalLift: (exercise: string) => boolean): TopLine | null {
  return topSets.find(set => isGoalLift(set.exercise)) || topSets[0] || null;
}

/* The warm-up to a top set, in plate steps. */
export function warmupRamp(weight: number, metric: boolean): number[] {
  if (!(weight > 0)) return [];
  const bar = metric ? 20 : 45;
  return [0.5, 0.7, 0.85].map(share => plate(weight * share, metric)).filter((value, index, list) => value > bar && value < weight && list.indexOf(value) === index);
}
