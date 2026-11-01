import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

/* GARMIN, SHARED BY BOTH ENDPOINTS. garmin-connect runs the athlete's OAuth
   flow; garmin-webhook receives what Garmin pushes. Both need fresh tokens,
   and only the webhook maps summaries — but keeping the Garmin vocabulary in
   one file means the two can never disagree about it. */

export const GARMIN_AUTHORIZE = 'https://connect.garmin.com/oauth2Confirm';
export const GARMIN_TOKEN = 'https://diauth.garmin.com/di-oauth2-service/oauth/token';
export const GARMIN_API = 'https://apis.garmin.com/wellness-api/rest';

export type GarminConnection = {
  owner_id: string; garmin_user_id?: string | null; status?: string;
  access_token?: string | null; refresh_token?: string | null; expires_at?: string | null;
  oauth_state?: string | null; code_verifier?: string | null; redirect_uri?: string | null;
  last_synced_at?: string | null; last_push_at?: string | null; history_requested_at?: string | null;
} | null;

export const garminCredentials = () => {
  const clientId = Deno.env.get('GARMIN_CLIENT_ID');
  const clientSecret = Deno.env.get('GARMIN_CLIENT_SECRET');
  return { clientId, clientSecret, configured: Boolean(clientId && clientSecret) };
};

/* Every storage call checks its error: PostgREST RETURNS failures rather than
   throwing them, which is how the first Strava build failed in silence. */
export const rpc = (admin: SupabaseClient) => async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(`Garmin connection storage failed (${fn}): ${error.message}`);
  return data as T;
};

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const pkcePair = async () => {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  return { verifier, challenge };
};

type TokenResponse = { access_token: string; refresh_token: string; expires_in: number; refresh_token_expires_in?: number };
const expiry = (seconds?: number) => seconds ? new Date(Date.now() + seconds * 1000).toISOString() : null;

export async function exchangeToken(params: Record<string, string>) {
  const { clientId, clientSecret } = garminCredentials();
  const response = await fetch(GARMIN_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId!, client_secret: clientSecret!, ...params }),
  });
  if (!response.ok) throw new Error(`Garmin refused the token request (${response.status}): ${(await response.text()).slice(0, 200)}`);
  const token = await response.json() as TokenResponse;
  return { ...token, expiresAt: expiry(token.expires_in)!, refreshExpiresAt: expiry(token.refresh_token_expires_in) };
}

/* Garmin access tokens last about a day; refresh with a minute to spare. */
export async function freshAccessToken(call: ReturnType<typeof rpc>, row: NonNullable<GarminConnection>) {
  if (row.access_token && row.expires_at && new Date(row.expires_at).getTime() > Date.now() + 60_000) return row.access_token;
  if (!row.refresh_token) throw new Error('Garmin needs to be reconnected.');
  const token = await exchangeToken({ grant_type: 'refresh_token', refresh_token: row.refresh_token }).catch(() => { throw new Error('Garmin needs to be reconnected.'); });
  await call('garmin_connection_refresh', { p_owner: row.owner_id, p_access: token.access_token, p_refresh: token.refresh_token, p_expires: token.expiresAt, p_refresh_expires: token.refreshExpiresAt });
  return token.access_token;
}

/* Garmin activity types → the Strava sport types the import already speaks,
   so a Garmin run and a Strava run land in the log as the same thing and the
   cross-source dedupe can compare them. Unknown types become PascalCase
   ("PADDLE_BOARDING" → "PaddleBoarding") so nothing is dropped. */
/* Keys follow Appendix A of the Activity API (v2.1). Water sports come as
   both NAME and NAME_V2; the suffix is stripped before lookup. */
const activityTypes: Record<string, string> = {
  RUNNING: 'Run', STREET_RUNNING: 'Run', TRACK_RUNNING: 'Run', TREADMILL_RUNNING: 'Run', INDOOR_RUNNING: 'Run', OBSTACLE_RUN: 'Run', VIRTUAL_RUN: 'VirtualRun',
  TRAIL_RUNNING: 'TrailRun', ULTRA_RUN: 'TrailRun',
  CYCLING: 'Ride', ROAD_BIKING: 'Ride', TRACK_CYCLING: 'Ride', RECUMBENT_CYCLING: 'Ride', CYCLOCROSS: 'Ride', BMX: 'Ride', HANDCYCLING: 'Ride',
  INDOOR_CYCLING: 'VirtualRide', INDOOR_HANDCYCLING: 'VirtualRide', VIRTUAL_RIDE: 'VirtualRide', GRAVEL_CYCLING: 'GravelRide',
  MOUNTAIN_BIKING: 'MountainBikeRide', DOWNHILL_BIKING: 'MountainBikeRide', ENDURO_MTB: 'MountainBikeRide',
  E_BIKE_FITNESS: 'EBikeRide', E_BIKE_MOUNTAIN: 'EBikeRide', E_ENDURO_MTB: 'EBikeRide',
  LAP_SWIMMING: 'Swim', OPEN_WATER_SWIMMING: 'Swim', SWIMMING: 'Swim',
  WALKING: 'Walk', CASUAL_WALKING: 'Walk', SPEED_WALKING: 'Walk', HIKING: 'Hike', RUCKING: 'Hike',
  INDOOR_ROWING: 'Rowing', ROWING: 'Rowing',
  ELLIPTICAL: 'Elliptical', STAIR_CLIMBING: 'StairStepper', FLOOR_CLIMBING: 'StairStepper', INDOOR_CARDIO: 'Workout', HIIT: 'Workout', FITNESS_EQUIPMENT: 'Workout',
  STRENGTH_TRAINING: 'WeightTraining', YOGA: 'Yoga', PILATES: 'Pilates', MOBILITY: 'Yoga',
  CROSS_COUNTRY_SKIING_WS: 'NordicSki', CROSS_COUNTRY_INDOOR_SKIING: 'NordicSki', SKATE_SKIING_WS: 'NordicSki', BACKCOUNTRY_SKIING: 'BackcountrySki',
  RESORT_SKIING: 'AlpineSki', RESORT_SKIING_SNOWBOARDING_WS: 'AlpineSki', SNOWBOARDING_WS: 'Snowboard', BACKCOUNTRY_SNOWBOARDING: 'Snowboard',
  SNOW_SHOE_WS: 'Snowshoe', KAYAKING: 'Kayaking', STAND_UP_PADDLEBOARDING: 'StandUpPaddling', SURFING: 'Surfing',
};
const pascal = (value: string) => value.toLowerCase().split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('');
export const garminActivityType = (type: unknown) => { const key = String(type || '').toUpperCase().replace(/_V2$/, ''); return activityTypes[key] || (key ? pascal(key) : 'Workout'); };

type Summary = Record<string, unknown>;
const num = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;

export function activityRow(ownerId: string, item: Summary) {
  const start = num(item.startTimeInSeconds) || 0;
  const offset = num(item.startTimeOffsetInSeconds) || 0;
  const type = garminActivityType(item.activityType);
  return {
    owner_id: ownerId, provider: 'garmin',
    external_id: String(item.activityId || item.summaryId),
    activity_type: type,
    activity_name: String(item.activityName || type),
    started_at: new Date(start * 1000).toISOString(),
    distance_meters: num(item.distanceInMeters),
    moving_seconds: num(item.movingDurationInSeconds) ?? num(item.durationInSeconds),
    elapsed_seconds: num(item.durationInSeconds),
    average_heartrate: num(item.averageHeartRateInBeatsPerMinute),
    max_heartrate: num(item.maxHeartRateInBeatsPerMinute),
    /* start_date_local is what the import reads the athlete's day from —
       the same field name Strava uses, so one query serves both. */
    raw_summary: { ...item, start_date_local: new Date((start + offset) * 1000).toISOString().replace('Z', '') },
    updated_at: new Date().toISOString(),
  };
}

/* One row per athlete per day in health_daily_snapshots. Each summary type
   fills only its own columns; an upsert that names only those columns leaves
   the others alone, so a sleep push never wipes the day's steps. */
export function healthRows(kind: string, ownerId: string, items: Summary[]) {
  const stamp = new Date().toISOString();
  const day = (item: Summary) => String(item.calendarDate || '').slice(0, 10);
  const rows = items.filter(item => /^\d{4}-\d{2}-\d{2}$/.test(day(item))).map(item => {
    const base = { owner_id: ownerId, snapshot_date: day(item), provider: 'garmin', source_updated_at: stamp };
    if (kind === 'dailies') return { ...base, steps: num(item.steps), active_calories: num(item.activeKilocalories), resting_hr: num(item.restingHeartRateInBeatsPerMinute) };
    if (kind === 'sleeps') {
      const asleep = (num(item.deepSleepDurationInSeconds) || 0) + (num(item.lightSleepDurationInSeconds) || 0) + (num(item.remSleepInSeconds) || 0);
      const awake = num(item.awakeDurationInSeconds) || 0;
      const total = asleep || num(item.durationInSeconds) || 0;
      return { ...base, sleep_minutes: Math.round(total / 60), sleep_efficiency: total + awake ? Math.round((total / (total + awake)) * 1000) / 10 : null };
    }
    if (kind === 'hrv') return { ...base, hrv_rmssd: num(item.lastNightAvg) };
    if (kind === 'respiration') {
      const values = Object.values((item.timeOffsetEpochToBreaths || {}) as Record<string, number>).filter(value => typeof value === 'number');
      return { ...base, respiratory_rate: values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null };
    }
    return null;
  }).filter(Boolean) as Array<Record<string, unknown>>;
  /* Garmin can send several summaries for one day (a nap, a corrected
     daily); the last one for each day wins, and one upsert may not name the
     same key twice. */
  return [...new Map(rows.map(row => [row.snapshot_date, row])).values()];
}

export const HEALTH_KINDS = ['dailies', 'sleeps', 'hrv', 'respiration'];
/* Both carry the activity summary model; a manual edit on Garmin Connect
   arrives as the second and replaces the first by activity id. */
export const ACTIVITY_KINDS = ['activities', 'manuallyUpdatedActivities'];
/* Activities come from the Activity API; the rest need the Health API. A
   program approved for one but not the other gets 403/412 on the rest, so
   each kind is requested and judged on its own. */
export const BACKFILL_KINDS = ['activities', 'dailies', 'sleeps', 'hrv'];
/* Only the kinds this program may ask for. The Health API is a separate
   approval; until GARMIN_HEALTH_API is set to "true", asking for dailies,
   sleeps or HRV only earns a 403 ("User not registered with consumer") and
   spends the rate limit on nothing. */
export const backfillKinds = () => Deno.env.get('GARMIN_HEALTH_API') === 'true' ? BACKFILL_KINDS : ['activities'];
/* Activity API §7: one historical request may span at most one month. */
export const BACKFILL_MAX_DAYS = 30;
/* How far back a full history reaches. Garmin answers a window older than it
   keeps with an error, and the walk stops there; this is only the ceiling. */
export const HISTORY_YEARS = 10;
/* A multisport parent (isParent) sums its legs, which also arrive as their
   own activities; storing both would count the triathlon twice. */
export const isMultisportParent = (item: Summary) => item.isParent === true;
