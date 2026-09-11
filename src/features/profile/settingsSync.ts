import { supabase } from '../../lib/supabase';
import { isDemoMode } from '../../lib/env';

/* athlete_settings is the reinstall-proof copy of everything the app used to
   keep only in localStorage: the full athlete setup, the split editor state
   (weekdays, durations, cardio policies, mileage bounds), and the UI package.
   localStorage stays the fast local cache; this table is what a fresh device
   hydrates from. */

export type AthleteSettingsRow = { setup?: unknown; plan?: unknown; appearance?: unknown; goals?: unknown };

export async function loadAthleteSettings(): Promise<AthleteSettingsRow | null> {
  if (isDemoMode) return null;
  try {
    const { data } = await supabase.from('athlete_settings').select('setup,plan,appearance,goals').maybeSingle();
    return (data as AthleteSettingsRow | null) || null;
  } catch { return null; }
}

/* FIRE AND FORGET IS NOT THE SAME AS SWALLOW. This must never block or break
   the interaction that triggered it — that part was right — but it also never
   looked at whether the write landed, and neither did anything else. An athlete
   whose split and profile stopped reaching their account saw no difference at
   all until they signed in on another phone and found an older self there.

   The failure is announced through a listener rather than a hook because this
   is a plain module the whole app calls; the provider registers a listener at
   mount and the banner is drawn from there. */
type SettingsSyncListener = (message: string | null) => void;
let announce: SettingsSyncListener = () => undefined;
export const reportSettingsSyncTo = (listener: SettingsSyncListener) => { announce = listener; return () => { announce = () => undefined; }; };

export function saveAthleteSettings(patch: AthleteSettingsRow): void {
  if (isDemoMode || !Object.keys(patch).length) return;
  void (async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { error } = await supabase.from('athlete_settings').upsert({ owner_id: userData.user.id, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'owner_id' });
      announce(error ? error.message : null);
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : 'Your profile settings could not be saved.');
    }
  })();
}
