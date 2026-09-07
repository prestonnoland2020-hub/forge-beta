import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendPush, type PushTarget } from './webpush.ts';

/* THE SENDER. Called by the database — never by a browser — for the things
   worth interrupting someone's day with:

     morning   the day's training, once, in their own morning
     partner   a training partner logged and you have not
     test      one push to one athlete, on demand, to prove the path
     status    what this function can and cannot do right now

   It is deliberately not a general "send a notification" endpoint: the
   messages are composed here from the athlete's own data, so nothing a caller
   says can put words on someone else's lock screen. */

const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

/* WHERE THE CONFIG COMES FROM, AND WHY IT IS BOTH PLACES.

   These lived only in edge-function environment secrets, which had two costs.
   The small one: turning push on required a person in the dashboard, and
   rotating a key required that plus a rebuild of the client. The real one:
   the shared secret the database sends and the shared secret this function
   expects were two separate values that nothing kept in agreement, and when
   they drifted every push failed with a 403 that no one saw.

   So private.push_config — the row the database already reads to find this
   function — is the fallback for everything, and the caller is accepted if it
   presents EITHER secret. The database and the function cannot disagree about
   the database's own secret. Environment variables still win when set, so an
   operator who prefers the dashboard keeps it. */
type Config = { vapidPublic: string; vapidPrivate: string; vapidSubject: string; secrets: string[] };
/* Cached, but not for the life of the instance: an edge instance stays warm
   for a long time, and a key added a minute ago must not have to wait out a
   cold start to take effect. A minute is short enough to make a config change
   feel immediate and long enough that the hourly cron does not re-read it
   once per subscription. */
const CONFIG_TTL_MS = 60_000;
let cached: Config | null = null;
let cachedAt = 0;
async function config(): Promise<Config> {
  if (cached && Date.now() - cachedAt < CONFIG_TTL_MS) return cached;
  const { data } = await admin.rpc('forge_push_settings') as { data: Record<string, string | null> | null };
  const envSecret = Deno.env.get('FORGE_PUSH_SECRET');
  cached = {
    vapidPublic: Deno.env.get('VAPID_PUBLIC_KEY') || data?.vapid_public || '',
    vapidPrivate: Deno.env.get('VAPID_PRIVATE_KEY') || data?.vapid_private || '',
    vapidSubject: Deno.env.get('VAPID_SUBJECT') || data?.vapid_subject || 'mailto:prestonnoland2020@gmail.com',
    secrets: [envSecret, data?.push_secret].filter((value): value is string => Boolean(value)),
  };
  cachedAt = Date.now();
  return cached;
}

type Row = { endpoint: string; owner_id: string; p256dh: string; auth: string; timezone: string; wants_morning: boolean; wants_partner: boolean };
type LogRow = { kind: string; owner_id?: string; endpoint?: string; local_date?: string; status?: number; outcome: string; note?: string };
const log = async (rows: LogRow[]) => {
  if (!rows.length) return;
  /* A log write must never be the reason a send is reported as failed. The
     builder PostgREST returns is thenable but is not a Promise — it has no
     .catch — so the guard has to be a real try/catch. */
  try { await admin.rpc('forge_push_record', { p_rows: rows }); } catch { /* the send still happened */ }
};

/* Their local hour and their local day, without a timezone library. */
const localHour = (timezone: string) => {
  try { return Number(new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }).format(new Date())); }
  catch { return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hour: 'numeric', hour12: false }).format(new Date())); }
};
const localDate = (timezone: string) => {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date()); }
  catch { return new Date().toISOString().slice(0, 10); }
};

/* TWO QUESTIONS, ASKED ONCE FOR EVERYONE RATHER THAN TWICE PER PERSON.

   Both gates below — has this athlete trained today, have they already been
   told today — used to be a round trip each, inside the loop. At one
   subscriber that is two queries; at two hundred it is four hundred, run one
   after another inside the eight-second budget the database gives this call,
   and the first thing to break would have been the morning brief for whoever
   sorted last. Each is now a single query over the whole candidate set,
   answered from a Set.

   The pairs are (owner, their own local day), which differ across timezones,
   so the key is both. */
const pairKey = (ownerId: string, date: string) => `${ownerId}|${date}`;

async function trainedDays(pairs: Array<[string, string]>): Promise<Set<string>> {
  if (!pairs.length) return new Set();
  const owners = [...new Set(pairs.map(pair => pair[0]))];
  const dates = [...new Set(pairs.map(pair => pair[1]))];
  const { data } = await admin.from('workout_days').select('owner_id,workout_date')
    .in('owner_id', owners).in('workout_date', dates);
  return new Set((data || []).map(row => pairKey(row.owner_id as string, String(row.workout_date))));
}

/* THE MORNING CRON WAKES TWELVE TIMES PER ATHLETE PER DAY AND MUST SPEAK ONCE.

   It runs hourly and each run asks, per subscription, "is it 7am where they
   are". A retry, a daylight-saving shift, or two workers on the same tick can
   all put two runs inside one local 7 o'clock. The log is the memory: if this
   athlete has already been told about this local day, they are not told
   again. */
async function sentDays(kind: string, pairs: Array<[string, string]>): Promise<Set<string>> {
  if (!pairs.length) return new Set();
  const { data } = await admin.rpc('forge_push_sent_days', {
    p_kind: kind,
    p_owners: [...new Set(pairs.map(pair => pair[0]))],
    p_dates: [...new Set(pairs.map(pair => pair[1]))],
  }) as { data: Array<{ owner_id: string; local_date: string }> | null };
  return new Set((data || []).map(row => pairKey(row.owner_id, String(row.local_date))));
}

const COLUMNS = 'endpoint,owner_id,p256dh,auth,timezone,wants_morning,wants_partner';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async request => {
  const settings = await config();
  const presented = request.headers.get('x-forge-push') || '';
  if (!settings.secrets.length || !settings.secrets.includes(presented)) return json({ error: 'forbidden' }, 403);

  const body = await request.json().catch(() => ({}));
  const kind = String(body.kind || 'morning');

  /* A readiness probe that names what is missing without ever echoing a
     secret. The public key is quoted in full on purpose: it is public, and
     comparing it against the one baked into a subscription is the only way to
     catch the failure where a rotated key silently orphans every install. */
  if (kind === 'status') {
    return json({
      ok: Boolean(settings.vapidPrivate && settings.vapidPublic),
      vapidPublic: settings.vapidPublic || null,
      hasVapidPrivate: Boolean(settings.vapidPrivate),
      vapidSubject: settings.vapidSubject,
      acceptedSecrets: settings.secrets.length,
      source: {
        vapidPublic: Deno.env.get('VAPID_PUBLIC_KEY') ? 'env' : 'database',
        vapidPrivate: Deno.env.get('VAPID_PRIVATE_KEY') ? 'env' : 'database',
      },
    });
  }

  if (!settings.vapidPrivate || !settings.vapidPublic) {
    /* Name the half that is missing. "No VAPID keypair" sends whoever reads
       this looking in two places when only one of them is empty. */
    const missing = [!settings.vapidPublic && 'public', !settings.vapidPrivate && 'private'].filter(Boolean).join(' and ');
    await log([{ kind, outcome: 'skipped', note: `cannot send: VAPID ${missing} key is not set (env or private.push_config)` }]);
    return json({ error: 'no-vapid', missing, sent: 0 }, 503);
  }
  const vapid = { publicKey: settings.vapidPublic, privateKey: settings.vapidPrivate, subject: settings.vapidSubject };

  /* Who to send to, and what to say — decided here, from stored data. */
  const messages: Array<{ row: Row; payload: Record<string, unknown>; date: string }> = [];
  const skipped: LogRow[] = [];

  if (kind === 'morning') {
    /* The filter is on the query, not in the loop: an athlete who turned the
       morning brief off should not even be considered. */
    const { data } = await admin.from('push_subscriptions').select(COLUMNS).eq('wants_morning', true);
    /* Whose 7 o'clock it is, decided before anything is asked of the database. */
    const due = ((data || []) as Row[])
      .filter(row => localHour(row.timezone) === 7)
      .map(row => ({ row, date: localDate(row.timezone) }));
    const pairs = due.map(({ row, date }) => [row.owner_id, date] as [string, string]);
    const trained = await trainedDays(pairs);
    const told = await sentDays(kind, pairs);
    for (const { row, date } of due) {
      const key = pairKey(row.owner_id, date);
      if (trained.has(key)) { skipped.push({ kind, owner_id: row.owner_id, local_date: date, outcome: 'skipped', note: 'already trained' }); continue; }
      if (told.has(key)) { skipped.push({ kind, owner_id: row.owner_id, local_date: date, outcome: 'skipped', note: 'already sent today' }); continue; }
      messages.push({ row, date, payload: { title: 'Today’s training', body: 'Open Forge to see what is next in your split.', tag: `morning-${date}`, url: './#/' } });
    }
  }

  if (kind === 'partner') {
    /* One athlete just logged; their partners hear about it, unless they have
       already trained themselves — a nudge after the fact is noise. */
    const actor = String(body.owner_id || '');
    if (!actor) return json({ sent: 0 });
    const { data: actorProfile } = await admin.from('profiles').select('display_name,username').eq('id', actor).maybeSingle();
    const name = actorProfile?.display_name || actorProfile?.username || 'Your partner';
    const { data: links } = await admin.from('friendships')
      .select('requester_id,addressee_id').eq('status', 'accepted')
      .or(`requester_id.eq.${actor},addressee_id.eq.${actor}`);
    const partnerIds = (links || []).map(link => link.requester_id === actor ? link.addressee_id : link.requester_id);
    if (!partnerIds.length) return json({ sent: 0 });
    const { data } = await admin.from('push_subscriptions').select(COLUMNS).eq('wants_partner', true).in('owner_id', partnerIds);
    const awake: Array<{ row: Row; date: string }> = [];
    for (const row of (data || []) as Row[]) {
      const hour = localHour(row.timezone);
      const date = localDate(row.timezone);
      if (hour < 8 || hour >= 21) { skipped.push({ kind, owner_id: row.owner_id, local_date: date, outcome: 'skipped', note: `quiet hours (local ${hour})` }); continue; }
      awake.push({ row, date });
    }
    const pairs = awake.map(({ row, date }) => [row.owner_id, date] as [string, string]);
    /* TRAINING TOGETHER IS THE POINT, SO THIS IS NOT ONLY A NUDGE.

       This used to skip anyone who had already trained, on the theory that a
       reminder after the fact is noise. That was the wrong read: knowing your
       partner got theirs in is the thing people actually want from this, and
       it is worth hearing whether or not you have already been. So everyone
       hears, and what they hear differs — a nudge for the one who has not
       lifted yet, and news for the one who has. */
    const trained = await trainedDays(pairs);
    const told = await sentDays(kind, pairs);
    for (const { row, date } of awake) {
      const key = pairKey(row.owner_id, date);
      if (told.has(key)) { skipped.push({ kind, owner_id: row.owner_id, local_date: date, outcome: 'skipped', note: 'already told today' }); continue; }
      const payload = trained.has(key)
        ? { title: `${name} trained`, body: 'Both of you are in today.', tag: `partner-${date}`, url: './#/' }
        : { title: 'Your turn', body: `${name} trained today. You haven’t logged yet.`, tag: `partner-${date}`, url: './#/' };
      messages.push({ row, date, payload });
    }
  }

  /* One push, to one athlete, ignoring every gate — the only way to prove the
     path end to end without waiting for 7am to come round. */
  if (kind === 'test') {
    const owner = String(body.owner_id || '');
    const query = admin.from('push_subscriptions').select(COLUMNS);
    const { data } = owner ? await query.eq('owner_id', owner) : await query;
    for (const row of (data || []) as Row[]) {
      messages.push({ row, date: localDate(row.timezone), payload: {
        title: String(body.title || 'Forge'),
        body: String(body.body || 'Test notification — the server reached your phone.'),
        tag: `test-${Date.now()}`, url: './#/',
      } });
    }
  }

  const results = await Promise.all(messages.map(async ({ row, payload, date }) => {
    try {
      const result = await sendPush(row as PushTarget, payload, vapid);
      return { ...result, owner_id: row.owner_id, date, note: undefined as string | undefined };
    } catch (error) {
      return { endpoint: row.endpoint, status: 0, gone: false, owner_id: row.owner_id, date, note: String(error).slice(0, 300) };
    }
  }));

  /* An endpoint the push service has retired is deleted rather than retried
     forever — iOS mints a new one on the next launch anyway. */
  const gone = results.filter(result => result.gone).map(result => result.endpoint);
  if (gone.length) await admin.from('push_subscriptions').delete().in('endpoint', gone);

  await log([...skipped, ...results.map(result => ({
    kind, owner_id: result.owner_id, endpoint: result.endpoint, local_date: result.date, status: result.status,
    outcome: result.gone ? 'retired' : result.status >= 200 && result.status < 300 ? 'sent' : 'failed',
    note: result.note,
  }))]);

  return json({
    sent: results.filter(result => result.status >= 200 && result.status < 300).length,
    failed: results.filter(result => result.status >= 400 && !result.gone).length,
    removed: gone.length,
    skipped: skipped.length,
  });
});
