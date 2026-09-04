import { z } from 'zod';
import { isDemoMode } from '../../lib/env';
import { supabase } from '../../lib/supabase';

export const profileInputSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/),
  displayName: z.string().trim().min(1).max(60),
  birthDate: z.string().date().nullable(),
  heightCm: z.number().min(90).max(250).nullable(),
  startingWeight: z.number().positive().max(1500).nullable(),
  currentWeight: z.number().positive().max(1500).nullable(),
  unitSystem: z.enum(['imperial', 'metric']),
  experienceLevel: z.enum(['beginner', 'intermediate', 'advanced', 'competitive']),
  primaryGoal: z.enum(['strength', 'muscle', 'endurance', 'general_fitness', 'weight_change']),
  equipment: z.array(z.string().trim().min(1)).max(50),
  preferredTrainingDays: z.array(z.number().int().min(0).max(6)).max(7),
});

export type ProfileInput = z.infer<typeof profileInputSchema>;

/* THE SECOND JOHN SMITH. `profiles.username` is unique, and onboarding derives
   it silently from the Google display name — there is no username field
   anywhere in setup. So the second person named John Smith to sign up hit a raw
   Postgres unique-violation on the "Enter Forge" button, on a screen with
   nothing to edit and no retry that could ever succeed. Their account was dead
   at the door, and the error they saw was
   `duplicate key value violates unique constraint "profiles_username_key"`.

   Treat the collision as information rather than a failure and try again with a
   suffix. Six candidates, ending in one that is unique by construction. */
const UNIQUE_VIOLATION = '23505';

function usernameCandidates(base: string, userId: string): string[] {
  const idChars = userId.replace(/[^a-z0-9]/g, '');
  const root = base.replace(/[^a-z0-9_]/g, '').slice(0, 18);
  /* A display name with no ASCII letters at all — 李明, or an emoji — leaves
     nothing to build on, so fall back to the account id. */
  const stem = root.length >= 3 ? root : `athlete${idChars.slice(0, 6)}`;
  return [
    stem,
    `${stem.slice(0, 16)}${Math.floor(Math.random() * 90) + 10}`,
    `${stem.slice(0, 15)}${Math.floor(Math.random() * 900) + 100}`,
    `${stem.slice(0, 14)}${Math.floor(Math.random() * 9000) + 1000}`,
    `${stem.slice(0, 12)}${idChars.slice(0, 6)}`,
    `athlete${idChars.slice(0, 12)}`,
  ];
}

export async function saveProfile(input: ProfileInput): Promise<string> {
  const parsed = profileInputSchema.parse(input);
  /* Preview builds have no Supabase session, so asking for one here failed
     onboarding with "Auth session missing!" and trapped a new athlete on the
     setup screen. The local profile is still written by the caller. */
  if (isDemoMode) return parsed.username;
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw authError ?? new Error('Not signed in.');
  const userId = authData.user.id;

  const row = {
    display_name: parsed.displayName,
    birth_date: parsed.birthDate,
    height_cm: parsed.heightCm,
    starting_weight: parsed.startingWeight,
    current_weight: parsed.currentWeight,
    unit_system: parsed.unitSystem,
    experience_level: parsed.experienceLevel,
    primary_goal: parsed.primaryGoal,
    equipment: parsed.equipment,
    preferred_training_days: parsed.preferredTrainingDays,
    onboarding_completed: true,
  };

  let lastError: unknown = null;
  for (const username of usernameCandidates(parsed.username, userId)) {
    /* upsert, not update. `update` against a row that does not exist reports
       success while changing nothing — so on any account where the new-user
       trigger did not fire, onboarding appeared to finish, the gate then read
       `onboarding_completed: false` forever, and every attempt discarded the
       local setup on the way past. */
    const { error } = await supabase.from('profiles')
      .upsert({ id: userId, username, ...row }, { onConflict: 'id' });
    if (!error) return username;
    if ((error as { code?: string }).code !== UNIQUE_VIOLATION) throw error;
    lastError = error;
  }
  throw lastError ?? new Error('Could not reserve a username. Try a different display name.');
}

export async function getMyProfile() {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error('Not signed in.');
  /* maybeSingle, not single: `single` throws PGRST116 on an account whose
     profile row is missing, turning a recoverable state into a crash on every
     screen that reads the profile. */
  const { data, error } = await supabase.from('profiles').select('*').eq('id', authData.user.id).maybeSingle();
  if (error) throw error;
  return data;
}

/* App Store Review Guideline 5.1.1(v): an app that supports account creation
   must let the account be deleted from inside the app. Everything cascades
   from auth.users; the database function does the work. */
export async function deleteMyAccount(): Promise<void> {
  if (isDemoMode) return;
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
  /* The account is gone; nothing cached for it may outlive it on this device. */
  try { Object.keys(localStorage).filter(key => key.startsWith('forge-') && !key.startsWith('forge-appearance')).forEach(key => localStorage.removeItem(key)); } catch { /* ignore */ }
  await supabase.auth.signOut();
}
