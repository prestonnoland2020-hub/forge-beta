import { canonicalLiftKey } from './liftAliases';
import { calculateEstimatedOneRepMax } from './strength';

/* HOW THE TOP SET FELT. Weight and reps alone cannot tell 230 x 2 with three
   in the tank from 230 x 2 that barely moved, so the estimate ran low for
   anyone stopping short of failure — the very thing Forge asks for. One tap
   after the set: easy (about 2 reps left), good (about 1), grinder (none).
   Kept per set on this device. */

export type Effort = 'easy' | 'good' | 'hard';
const STORE = 'forge-set-effort-v1';
export const REPS_LEFT: Record<Effort, number> = { easy: 2, good: 1, hard: 0 };

const id = (date: string, lift: string) => `${date}|${canonicalLiftKey(lift)}`;
function read(): Record<string, Effort> {
  try { const parsed = JSON.parse(globalThis.localStorage?.getItem(STORE) || '{}'); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; }
}

function remember(date: string, lift: string, effort: Effort) {
  try { const all = read(); all[id(date, lift)] = effort; globalThis.localStorage?.setItem(STORE, JSON.stringify(all)); } catch { /* per-device */ }
}

/* Kept on the device for an instant answer and saved to the account, so a new
   phone keeps them. The account copy is best-effort: a failed save leaves the
   device copy standing. */
export function setEffort(date: string, lift: string, effort: Effort) {
  remember(date, lift, effort);
  void import('./supabase').then(({ supabase }) => supabase?.from('set_efforts').upsert({ performed_on: date, lift_key: canonicalLiftKey(lift), effort, updated_at: new Date().toISOString() }, { onConflict: 'owner_id,performed_on,lift_key' })).catch(() => undefined);
}

/* The account's copy, merged into the device's when history loads. */
export async function pullEfforts(): Promise<void> {
  try {
    const { supabase } = await import('./supabase');
    if (!supabase) return;
    const { data } = await supabase.from('set_efforts').select('performed_on,lift_key,effort');
    const all = read();
    for (const row of (data || []) as Array<{ performed_on: string; lift_key: string; effort: Effort }>) all[`${row.performed_on}|${row.lift_key}`] = row.effort;
    globalThis.localStorage?.setItem(STORE, JSON.stringify(all));
  } catch { /* offline: the device copy stands */ }
}

export function effortOf(date: string | undefined, lift: string | undefined): Effort | undefined {
  if (!date || !lift) return undefined;
  return read()[id(date, lift)];
}

/* The max a set shows, counting the reps that were left in it. A set with no
   effort tapped counts as before: as if taken to failure. */
export function estimateWithEffort(weight: number, reps: number, effort?: Effort): number {
  return calculateEstimatedOneRepMax(weight, reps + (effort ? REPS_LEFT[effort] : 0)) || 0;
}

/* The effort on the newest logged set of a lift. */
export function lastEffort(records: Array<{ date: string; topSets?: Array<{ lift: string; completed?: boolean }> }>, lift: string): Effort | undefined {
  const key = canonicalLiftKey(lift);
  const dates = records.filter(record => (record.topSets || []).some(set => set.completed !== false && canonicalLiftKey(set.lift) === key)).map(record => record.date).sort();
  const latest = dates[dates.length - 1];
  return latest ? effortOf(latest, lift) : undefined;
}
