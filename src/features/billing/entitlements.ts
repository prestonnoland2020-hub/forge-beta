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
  /* The 7-day Pro trial. onTrial is true only while the trial is the reason
     the account is Pro (a paid plan wins). trialUsed stays true forever. */
  onTrial?: boolean;
  trialEndsAt?: string | null;
  trialUsed?: boolean;
};

/* Shown only when the entitlement lookup itself fails. The real numbers live
   in ai_quota_limits and are what the server enforces; these mirror the free
   row so a failed lookup shows something plausible rather than nothing. */
export const FREE_FALLBACK: Entitlements = {
  tier: 'free',
  endpoints: {
    'forge-coach': { dailyLimit: 3, monthlyLimit: 30, usedToday: 0, usedThisMonth: 0 },
    'forge-plan': { dailyLimit: 1, monthlyLimit: 2, usedToday: 0, usedThisMonth: 0 },
  },
};

export const UNLIMITED: Entitlements = { tier: 'founder', endpoints: {} };

export async function fetchEntitlements(): Promise<Entitlements> {
  /* DEMO ONLY: preview the free or trial experience without an account.
     localStorage 'forge-demo-tier' = 'free' | 'trial'. Never read outside demo. */
  if (isDemoMode) {
    let demoTier = '';
    try { demoTier = localStorage.getItem('forge-demo-tier') || ''; } catch { /* unavailable */ }
    if (demoTier === 'free') return { ...FREE_FALLBACK, trialUsed: true };
    if (demoTier === 'trial') return { tier: 'pro', endpoints: {}, onTrial: true, trialUsed: true, trialEndsAt: new Date(Date.now() + 5 * 86400000).toISOString() };
    return UNLIMITED;
  }
  const { data, error } = await supabase.rpc('my_entitlements');
  if (error || !data) return FREE_FALLBACK;
  const payload = data as { tier?: string; endpoints?: Record<string, EndpointUsage>; onTrial?: boolean; trialEndsAt?: string | null; trialUsed?: boolean };
  const tier = payload.tier === 'pro' || payload.tier === 'founder' ? payload.tier : 'free';
  return { tier, endpoints: payload.endpoints || {}, onTrial: Boolean(payload.onTrial), trialEndsAt: payload.trialEndsAt || null, trialUsed: Boolean(payload.trialUsed) };
}

/* Starts the one 7-day Pro trial an account gets. The server decides: it
   refuses before setup is finished, after a trial was used, and for anyone
   who has ever paid. Safe to call repeatedly. */
export async function startTrial(): Promise<boolean> {
  if (isDemoMode) return false;
  const { data, error } = await supabase.rpc('start_my_trial');
  if (error || !data) return false;
  return Boolean((data as { started?: boolean }).started);
}

export function trialDaysLeft(entitlements: Entitlements): number | null {
  if (!entitlements.onTrial || !entitlements.trialEndsAt) return null;
  return Math.max(0, Math.ceil((new Date(entitlements.trialEndsAt).getTime() - Date.now()) / 86400000));
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

/* What Pro is, in the athlete's terms. Free shows the problem; Pro fixes it. */
export const PRO_FEATURES = [
  'Ask the coach anything — up to 60 questions a day, not 3',
  'The coach changes your plan for you, one tap to apply',
  'Your full week planned: lifting and running together',
  'Race and HYROX plans with paces from your own runs',
  'The fix for every goal that is behind, not just the verdict',
  'Rebuild your program whenever your goals or split change',
];

/* The headline benefits, for the upgrade sheet. */
export const PRO_PITCH = [
  'A real coach for about $10 a month — not $150–200',
  'One coach for lifting and running',
  'Answers built from your own numbers, in seconds',
];

/* Coach actions that change the plan itself. Free athletes see what the
   coach would change; Pro applies it. Day-of and safety actions (rest today,
   swap or shorten today, log or clear an injury, illness or fatigue note) are
   NEVER on this list. */
export const PRO_ACTION_TYPES = ['set_weekly_mileage', 'set_running_days', 'set_load_bias', 'update_goal', 'create_exercise', 'create_workout'] as const;

/* Logging is free forever. This list exists so the paywall says what is NOT
   behind it — an athlete who never pays still keeps every workout they
   recorded and every screen that reads them. */
export const ALWAYS_FREE = [
  'Every workout, top set and cardio session you log',
  'Today’s top set, and whether each goal is on track',
  '3 coach questions a day',
  'Rest days and adjustments for pain, injury, illness and pregnancy',
  'Your full history, progress charts and personal records',
  'The split builder and your training calendar',
  'Goals, projections and Strava sync',
];
