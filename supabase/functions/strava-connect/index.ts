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
    const readConnection = async () => (await admin.schema('private').from('activity_connections').select('*').eq('owner_id', auth.user.id).maybeSingle()).data;

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
      await admin.schema('private').from('activity_connections').upsert({ owner_id: auth.user.id, oauth_state: state, redirect_uri: redirectUri, status: 'pending', updated_at: new Date().toISOString() });
      const url = new URL('https://www.strava.com/oauth/authorize');
      url.search = new URLSearchParams({ client_id: clientId!, redirect_uri: redirectUri, response_type: 'code', approval_prompt: 'auto', scope: 'read,activity:read_all', state }).toString();
      return json({ url: url.toString() });
    }
    if (action === 'callback') {
      const row = await readConnection();
      if (!row || row.oauth_state !== body.state) throw new Error('The Strava connection expired. Start it again.');
      const response = await fetch('https://www.strava.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code: body.code, grant_type: 'authorization_code' }) });
      if (!response.ok) throw new Error('Strava could not complete the connection.');
      const token = await response.json();
      await admin.schema('private').from('activity_connections').update({ external_user_id: String(token.athlete?.id || ''), athlete_name: `${token.athlete?.firstname || ''} ${token.athlete?.lastname || ''}`.trim(), access_token: token.access_token, refresh_token: token.refresh_token, expires_at: new Date(token.expires_at * 1000).toISOString(), oauth_state: null, status: 'active', updated_at: new Date().toISOString() }).eq('owner_id', auth.user.id);
      return json({ connected: true });
    }
    if (action === 'disconnect') {
      await admin.schema('private').from('activity_connections').delete().eq('owner_id', auth.user.id);
      return json({ connected: false });
    }
    if (action === 'sync') {
      let row = await readConnection();
      if (!row || row.status !== 'active') throw new Error('Connect Strava first.');
      if (new Date(row.expires_at).getTime() < Date.now() + 60_000) {
        const refresh = await fetch('https://www.strava.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, refresh_token: row.refresh_token, grant_type: 'refresh_token' }) });
        if (!refresh.ok) throw new Error('Strava needs to be reconnected.');
        const token = await refresh.json();
        await admin.schema('private').from('activity_connections').update({ access_token: token.access_token, refresh_token: token.refresh_token, expires_at: new Date(token.expires_at * 1000).toISOString(), updated_at: new Date().toISOString() }).eq('owner_id', auth.user.id);
        row = { ...row, ...token };
      }
      const after = Math.floor((Date.now() - 180 * 86400000) / 1000);
      const response = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100`, { headers: { Authorization: `Bearer ${row.access_token}` } });
      if (!response.ok) throw new Error('Strava activities could not be synced.');
      const activities = await response.json();
      if (activities.length) await admin.from('external_activities').upsert(activities.map((item: Record<string, unknown>) => ({ owner_id: auth.user.id, provider: 'strava', external_id: String(item.id), activity_type: String(item.sport_type || item.type || 'Activity'), activity_name: String(item.name || 'Activity'), started_at: item.start_date, distance_meters: item.distance || null, moving_seconds: item.moving_time || null, elapsed_seconds: item.elapsed_time || null, average_heartrate: item.average_heartrate || null, max_heartrate: item.max_heartrate || null, raw_summary: item, updated_at: new Date().toISOString() })), { onConflict: 'owner_id,provider,external_id' });
      const syncedAt = new Date().toISOString();
      await admin.schema('private').from('activity_connections').update({ last_synced_at: syncedAt, updated_at: syncedAt }).eq('owner_id', auth.user.id);
      return json({ connected: true, importedActivities: activities.length, lastSyncedAt: syncedAt });
    }
    throw new Error('Unknown connection action.');
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Connection failed.' }, 400);
  }
});
