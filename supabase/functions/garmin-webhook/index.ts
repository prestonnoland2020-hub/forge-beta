import { createClient } from 'npm:@supabase/supabase-js@2';
import { ACTIVITY_KINDS, HEALTH_KINDS, activityRow, freshAccessToken, healthRows, isMultisportParent, rpc, type GarminConnection } from '../_shared/garmin.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

/* WHERE GARMIN'S DATA ARRIVES. Garmin POSTs summaries here as athletes sync
   their watches — no Forge session, so no JWT (deploy with verify_jwt off).
   Garmin signs nothing, so two checks stand in for a signature: the URL
   carries a secret key registered in the Garmin portal, and every summary
   must name a Garmin userId that a Forge athlete actually connected.

   Both of Garmin's delivery modes are handled. In push mode the summaries
   are in the body; in ping mode each entry carries a callbackURL to fetch
   them from with that athlete's token.

   ANSWER FIRST, WORK AFTER. Garmin times a notification out at thirty
   seconds and requires the 200 before any processing (Activity API §4, §8);
   a ping-mode batch that fetched callbacks inline could run past that, and
   Garmin would resend it hourly for a week. The body is read, the 200 goes
   back, and the work runs in EdgeRuntime.waitUntil. One bad summary type is
   logged and skipped rather than sinking the rest. */

type Summary = Record<string, unknown>;

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('ok');
  /* WHO MAY DELIVER. Garmin names the client it is delivering for in a
     garmin-client-id header; a delivery for another app's client is never
     ours. Otherwise either proof will do: the secret key in the URL, or that
     header matching this app's client id. The key alone was the rule, and
     Garmin's first real deliveries arrived without it — 403, and Garmin
     queues a refused delivery for a week of hourly retries. Nothing is
     stored for a Garmin user who has not connected to Forge either way. */
  const key = Deno.env.get('GARMIN_WEBHOOK_KEY');
  const clientId = Deno.env.get('GARMIN_CLIENT_ID');
  const clientHeader = request.headers.get('garmin-client-id');
  if (clientHeader && clientHeader !== clientId) return new Response('forbidden', { status: 403 });
  const keyed = Boolean(key) && new URL(request.url).searchParams.get('key') === key;
  const fromGarmin = Boolean(clientId) && clientHeader === clientId;
  if (!keyed && !fromGarmin) return new Response('forbidden', { status: 403 });

  let payload: Record<string, unknown>;
  try { payload = await request.json(); } catch { return new Response('ok'); }
  EdgeRuntime.waitUntil(process(payload));
  return new Response('ok');
});

async function process(payload: Record<string, unknown>) {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const call = rpc(admin);
  const owners = new Map<string, GarminConnection>();
  const ownerFor = async (userId: string) => {
    if (!owners.has(userId)) owners.set(userId, await call<GarminConnection>('garmin_connection_for_user', { p_garmin_user: userId }).catch(() => null));
    return owners.get(userId) || null;
  };

  /* WHAT ARRIVED, ONE LINE PER DELIVERY. Activities and daily summaries were
     landing while sleep and HRV never did, and nothing recorded which types
     Garmin was actually sending — so "is sleep switched on in the Garmin
     portal" could only be guessed at. Counts only; no athlete data. */
  console.log(`garmin-webhook received ${Object.entries(payload).map(([kind, value]) => `${kind}:${Array.isArray(value) ? value.length : '?'}`).join(' ') || 'nothing'}`);

  for (const [kind, value] of Object.entries(payload)) {
    if (!Array.isArray(value)) continue;
    try {
      if (kind === 'deregistrations') {
        for (const item of value as Summary[]) if (item.userId) await call('garmin_connection_deregister', { p_garmin_user: String(item.userId) });
        continue;
      }
      const isActivity = ACTIVITY_KINDS.includes(kind);
      if (!isActivity && !HEALTH_KINDS.includes(kind)) { console.log(`garmin-webhook ignored kind ${kind}`); continue; }

      /* Group by athlete: one upsert per athlete per summary type. */
      const byUser = new Map<string, Summary[]>();
      for (const item of value as Summary[]) {
        const userId = String(item.userId || '');
        if (!userId) continue;
        byUser.set(userId, [...(byUser.get(userId) || []), item]);
      }
      for (const [userId, entries] of byUser) {
        const owner = await ownerFor(userId);
        if (!owner) continue;
        const summaries: Summary[] = [];
        for (const entry of entries) {
          if (typeof entry.callbackURL === 'string') {
            /* Ping mode: only fetch from Garmin's own API host. */
            const callback = new URL(entry.callbackURL);
            if (callback.hostname !== 'apis.garmin.com') continue;
            const token = await freshAccessToken(call, owner);
            const response = await fetch(callback, { headers: { Authorization: `Bearer ${token}` } });
            if (response.ok) { const pulled = await response.json(); if (Array.isArray(pulled)) summaries.push(...pulled); }
            /* A refused callback dropped the summary without a word. */
            else console.error(`garmin-webhook ${kind} callback ${response.status}: ${(await response.text()).slice(0, 200)}`);
          } else summaries.push(entry);
        }
        if (!summaries.length) continue;
        if (isActivity) {
          const rows = summaries.filter(item => !isMultisportParent(item)).map(item => activityRow(owner.owner_id, item));
          for (let start = 0; start < rows.length; start += 200) {
            const { error } = await admin.from('external_activities').upsert(rows.slice(start, start + 200), { onConflict: 'owner_id,provider,external_id' });
            if (error) throw new Error(error.message);
          }
        } else {
          const rows = healthRows(kind, owner.owner_id, summaries);
          if (rows.length) {
            const { error } = await admin.from('health_daily_snapshots').upsert(rows, { onConflict: 'owner_id,snapshot_date,provider' });
            if (error) throw new Error(error.message);
          }
        }
      }
    } catch (error) {
      console.error(`garmin-webhook ${kind}:`, error instanceof Error ? error.message : error);
    }
  }
}
