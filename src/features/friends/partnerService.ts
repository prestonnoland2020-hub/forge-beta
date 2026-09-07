import { supabase } from '../../lib/supabase';
import { isDemoMode } from '../../lib/env';

/* TRAINING PARTNERS. Up to five people, mutual, and no feed — see the
   migration for why. Everything that crosses between two athletes is a
   number: where they are in their block, whether they have trained today,
   and the one heaviest set if they have. */

export type Partner = {
  friendId: string;
  username: string;
  displayName: string;
  blockWeek: number | null;
  blockWeeks: number | null;
  waveSlot: number | null;
  trainedToday: boolean;
  lastTrained: string | null;
  topLift: string | null;
  topWeight: number | null;
  topReps: number | null;
  cardioSummary: string | null;
};
export type PartnerRequest = { friendshipId: string; requesterId: string; username: string; displayName: string };
export type AddResult = 'requested' | 'accepted' | 'already' | 'full' | 'self' | 'not_found' | 'blocked';

type FeedRow = {
  friend_id: string; username: string; display_name: string;
  block_week: number | null; block_weeks: number | null; wave_slot: number | null;
  trained_today: boolean; last_trained: string | null;
  top_lift: string | null; top_weight: number | string | null; top_reps: number | null;
  cardio_summary: string | null;
};

export async function loadPartners(): Promise<Partner[]> {
  if (isDemoMode) return [];
  const { data, error } = await supabase.rpc('forge_partner_feed');
  if (error) throw error;
  return ((data || []) as FeedRow[]).map(row => ({
    friendId: row.friend_id,
    username: row.username,
    displayName: row.display_name || row.username,
    blockWeek: row.block_week,
    blockWeeks: row.block_weeks,
    waveSlot: row.wave_slot,
    trainedToday: Boolean(row.trained_today),
    lastTrained: row.last_trained,
    topLift: row.top_lift,
    topWeight: row.top_weight === null ? null : Number(row.top_weight),
    topReps: row.top_reps,
    cardioSummary: row.cardio_summary,
  }));
}

export async function loadPartnerRequests(): Promise<PartnerRequest[]> {
  if (isDemoMode) return [];
  const { data, error } = await supabase.rpc('forge_partner_requests');
  if (error) throw error;
  return ((data || []) as Array<{ friendship_id: string; requester_id: string; username: string; display_name: string }>)
    .map(row => ({ friendshipId: row.friendship_id, requesterId: row.requester_id, username: row.username, displayName: row.display_name || row.username }));
}

/* Adding is mutual by construction: asking someone who already asked you
   accepts, rather than stacking a second request. */
export async function addPartner(username: string): Promise<AddResult> {
  const { data, error } = await supabase.rpc('forge_partner_add', { partner_username: username });
  if (error) throw error;
  return String(data) as AddResult;
}

export async function acceptPartner(username: string): Promise<AddResult> {
  return addPartner(username);
}

export async function declinePartner(friendshipId: string): Promise<void> {
  const { error } = await supabase.from('friendships')
    .update({ status: 'declined', responded_at: new Date().toISOString() })
    .eq('id', friendshipId);
  if (error) throw error;
}

export async function removePartner(friendId: string): Promise<void> {
  const { error } = await supabase.rpc('forge_partner_remove', { partner_id: friendId });
  if (error) throw error;
}

/* An invite is a link to the partner screen carrying the sender's username,
   which is the whole of the growth loop: send it, they sign up, they are
   already connected to someone. */
export function inviteLink(username: string): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#/partners?add=${encodeURIComponent(username)}`;
}

/* SEARCH, NOT SPELLING. Adding someone used to require their username typed
   exactly; nobody knows their gym partner as "coltoneilers". The search reads
   name and username together and tolerates a missed letter, and it says what
   the relationship already is so the screen never offers to add the same
   person twice. */
export type AthleteResult = { id: string; username: string; displayName: string; relation: 'none' | 'requested' | 'waiting' | 'partner' };

export async function searchAthletes(query: string): Promise<AthleteResult[]> {
  if (isDemoMode || query.trim().length < 2) return [];
  const { data, error } = await supabase.rpc('forge_search_athletes', { query });
  if (error) throw error;
  return ((data || []) as Array<{ id: string; username: string; display_name: string; relation: string }>)
    .map(row => ({ id: row.id, username: row.username, displayName: row.display_name || row.username, relation: row.relation as AthleteResult['relation'] }));
}

export async function addPartnerById(id: string): Promise<AddResult> {
  const { data, error } = await supabase.rpc('forge_partner_add_id', { partner_id: id });
  if (error) throw error;
  return String(data) as AddResult;
}

/* Whether other athletes can find you by name. An exact username always
   works — that is the handle you hand out — so this governs browsing, not
   invitations. */
export async function setDiscoverable(value: boolean): Promise<void> {
  const { error } = await supabase.rpc('forge_set_discoverable', { p_value: value });
  if (error) throw error;
}
export async function loadDiscoverable(): Promise<boolean> {
  if (isDemoMode) return true;
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return true;
  const { data } = await supabase.from('profiles').select('discoverable').eq('id', userData.user.id).maybeSingle();
  return data?.discoverable !== false;
}

const inviteKey = 'forge-partner-invite';
export const pendingInvite = (): string => { try { return localStorage.getItem(inviteKey) || ''; } catch { return ''; } };
export const clearPendingInvite = () => { try { localStorage.removeItem(inviteKey); } catch { /* ignore */ } };

/* WHAT THEY DID, AT A GLANCE. A partner line is read in passing, so it
   carries the top set and the distance — not the pace, the split and the
   duration, which run off the end of a phone. */
export function didToday(partner: Partner, unit: string): string {
  const lift = partner.topLift && partner.topWeight ? `${partner.topLift} ${partner.topWeight} ${unit} × ${partner.topReps}` : '';
  const cardio = (partner.cardioSummary || '').split(' · ').filter(Boolean);
  const distance = cardio.length > 1 ? cardio[1] : cardio[0] || '';
  return [lift, distance].filter(Boolean).join(' · ') || 'Trained today';
}

/* How long ago, in the words someone would say out loud. */
export function lastTrainedLabel(iso: string | null): string {
  if (!iso) return 'No training logged yet';
  const day = new Date(`${iso}T12:00:00`);
  const days = Math.round((Date.now() - day.getTime()) / 86400000);
  if (days <= 0) return 'Trained today';
  if (days === 1) return 'Trained yesterday';
  if (days < 7) return `Trained ${days} days ago`;
  if (days < 14) return 'Trained last week';
  return `Last trained ${day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}
