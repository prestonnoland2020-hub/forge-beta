import { createClient } from 'npm:@supabase/supabase-js@2';
import { backfillKinds, BACKFILL_MAX_DAYS, GARMIN_API, HISTORY_YEARS, GARMIN_AUTHORIZE, exchangeToken, freshAccessToken, garminCredentials, pkcePair, rpc, type GarminConnection } from '../_shared/garmin.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });

/* Garmin delivers data by push, not by reply. "Sync" here asks Garmin to
   re-send a window of history (a backfill), which arrives at garmin-webhook
   over the next minutes; what the athlete sees is what has already landed.

   Returns whether the activities request was taken. Health kinds are asked
   for alongside and may be refused (403/412) when the program or the athlete
   has not granted them; that must not read as a failed sync. */
/* WHY A BACKFILL WAS REFUSED, IN THE ATHLETE'S TERMS. 412/403 is not Garmin
   being busy: Garmin answered "Access denied … required
   HISTORICAL_DATA_EXPORT" — past data needs a permission this program does
   not hold yet. 429 is the rate limit. Telling those apart is the difference
   between "try again in a minute" and "this cannot work until Garmin grants
   it". */
type Refusal = 'permission' | 'rate-limit' | 'other';
const refusalOf = (status: number): Refusal => status === 412 || status === 403 ? 'permission' : status === 429 ? 'rate-limit' : 'other';

async function requestBackfill(accessToken: string, days: number): Promise<{ requested: boolean; refused?: Refusal }> {
  const end = Math.floor(Date.now() / 1000);
  const start = end - Math.min(days, BACKFILL_MAX_DAYS) * 86400;
  const results = await Promise.all(backfillKinds().map(async kind => {
    const response = await fetch(`${GARMIN_API}/backfill/${kind}?summaryStartTimeInSeconds=${start}&summaryEndTimeInSeconds=${end}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    /* 409: that window was already requested. It is coming; not a failure. */
    const ok = response.ok || response.status === 409;
    if (!ok) console.warn(`garmin backfill ${kind}: ${response.status} ${(await response.text()).slice(0, 200)}`);
    return { kind, ok, status: response.status };
  }));
  const activities = results.find(result => result.kind === 'activities');
  return activities?.ok ? { requested: true } : { requested: false, refused: refusalOf(activities?.status || 0) };
}

/* EVERY ACTIVITY THE ATHLETE EVER RECORDED, WITHOUT TRIPPING THE LIMIT.

   Garmin backfills at most a month per request, so a whole history is a walk
   backwards a month at a time. The first version fired the whole walk at once
   — about 120 requests in a few seconds — into a limit of 100 a minute for the
   whole app, and every request after the hundredth, including the athlete's
   own last-30-days backfill, came back 429 with nothing delivered.

   So the walk is paced (one request every 1.3 s, under half the limit, leaving
   room for everyone else) and time-boxed: each run spends at most 45 seconds,
   records how far back it reached, and the next sync — or the next time Forge
   opens — carries on from there. A 429 stops the run where it is; nothing is
   lost, it resumes later.

   The progress lives in garmin_connections.history_requested_at, read as "the
   furthest-back day already requested". Null is "not started"; at or before
   the ten-year floor is "done". Activities only — sleep and HRV from years ago
   do not change today's readiness. */
const DAY = 86400;
const PACE_MS = 1300;
const RUN_BUDGET_MS = 45_000;
const historyFloor = () => Math.floor(Date.now() / 1000) - HISTORY_YEARS * 365 * DAY;
const historyDone = (requestedAt?: string | null) => Boolean(requestedAt) && new Date(requestedAt!).getTime() / 1000 <= historyFloor() + DAY;
/* "Garmin will not send past data to this program yet" — stored in the same
   column as a date no walk can reach, so it needs no schema of its own. Each
   sync tries once more (one request) in case the permission has arrived. */
const HISTORY_BLOCKED = '2100-01-01T00:00:00.000Z';
const historyBlocked = (requestedAt?: string | null) => requestedAt === HISTORY_BLOCKED;

async function walkHistory(accessToken: string, from: string | null | undefined, save: (reachedIso: string) => Promise<unknown>): Promise<void> {
  const floor = historyFloor();
  let end = from && !historyBlocked(from) ? Math.floor(new Date(from).getTime() / 1000) : Math.floor(Date.now() / 1000) - BACKFILL_MAX_DAYS * DAY;
  const started = Date.now();
  while (end > floor + DAY && Date.now() - started < RUN_BUDGET_MS) {
    const start = Math.max(floor, end - BACKFILL_MAX_DAYS * DAY);
    const response = await fetch(`${GARMIN_API}/backfill/activities?summaryStartTimeInSeconds=${start}&summaryEndTimeInSeconds=${end}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (response.status === 429) break;
    /* No permission for past data: not the end of the history, and not
       progress either. Marked as blocked, so the whole walk runs from the
       start once the permission is granted. */
    if (refusalOf(response.status) === 'permission') {
      console.warn(`garmin history needs permission: ${response.status} ${(await response.text()).slice(0, 200)}`);
      await save(HISTORY_BLOCKED);
      return;
    }
    if (!response.ok && response.status !== 409) {
      /* Garmin refuses a window older than it keeps: the history is complete. */
      console.warn(`garmin history ends at ${new Date(end * 1000).toISOString().slice(0, 10)}: ${response.status} ${(await response.text()).slice(0, 200)}`);
      end = floor;
      break;
    }
    end = start;
    await new Promise(resolve => setTimeout(resolve, PACE_MS));
  }
  await save(new Date(end * 1000).toISOString());
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) throw new Error('Sign in to connect Garmin.');
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
    const { data: auth, error: authError } = await userClient.auth.getUser();
    if (authError || !auth.user) throw new Error('Sign in to connect Garmin.');
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const call = rpc(admin);
    const body = await request.json();
    const action = String(body.action || 'status');
    const { clientId, configured } = garminCredentials();
    const readConnection = () => call<GarminConnection>('garmin_connection_get', { p_owner: auth.user.id });

    if (action === 'status') {
      const row = await readConnection();
      const [{ count: activities }, { count: days }] = await Promise.all([
        admin.from('external_activities').select('*', { count: 'exact', head: true }).eq('owner_id', auth.user.id).eq('provider', 'garmin'),
        admin.from('health_daily_snapshots').select('*', { count: 'exact', head: true }).eq('owner_id', auth.user.id).eq('provider', 'garmin'),
      ]);
      return json({ configured, connected: row?.status === 'active', lastSyncedAt: row?.last_push_at || row?.last_synced_at, importedActivities: activities || 0, healthDays: days || 0, historyComplete: historyDone(row?.history_requested_at), historyBlocked: historyBlocked(row?.history_requested_at) });
    }
    if (!configured) throw new Error('Garmin setup is not finished yet. Add GARMIN_CLIENT_ID and GARMIN_CLIENT_SECRET to the Supabase function secrets.');

    if (action === 'authorize') {
      const redirectUri = String(body.redirectUri || '');
      if (!/^https?:\/\/(localhost(:\d+)?|prestonnoland2020-hub\.github\.io)\//.test(redirectUri)) throw new Error('That return address is not approved.');
      const state = crypto.randomUUID();
      const { verifier, challenge } = await pkcePair();
      await call('garmin_connection_begin', { p_owner: auth.user.id, p_state: state, p_verifier: verifier, p_redirect: redirectUri });
      const url = new URL(GARMIN_AUTHORIZE);
      url.search = new URLSearchParams({ client_id: clientId!, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', redirect_uri: redirectUri, state }).toString();
      return json({ url: url.toString() });
    }

    if (action === 'callback') {
      const row = await readConnection();
      if (!row || !row.oauth_state || row.oauth_state !== body.state || !row.code_verifier) throw new Error('The Garmin connection expired. Start it again.');
      /* The redirect_uri must be the one authorize sent, character for
         character, or Garmin refuses the exchange. */
      const token = await exchangeToken({ grant_type: 'authorization_code', code: String(body.code || ''), code_verifier: row.code_verifier, redirect_uri: row.redirect_uri || '' });
      const idResponse = await fetch(`${GARMIN_API}/user/id`, { headers: { Authorization: `Bearer ${token.access_token}` } });
      if (!idResponse.ok) throw new Error(`Garmin connected but did not say which account (${idResponse.status}).`);
      const { userId } = await idResponse.json();
      if (!userId) throw new Error('Garmin connected but did not say which account.');
      await call('garmin_connection_complete', { p_owner: auth.user.id, p_garmin_user: String(userId), p_access: token.access_token, p_refresh: token.refresh_token, p_expires: token.expiresAt, p_refresh_expires: token.refreshExpiresAt });
      /* History is what makes the first day useful: readiness needs a
         baseline and paces need past runs. Ask for it now. */
      await requestBackfill(token.access_token, BACKFILL_MAX_DAYS).catch(() => false);
      await call('garmin_connection_synced', { p_owner: auth.user.id, p_synced: new Date().toISOString() });
      /* The rest of the history, after the athlete is already back in Forge. */
      const owner = auth.user.id;
      EdgeRuntime.waitUntil(walkHistory(token.access_token, null, reached => call('garmin_connection_history_requested', { p_owner: owner, p_at: reached })).catch(error => console.error('garmin history:', error)));
      return json({ connected: true });
    }

    if (action === 'sync') {
      const row = await readConnection();
      if (!row || row.status !== 'active') throw new Error('Connect Garmin first.');
      const accessToken = await freshAccessToken(call, row);
      /* A manual sync only needs the recent past; the connect backfill
         already asked for the long history. */
      const { requested, refused } = await requestBackfill(accessToken, 7);
      const syncedAt = new Date().toISOString();
      await call('garmin_connection_synced', { p_owner: auth.user.id, p_synced: syncedAt });
      /* History not finished (never started, or a run was cut short by its
         time box or a 429): carry on from where it reached. */
      if (!historyDone(row.history_requested_at)) {
        const owner = auth.user.id;
        EdgeRuntime.waitUntil(walkHistory(accessToken, row.history_requested_at, reached => call('garmin_connection_history_requested', { p_owner: owner, p_at: reached })).catch(error => console.error('garmin history:', error)));
      }
      return json({ connected: true, requested, refused, lastSyncedAt: syncedAt, historyComplete: historyDone(row.history_requested_at) });
    }

    if (action === 'disconnect') {
      const row = await readConnection();
      /* Tell Garmin first so it stops pushing; a failure there still
         disconnects on Forge's side, and the webhook ignores unknown users. */
      if (row?.status === 'active') {
        const accessToken = await freshAccessToken(call, row).catch(() => null);
        if (accessToken) await fetch(`${GARMIN_API}/user/registration`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }).catch(() => null);
      }
      await call('garmin_connection_delete', { p_owner: auth.user.id });
      return json({ connected: false });
    }
    throw new Error('Unknown connection action.');
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Garmin connection failed.' }, 400);
  }
});
