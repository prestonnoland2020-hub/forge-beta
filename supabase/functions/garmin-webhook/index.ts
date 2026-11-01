import { createClient } from 'npm:@supabase/supabase-js@2';
import { HEALTH_KINDS, activityRow, freshAccessToken, healthRows, rpc, type GarminConnection } from '../_shared/garmin.ts';

/* WHERE GARMIN'S DATA ARRIVES. Garmin POSTs summaries here as athletes sync
   their watches — no Forge session, so no JWT (deploy with verify_jwt off).
   Garmin signs nothing, so two checks stand in for a signature: the URL
   carries a secret key registered in the Garmin portal, and every summary
   must name a Garmin userId that a Forge athlete actually connected.

   Both of Garmin's delivery modes are handled. In push mode the summaries
   are in the body; in ping mode each entry carries a callbackURL to fetch
   them from with that athlete's token.

   Garmin retries anything that is not a 200, so one bad summary must not
   fail the batch: errors are logged and the batch still answers 200. */

type Summary = Record<string, unknown>;

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('ok');
  const key = Deno.env.get('GARMIN_WEBHOOK_KEY');
  if (!key || new URL(request.url).searchParams.get('key') !== key) return new Response('forbidden', { status: 403 });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const call = rpc(admin);
  const owners = new Map<string, GarminConnection>();
  const ownerFor = async (userId: string) => {
    if (!owners.has(userId)) owners.set(userId, await call<GarminConnection>('garmin_connection_for_user', { p_garmin_user: userId }).catch(() => null));
    return owners.get(userId) || null;
  };

  let payload: Record<string, unknown>;
  try { payload = await request.json(); } catch { return new Response('ok'); }

  for (const [kind, value] of Object.entries(payload)) {
    if (!Array.isArray(value)) continue;
    try {
      if (kind === 'deregistrations') {
        for (const item of value as Summary[]) if (item.userId) await call('garmin_connection_deregister', { p_garmin_user: String(item.userId) });
        continue;
      }
      if (kind !== 'activities' && !HEALTH_KINDS.includes(kind)) continue;

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
          } else summaries.push(entry);
        }
        if (!summaries.length) continue;
        if (kind === 'activities') {
          const rows = summaries.map(item => activityRow(owner.owner_id, item));
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
  return new Response('ok');
});
