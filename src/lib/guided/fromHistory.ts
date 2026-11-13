import { MOVES } from './catalog';
import { canonicalLiftKey } from '../liftAliases';
import { effortOf, estimateWithEffort } from '../setEffort';

/* ONE ANSWER FOR ONE LIFT. A coach-picked or build-my-own workout used to
   load a move from the last guided session alone, nudged by easy and hard,
   while My plan loaded the same lift from the top-set wave. Now a move with
   top sets on file starts where those top sets say: the latest estimate,
   brought down to a working set of about ten. Only a move with no top sets
   falls back to the guided memory. */
export function weightsFromTopSets(records: Array<{ date: string; topSets?: Array<{ lift: string; weight: number; reps: number; completed?: boolean }> }>, metric: boolean): Record<string, number> {
  const latest = new Map<string, { date: string; max: number }>();
  for (const record of records) for (const set of record.topSets || []) {
    if (set.completed === false || !(Number(set.weight) > 0) || !(Number(set.reps) > 0)) continue;
    const key = canonicalLiftKey(set.lift);
    const max = estimateWithEffort(Number(set.weight), Number(set.reps), effortOf(record.date, set.lift));
    const seen = latest.get(key);
    if (!seen || record.date > seen.date || (record.date === seen.date && max > seen.max)) latest.set(key, { date: record.date, max });
  }
  const step = metric ? 2.5 : 5;
  const out: Record<string, number> = {};
  for (const move of MOVES) {
    if (move.load === 'none') continue;
    const found = latest.get(canonicalLiftKey(move.name));
    if (!found) continue;
    out[move.id] = Math.max(step, Math.round(found.max * 0.75 / step) * step);
  }
  return out;
}
