import { supabase } from '../../lib/supabase';
import { isDemoMode } from '../../lib/env';

/* athlete_settings is the reinstall-proof copy of everything the app used to
   keep only in localStorage: the full athlete setup, the split editor state
   (weekdays, durations, cardio policies, mileage bounds), and the UI package.
   localStorage stays the fast local cache; this table is what a fresh device
   hydrates from. */

export type AthleteSettingsRow = { setup?: unknown; plan?: unknown; appearance?: unknown };

export async function loadAthleteSettings(): Promise<AthleteSettingsRow | null> {
  if (isDemoMode) return null;
  try {
    const { data } = await supabase.from('athlete_settings').select('setup,plan,appearance').maybeSingle();
    return (data as AthleteSettingsRow | null) || null;
  } catch { return null; }
}

/* Partial upsert: only the supplied columns change. Fire-and-forget — settings
   sync must never block or break the interaction that triggered it. */
export function saveAthleteSettings(patch: AthleteSettingsRow): void {
  if (isDemoMode || !Object.keys(patch).length) return;
  void (async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      await supabase.from('athlete_settings').upsert({ owner_id: userData.user.id, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'owner_id' });
    } catch { /* best-effort */ }
  })();
}
