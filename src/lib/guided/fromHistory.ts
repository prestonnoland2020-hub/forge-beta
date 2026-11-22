import { MOVES } from './catalog';
import { canonicalLiftKey } from '../liftAliases';
import { effortOf, estimateWithEffort } from '../setEffort';
import { nextWeight } from './builder';

/* ONE ANSWER FOR ONE LIFT. A coach-picked or build-my-own workout used to
   load a move from the last guided session alone, nudged by easy and hard,
   while My plan loaded the same lift from the top-set wave. Now a move with
   top sets on file starts where those top sets say: the latest estimate,
   brought down to a working set of about ten. Only a move with no top sets
   falls back to the guided memory. */
export function weightsFromTopSets(records: Array<{ date: string; topSets?: Array<{ lift: string; weight: number; reps: number; completed?: boolean }> }>, metric: boolean): Record<string, number> {
  const latest = new Map<string, { date: string; max: number; weight: number; reps: number; easy: boolean; good: boolean }>();
  for (const record of records) for (const set of record.topSets || []) {
    if (set.completed === false || !(Number(set.weight) > 0) || !(Number(set.reps) > 0)) continue;
    const key = canonicalLiftKey(set.lift);
    const effort = effortOf(record.date, set.lift);
    const max = estimateWithEffort(Number(set.weight), Number(set.reps), effort);
    const seen = latest.get(key);
    if (!seen || record.date > seen.date || (record.date === seen.date && max > seen.max)) latest.set(key, { date: record.date, max, weight: Number(set.weight), reps: Number(set.reps), easy: effort === 'easy', good: effort === 'good' });
  }
  const step = metric ? 2.5 : 5;
  const out: Record<string, number> = {};
  for (const move of MOVES) {
    if (move.load === 'none') continue;
    const found = latest.get(canonicalLiftKey(move.name));
    if (!found) continue;
    let weight = Math.max(step, Math.round(found.max * 0.75 / step) * step);
    /* EASY MEANS HEAVIER. A working set of about ten that felt easy (15 lb x
       10, Too easy) estimated straight back to 15 lb, so the done screen's
       "it starts heavier next time" was not true. A set of eight or more is
       the same kind of set Guided gives: easy starts one step up, just right
       starts where it was. Heavy low-rep top sets still go through the
       estimate. */
    if (found.reps >= 8 && found.easy) weight = Math.max(weight, nextWeight(found.weight, 'easy', move.load, metric) ?? weight);
    else if (found.reps >= 8 && found.good) weight = Math.max(weight, found.weight);
    out[move.id] = weight;
  }
  return out;
}

/* WHAT THE DONE SCREEN PROMISES. For each logged top set, the weight the next
   guided workout will actually start that lift at: the same
   weightsFromTopSets the builder reads, run over today's top sets. Only lifts
   whose number differs from the top set just lifted are returned. */
export type NextTime = { moveId: string; name: string; weight: number; was: number };
export function nextTimeWeights(top: Array<{ moveId: string; name: string; weight: number | null; reps: number }>, date: string, metric: boolean): NextTime[] {
  const sets = top.filter(item => item.weight !== null && item.weight > 0);
  const next = weightsFromTopSets([{ date, topSets: sets.map(item => ({ lift: item.name, weight: item.weight as number, reps: item.reps, completed: true })) }], metric);
  return sets.flatMap(item => next[item.moveId] !== undefined && next[item.moveId] !== item.weight ? [{ moveId: item.moveId, name: item.name, weight: next[item.moveId], was: item.weight as number }] : []);
}
