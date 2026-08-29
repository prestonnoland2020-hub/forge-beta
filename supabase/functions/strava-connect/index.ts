import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) throw new Error('Sign in to connect an activity service.');
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
    const { data: auth, error: authError } = await userClient.auth.getUser();
    if (authError || !auth.user) throw new Error('Sign in to connect an activity service.');
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await request.json();
    const action = String(body.action || 'status');
    const clientId = Deno.env.get('STRAVA_CLIENT_ID');
    const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET');
    const configured = Boolean(clientId && clientSecret);

    /* The connection row holds OAuth tokens, so it lives in a schema the API
       does not expose. Reaching it with .schema('private') could never work —
       PostgREST will not serve an unexposed schema and the service role has no
       USAGE on it — and because a failed PostgREST call RETURNS an error
       rather than throwing, every read and write here failed in silence: the
       OAuth state was never stored, so the callback could not match it, and
       status always reported "not connected". Every call now goes through a
       SECURITY DEFINER wrapper granted to the service role alone, and every
       call checks its error. */
    const call = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
      const { data, error } = await admin.rpc(fn, args);
      if (error) throw new Error(`Strava connection storage failed (${fn}): ${error.message}`);
      return data as T;
    };
    type Connection = { oauth_state?: string | null; status?: string; athlete_name?: string; last_synced_at?: string; expires_at?: string; access_token?: string; refresh_token?: string } | null;
    const readConnection = () => call<Connection>('activity_connection_get', { p_owner: auth.user.id });

    if (action === 'status') {
      const row = await readConnection();
      const { count } = await admin.from('external_activities').select('*', { count: 'exact', head: true }).eq('owner_id', auth.user.id).eq('provider', 'strava');
      return json({ configured, connected: row?.status === 'active', athleteName: row?.athlete_name, lastSyncedAt: row?.last_synced_at, importedActivities: count || 0 });
    }
    if (!configured) throw new Error('Strava setup is not finished yet. Add STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET to the Supabase function secrets.');
    if (action === 'authorize') {
      const redirectUri = String(body.redirectUri || '');
      if (!/^https?:\/\/(localhost(:\d+)?|prestonnoland2020-hub\.github\.io)\//.test(redirectUri)) throw new Error('That return address is not approved.');
      const state = crypto.randomUUID();
      await call('activity_connection_begin', { p_owner: auth.user.id, p_state: state, p_redirect: redirectUri });
      const url = new URL('https://www.strava.com/oauth/authorize');
      url.search = new URLSearchParams({ client_id: clientId!, redirect_uri: redirectUri, response_type: 'code', approval_prompt: 'auto', scope: 'read,activity:read_all', state }).toString();
      return json({ url: url.toString() });
    }
    if (action === 'callback') {
      const row = await readConnection();
      if (!row || row.oauth_state !== body.state) throw new Error('The Strava connection expired. Start it again.');
      const response = await fetch('https://www.strava.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code: body.code, grant_type: 'authorization_code' }) });
      /* Strava explains a refused exchange in its body; passing that through
         beats a generic failure the athlete cannot act on. */
      if (!response.ok) throw new Error(`Strava could not complete the connection (${response.status}): ${(await response.text()).slice(0, 200)}`);
      const token = await response.json();
      await call('activity_connection_complete', {
        p_owner: auth.user.id,
        p_external: String(token.athlete?.id || ''),
        p_name: `${token.athlete?.firstname || ''} ${token.athlete?.lastname || ''}`.trim(),
        p_access: token.access_token,
        p_refresh: token.refresh_token,
        p_expires: new Date(token.expires_at * 1000).toISOString(),
      });
      return json({ connected: true });
    }
    if (action === 'disconnect') {
      await call('activity_connection_delete', { p_owner: auth.user.id });
      return json({ connected: false });
    }
    if (action === 'sync') {
      let row = await readConnection();
      if (!row || row.status !== 'active') throw new Error('Connect Strava first.');
      if (new Date(String(row.expires_at)).getTime() < Date.now() + 60_000) {
        const refresh = await fetch('https://www.strava.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, refresh_token: row.refresh_token, grant_type: 'refresh_token' }) });
        if (!refresh.ok) throw new Error('Strava needs to be reconnected.');
        const token = await refresh.json();
        await call('activity_connection_refresh', { p_owner: auth.user.id, p_access: token.access_token, p_refresh: token.refresh_token, p_expires: new Date(token.expires_at * 1000).toISOString() });
        row = { ...row, ...token };
      }
      /* ONE PAGE IS NOT A SYNC, AND SIX MONTHS IS NOT A HISTORY. per_page maxes
         at 200, so a single request imported 200 activities and silently
         dropped the rest; a 180-day `after` window then cut off everything an
         athlete did before that — years of training the pace and mileage
         history depends on. No window: page from newest backwards until Strava
         runs out. 50 pages of 200 is 10,000 activities, far more than any
         athlete has, and 50 requests sits well inside the 200-per-15-minutes
         limit. Without `after`, Strava returns NEWEST-first, so a partial run
         still leaves the recent months — the ones that matter most — intact. */
      const activities: Array<Record<string, unknown>> = [];
      for (let page = 1; page <= 50; page++) {
        const response = await fetch(`https://www.strava.com/api/v3/athlete/activities?per_page=200&page=${page}`, { headers: { Authorization: `Bearer ${row!.access_token}` } });
        if (response.status === 429) break; /* Rate limited: keep what came back rather than losing the whole sync. */
        if (!response.ok) throw new Error(`Strava activities could not be synced (${response.status}).`);
        const batch = await response.json();
        if (!Array.isArray(batch) || !batch.length) break;
        activities.push(...batch);
        if (batch.length < 200) break;
      }
      /* A full history is thousands of rows, each carrying its whole Strava
         payload — one upsert would be a multi-megabyte request that the
         gateway drops, and a dropped request is a sync that reports success
         and stores nothing. Write in chunks, and check every chunk's error:
         PostgREST RETURNS failures rather than throwing them. */
      const asRow = (item: Record<string, unknown>) => ({ owner_id: auth.user.id, provider: 'strava', external_id: String(item.id), activity_type: String(item.sport_type || item.type || 'Activity'), activity_name: String(item.name || 'Activity'), started_at: item.start_date, distance_meters: item.distance || null, moving_seconds: item.moving_time || null, elapsed_seconds: item.elapsed_time || null, average_heartrate: item.average_heartrate || null, max_heartrate: item.max_heartrate || null, raw_summary: item, updated_at: new Date().toISOString() });
      let stored = 0;
      for (let start = 0; start < activities.length; start += 200) {
        const chunk = activities.slice(start, start + 200).map(asRow);
        const { error } = await admin.from('external_activities').upsert(chunk, { onConflict: 'owner_id,provider,external_id' });
        if (error) throw new Error(`Strava activities could not be stored: ${error.message}`);
        stored += chunk.length;
      }
      const syncedAt = new Date().toISOString();
      await call('activity_connection_synced', { p_owner: auth.user.id, p_synced: syncedAt });
      return json({ connected: true, importedActivities: stored, lastSyncedAt: syncedAt });
    }
    throw new Error('Unknown connection action.');
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Connection failed.' }, 400);
  }
});
