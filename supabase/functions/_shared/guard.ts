import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

/* THE GATE EVERY PAID-COMPUTE ENDPOINT PASSES THROUGH.

   forge-coach and forge-plan each call OpenAI with up to 30 kB of caller-
   supplied context at medium reasoning effort. Before this file, forge-coach
   had no limit of any kind and forge-plan's only cooldown read a table that no
   migration created, discarded the error, and compared against a timestamp the
   client itself wrote. Both were, in practice, a free LLM proxy for anyone who
   could complete a Google sign-in.

   The rules live in the database (see migration 0021), not here: the quota is
   consumed by a SECURITY DEFINER function that only the service role may call,
   so the count cannot be moved by the person being counted. This module is the
   thin, boring client for it. */

/* Browsers that are allowed to call these functions. The native shells matter:
   a Capacitor WKWebView sends `capacitor://localhost`, and older/Android
   builds send `http://localhost`. Omitting them would lock the iOS app out of
   its own backend. */
const ALLOWED_ORIGINS = [
  'https://prestonnoland2020-hub.github.io',
  'https://forge.training',
  'https://www.forge.training',
  'capacitor://localhost',
  'ionic://localhost',
  'http://localhost',
  'http://localhost:5173',
  'http://localhost:4173',
];

export function corsFor(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

/* The app's own URL, used for Stripe return links. Never the request's Origin
   header: that is attacker-controlled outside a browser, and reflecting it
   turns a genuine checkout.stripe.com session into an open redirect that hands
   the customer to whoever asked for the session. */
export function appOrigin(request: Request): string {
  const origin = request.headers.get('origin') || '';
  if (ALLOWED_ORIGINS.includes(origin) && origin.startsWith('http')) return origin;
  return Deno.env.get('PUBLIC_APP_URL') || ALLOWED_ORIGINS[0];
}

export type Caller = { id: string; email: string | null; userClient: SupabaseClient; admin: SupabaseClient };

export async function requireCaller(request: Request): Promise<Caller> {
  const authorization = request.headers.get('Authorization');
  if (!authorization) throw new HttpError(401, 'Sign in to use Forge AI.');
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) throw new HttpError(401, 'Sign in to use Forge AI.');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  return { id: data.user.id, email: data.user.email ?? null, userClient, admin };
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

export type Quota = { tier: string; usedToday?: number; dailyLimit?: number };

/* Consume one call. Throws 429 when the athlete is out, with a message that
   says which limit was hit and what upgrading changes -- a paywall the user
   can act on rather than a bare error. The founder account is exempt in the
   database, not here, so this code path is identical for everyone. */
export async function consumeQuota(caller: Caller, endpoint: string): Promise<Quota> {
  const { data, error } = await caller.admin.rpc('consume_ai_quota', {
    p_owner: caller.id,
    p_endpoint: endpoint,
  });
  /* Fail CLOSED. If the meter is unreachable we do not know what this account
     has already spent, and an endpoint that bills real money on every call is
     the wrong place to give the benefit of the doubt. */
  if (error) throw new HttpError(503, 'Forge AI is briefly unavailable. Try again in a moment.');
  const result = (data || {}) as Record<string, unknown>;
  if (!result.allowed) {
    const tier = String(result.tier || 'free');
    const window = result.reason === 'monthly' ? 'this month' : 'today';
    throw new HttpError(
      429,
      tier === 'free'
        ? `You have used all your free Forge AI ${window}. Forge Pro raises this substantially.`
        : `You have reached the Forge Pro fair-use limit ${window}. It resets ${result.reason === 'monthly' ? 'on the 1st' : 'at midnight UTC'}.`,
      { tier, reason: result.reason, upgrade: tier === 'free' },
    );
  }
  return { tier: String(result.tier || 'free'), usedToday: Number(result.usedToday) || undefined, dailyLimit: result.dailyLimit as number | undefined };
}

/* A call that never produced an answer should not cost the athlete one. */
export async function refundQuota(caller: Caller, endpoint: string): Promise<void> {
  try {
    await caller.admin.rpc('refund_ai_quota', { p_owner: caller.id, p_endpoint: endpoint });
  } catch {
    /* A failed refund is an accounting rounding error in the athlete's favour
       to leave alone; it must never mask the original failure. */
  }
}

export function errorResponse(error: unknown, cors: Record<string, string>): Response {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message, ...error.extra }, { status: error.status, headers: cors });
  }
  /* Upstream detail -- Postgres messages, provider bodies -- stays in the
     logs. The caller gets something true and unrevealing. */
  console.error('forge-function-error', error instanceof Error ? error.message : String(error));
  return Response.json({ error: 'That request could not be completed.' }, { status: 400, headers: cors });
}
