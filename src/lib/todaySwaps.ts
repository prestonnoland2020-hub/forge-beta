import { canonicalLiftKey } from './liftAliases';

/* SWAP AN EXERCISE FOR TODAY ONLY.

   The bench is taken, the shoulder is off: trade the lift for another that
   works the same muscle, for this session. The split is untouched, so next
   week asks for the original again. Kept per day on this device; Today and
   the logger both read it, so the swap carries into the session. */

const key = (date: string) => `forge-today-swaps-${date}`;

export type Swaps = Record<string, string>;

export function readSwaps(date: string): Swaps {
  try { const parsed = JSON.parse(localStorage.getItem(key(date)) || '{}'); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; }
}

export function writeSwap(date: string, from: string, to: string | null): Swaps {
  const swaps = readSwaps(date);
  const id = canonicalLiftKey(from);
  if (!to || canonicalLiftKey(to) === id) delete swaps[id]; else swaps[id] = to;
  try { localStorage.setItem(key(date), JSON.stringify(swaps)); } catch { /* per-device convenience */ }
  return swaps;
}

export const swappedName = (swaps: Swaps, exercise: string) => swaps[canonicalLiftKey(exercise)] || null;

/* The last top set logged on a lift, to load the swap with a real number. */
export function lastSet(records: Array<{ date: string; topSets?: Array<{ lift: string; weight: number; reps: number; completed?: boolean }> }>, name: string) {
  const id = canonicalLiftKey(name);
  let best: { date: string; weight: number; reps: number } | null = null;
  for (const record of records) for (const set of record.topSets || []) {
    if (set.completed === false || canonicalLiftKey(set.lift) !== id || !(Number(set.weight) > 0)) continue;
    if (!best || record.date > best.date) best = { date: record.date, weight: Number(set.weight), reps: Number(set.reps) || 0 };
  }
  return best;
}

/* What can stand in: same leading muscle, a strength move, not already on
   the day. Ones with history first, so the swap comes with a weight. */
export function swapOptions<T extends { name: string; kind: string; muscles: string[]; detail: string; enabled: boolean }>(library: T[], muscle: string, onDay: string[], hasHistory: (name: string) => boolean, limit = 8): T[] {
  const taken = new Set(onDay.map(canonicalLiftKey));
  return library
    .filter(item => item.enabled && item.kind === 'Strength' && !/hyrox|crossfit/i.test(item.detail) && item.muscles[0] === muscle && !taken.has(canonicalLiftKey(item.name)))
    .sort((a, b) => Number(hasHistory(b.name)) - Number(hasHistory(a.name)) || a.name.localeCompare(b.name))
    .slice(0, limit);
}
