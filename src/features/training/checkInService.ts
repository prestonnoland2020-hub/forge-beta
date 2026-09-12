import { supabase } from '../../lib/supabase';
import { isDemoMode } from '../../lib/env';
import { localDayIso } from '../../lib/time';
import type { CheckIn, CheckInScale } from '../../lib/readiness';

/* Local-first with best-effort Supabase sync — the same posture the workout
   log and the health notes take. A check-in answered on a gym floor with no
   signal is still an answer, and the plan should act on it immediately rather
   than waiting for a round trip. */

const storageKey = 'forge-check-ins-v1';
/* Enough history for the struggling streak and a month of context for the
   coach; there is no reason to carry years of it in the browser. */
const KEEP_DAYS = 90;

const scale = (value: unknown): CheckInScale => {
  const number = Math.round(Number(value));
  return (Number.isFinite(number) ? Math.max(1, Math.min(5, number)) : 3) as CheckInScale;
};

export const loadLocalCheckIns = (): CheckIn[] => {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(value) ? (value as CheckIn[]).filter(item => item && typeof item.date === 'string') : [];
  } catch { return []; }
};

const prune = (checkIns: CheckIn[]): CheckIn[] => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
  const floor = cutoff.toISOString().slice(0, 10);
  /* One answer per day: a correction replaces, it does not accumulate. */
  const byDate = new Map<string, CheckIn>();
  [...checkIns].sort((a, b) => a.date.localeCompare(b.date)).forEach(item => { if (item.date >= floor) byDate.set(item.date, item); });
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
};

const saveLocal = (checkIns: CheckIn[]) => {
  try { localStorage.setItem(storageKey, JSON.stringify(prune(checkIns))); } catch { /* private mode, full disk */ }
};

const rowToCheckIn = (row: Record<string, unknown>): CheckIn => ({
  date: String(row.check_in_date || localDayIso()),
  legs: scale(row.legs),
  energy: scale(row.energy),
  sleep: scale(row.sleep),
  note: row.note ? String(row.note) : undefined,
  aboutRecordId: row.about_record_id ? String(row.about_record_id) : undefined,
  prompt: row.prompt ? String(row.prompt) : undefined,
});

export async function loadCheckIns(): Promise<CheckIn[]> {
  const local = loadLocalCheckIns();
  if (isDemoMode) return local;
  try {
    const { data, error } = await supabase
      .from('athlete_check_ins').select('*')
      .order('check_in_date', { ascending: false }).limit(KEEP_DAYS);
    if (error || !data) return local;
    /* The server is the record, but an answer that has not reached it yet is
       not thrown away — merged by date, the newer of the two wins. */
    const merged = prune([...data.map(rowToCheckIn), ...local]);
    saveLocal(merged);
    return merged;
  } catch { return local; }
}

export async function saveCheckIn(checkIn: CheckIn): Promise<void> {
  saveLocal([checkIn, ...loadLocalCheckIns()]);
  if (isDemoMode) return;
  try {
    const { data: session } = await supabase.auth.getUser();
    const owner = session?.user?.id;
    if (!owner) return;
    await supabase.from('athlete_check_ins').upsert({
      owner_id: owner,
      check_in_date: checkIn.date,
      legs: checkIn.legs,
      energy: checkIn.energy,
      sleep: checkIn.sleep,
      note: checkIn.note || null,
      about_record_id: checkIn.aboutRecordId || null,
      prompt: checkIn.prompt || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'owner_id,check_in_date' });
  } catch { /* the local answer already counts */ }
}
