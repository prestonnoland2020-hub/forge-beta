import { z } from 'zod';
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

export async function saveProfile(input: ProfileInput) {
  const parsed = profileInputSchema.parse(input);
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw authError ?? new Error('Not signed in.');

  const { error } = await supabase.from('profiles').update({
    username: parsed.username,
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
  }).eq('id', authData.user.id);
  if (error) throw error;
}

export async function getMyProfile() {
  const { data, error } = await supabase.from('profiles').select('*').single();
  if (error) throw error;
  return data;
}
