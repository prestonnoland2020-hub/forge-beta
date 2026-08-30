import { supabase } from '../../lib/supabase';
import { isDemoMode } from '../../lib/env';

/* WHAT AN ACCOUNT IS ALLOWED TO DO.

   The answer comes from the database and only from the database. There is no
   `pro` flag in localStorage, nothing the client can set, and no code path
   where a value the browser holds decides whether an expensive call is made —
   the edge functions consume quota server-side before they spend anything, so
   this module's only job is to TELL THE ATHLETE the truth, never to enforce
   it. A tampered client sees a wrong number on a settings screen and gets a
   429 from the server exactly like everyone else. */

export type EndpointUsage = {
  dailyLimit: number | null;
  monthlyLimit: number | null;
  usedToday: number;
  usedThisMonth: number;
};

export type Entitlements = {
  tier: 'free' | 'pro' | 'founder';
  endpoints: Record<string, EndpointUsage>;
};

export const FREE_FALLBACK: Entitlements = {
  tier: 'free',
  endpoints: {
    'forge-coach': { dailyLimit: 5, monthlyLimit: 60, usedToday: 0, usedThisMonth: 0 },
    'forge-plan': { dailyLimit: 1, monthlyLimit: 4, usedToday: 0, usedThisMonth: 0 },
  },
};

export const UNLIMITED: Entitlements = { tier: 'founder', endpoints: {} };

export async function fetchEntitlements(): Promise<Entitlements> {
  if (isDemoMode) return UNLIMITED;
  const { data, error } = await supabase.rpc('my_entitlements');
  if (error || !data) return FREE_FALLBACK;
  const payload = data as { tier?: string; endpoints?: Record<string, EndpointUsage> };
  const tier = payload.tier === 'pro' || payload.tier === 'founder' ? payload.tier : 'free';
  return { tier, endpoints: payload.endpoints || {} };
}

export type SubscriptionRow = {
  plan: string;
  status: string;
  source: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  apple_product_id: string | null;
};

export async function fetchSubscription(): Promise<SubscriptionRow | null> {
  if (isDemoMode) return null;
  const { data } = await supabase
    .from('subscriptions')
    .select('plan,status,source,current_period_end,cancel_at_period_end,apple_product_id')
    .maybeSingle();
  return (data as SubscriptionRow | null) || null;
}

/* Presentation helpers. `null` limits mean unmetered — the founder account —
   and must never render as "0 left". */
export function remaining(usage?: EndpointUsage): number | null {
  if (!usage || usage.dailyLimit === null) return null;
  const byDay = usage.dailyLimit - usage.usedToday;
  const byMonth = usage.monthlyLimit === null ? byDay : usage.monthlyLimit - usage.usedThisMonth;
  return Math.max(0, Math.min(byDay, byMonth));
}

export const PRO_FEATURES = [
  'Forge Coach answers up to 60 questions a day, not 5',
  'Rebuild your training block whenever your split or goals change',
  'Long-range roadmap kept current against every session you log',
  'Priority on new coaching features as they ship',
];

/* Logging is free forever. This list exists so the paywall says what is NOT
   behind it — an athlete who never pays still keeps every workout they
   recorded and every screen that reads them. */
export const ALWAYS_FREE = [
  'Every workout, top set and cardio session you log',
  'Your full history, progress charts and personal records',
  'The split builder and your training calendar',
  'Goals, projections and Strava sync',
];
