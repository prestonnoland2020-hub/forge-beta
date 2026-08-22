import { supabase } from '../../lib/supabase';

export async function searchProfiles(username: string) {
  const query = username.trim().toLowerCase();
  if (query.length < 3) return [];
  const { data, error } = await supabase.rpc('search_public_profiles', {
    username_query: query,
  });
  if (error) throw error;
  return data;
}

export async function sendFriendRequest(addresseeId: string) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw authError ?? new Error('Not signed in.');

  const { error } = await supabase.from('friendships').insert({
    requester_id: authData.user.id,
    addressee_id: addresseeId,
  });
  if (error) throw error;
}

export async function respondToFriendRequest(friendshipId: string, accept: boolean) {
  const { error } = await supabase
    .from('friendships')
    .update({ status: accept ? 'accepted' : 'declined', responded_at: new Date().toISOString() })
    .eq('id', friendshipId);
  if (error) throw error;
}

export async function updateComparisonPermissions(friendshipId: string, metrics: string[]) {
  const { error } = await supabase
    .from('friendships')
    .update({ shared_metrics: metrics })
    .eq('id', friendshipId);
  if (error) throw error;
}
