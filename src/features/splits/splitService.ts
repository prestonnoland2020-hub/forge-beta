import { isDemoMode } from '../../lib/env';
import { supabase } from '../../lib/supabase';

export type SplitDayInput = {
  position: number;
  name: string;
  muscleGroups: string[];
  goalLifts: string[];
  cardioTypes: string[];
};

export async function saveTrainingSplit(name: string, days: SplitDayInput[]) {
  /* Preview builds have no Supabase session; the split still saves locally. */
  if (isDemoMode) return null;
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw authError ?? new Error('Not signed in.');

  const { data, error } = await supabase.rpc('replace_my_training_split', {
    split_name: name.trim(),
    split_days: days,
  });
  if (error) throw error;
  return data;
}

export async function getActiveTrainingSplit() {
  const { data, error } = await supabase
    .from('training_splits')
    .select('*, training_split_days(*)')
    .eq('is_active', true)
    .single();
  if (error) throw error;
  return data;
}
