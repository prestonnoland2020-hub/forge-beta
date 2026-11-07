import type { LoggedTopSet, WorkoutRecord } from '../features/training/WorkoutHistoryProvider';
import { calculateEstimatedOneRepMax } from './strength';
import { sameLift } from './liftAliases';

/* A TOP SET THAT BEATS EVERYTHING BEFORE IT SHOULD SAY SO.

   Two kinds of record, and they are not worth the same:
     oneRepMax     — a real single heavier than any single before it. The bar
                     actually went up; this is the big one.
     calculatedMax — the set's estimated max beats every estimate before it.
                     Real progress, but a number on a curve, so it is
                     acknowledged rather than thrown a party.

   A lift with no history sets no record: the first time anything is logged it
   is a baseline, and celebrating every first set would make the celebration
   mean nothing. The set being judged is left out of the comparison, so the
   same answer comes back whether it is asked before the save or after. Sets
   logged on later dates are ignored, so an old day keeps its record. */
export type RecordKind = 'oneRepMax' | 'calculatedMax';
export type RecordResult = { kind: RecordKind; value: number; previous: number | null };

type Entry = { date: string; weight: number; reps: number };

const entriesFor = (records: WorkoutRecord[], lift: string): Entry[] => records.flatMap(record =>
  record.topSets?.length
    ? record.topSets.filter(set => set.completed !== false && sameLift(set.lift, lift) && set.weight > 0 && set.reps > 0).map(set => ({ date: record.date, weight: Number(set.weight), reps: Number(set.reps) }))
    : (record.lift && sameLift(record.lift, lift) && record.weight && record.reps ? [{ date: record.date, weight: Number(record.weight), reps: Number(record.reps) }] : []));

/* `saved`: the set is already in `records` and must not be compared with
   itself. At the moment of saving it is not there yet — and an identical set
   logged earlier the same day is then a real prior result, not this one. */
export function topSetRecord(records: WorkoutRecord[], set: Pick<LoggedTopSet, 'lift' | 'weight' | 'reps'>, date: string, saved = true): RecordResult | null {
  if (!set.lift || !(set.weight > 0) || !(set.reps > 0)) return null;
  const all = entriesFor(records, set.lift).filter(entry => entry.date <= date);
  /* Drop this set itself (once) if it is already saved. */
  const selfIndex = !saved ? -1 : all.findIndex(entry => entry.date === date && entry.weight === set.weight && entry.reps === set.reps);
  const prior = selfIndex >= 0 ? all.filter((_, index) => index !== selfIndex) : all;
  if (!prior.length) return null;

  if (set.reps === 1) {
    const singles = prior.filter(entry => entry.reps === 1);
    const bestSingle = singles.length ? Math.max(...singles.map(entry => entry.weight)) : null;
    if (bestSingle === null || set.weight > bestSingle) return { kind: 'oneRepMax', value: set.weight, previous: bestSingle };
  }

  const max = calculateEstimatedOneRepMax(set.weight, set.reps) || 0;
  const bestMax = Math.max(...prior.map(entry => calculateEstimatedOneRepMax(entry.weight, entry.reps) || 0));
  if (max > bestMax) return { kind: 'calculatedMax', value: max, previous: bestMax || null };
  return null;
}
