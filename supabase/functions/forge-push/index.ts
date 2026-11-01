import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendPush, type PushTarget } from './webpush.ts';

/* THE SENDER. Called by the database — never by a browser — for the things
   worth interrupting someone's day with:

     morning   the day's training, once, in their own morning
     partner   a training partner logged and you have not
     sync      their Garmin watch just delivered a new activity
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

type Row = { endpoint: string; owner_id: string; p256dh: string; auth: string; timezone: string; wants_morning: boolean; wants_partner: boolean; wants_sync: boolean };
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

/* WHAT YESTERDAY LOOKED LIKE, AND WHETHER TODAY HAS BEEN ANSWERED.

   The morning push used to say "Open Forge to see what is next in your split"
   to everyone, every day. It is one interruption a day and it should carry the
   most useful thing Forge knows, which the morning after a session is not the
   day's plan — it is the question only the athlete can answer.

   One query covers it: "have they trained today" and "did they train
   yesterday" are the same table over two dates, and asking twice doubles the
   cost of the hourly cron for no information. Deliberately columns only, no
   embedded sets or cardio — a lock-screen line does not need the weight on the
   bar, it needs to get them to open the app, where the check-in has the whole
   history and asks the precise question. */
type DayShape = { title: string };
async function daysAround(pairs: Array<[string, string]>): Promise<Map<string, DayShape>> {
  if (!pairs.length) return new Map();
  const owners = [...new Set(pairs.map(pair => pair[0]))];
  const dates = [...new Set(pairs.flatMap(pair => [pair[1], dayBefore(pair[1])]))];
  const { data } = await admin.from('workout_days').select('owner_id,workout_date,title')
    .in('owner_id', owners).in('workout_date', dates);
  const found = new Map<string, DayShape>();
  for (const row of (data || []) as Array<Record<string, unknown>>) {
    found.set(pairKey(String(row.owner_id), String(row.workout_date)), { title: String(row.title || '') });
  }
  return found;
}

/* Whether today's check-in has already been answered — the one thing that
   decides which of the two morning lines goes out. */
async function answeredToday(pairs: Array<[string, string]>): Promise<Set<string>> {
  if (!pairs.length) return new Set();
  const owners = [...new Set(pairs.map(pair => pair[0]))];
  const dates = [...new Set(pairs.map(pair => pair[1]))];
  const { data } = await admin.from('athlete_check_ins').select('owner_id,check_in_date')
    .in('owner_id', owners).in('check_in_date', dates);
  return new Set((data || []).map(row => pairKey(row.owner_id as string, String(row.check_in_date))));
}

/* WHAT TODAY HOLDS, IN ONE LINE. The brief used to say "Open Forge to see
   what is next in your split" — an interruption that carried nothing. The
   cycle cursor and the split's day names are in the database, and a
   recommendation row is there when the app has already built today, so the
   line can name the day and its lift: "Lower Body — Back Squat 285 × 4."
   Batched over everyone due, like the other lookups. */
type NextUp = { line: string };
async function nextUpFor(pairs: Array<[string, string]>): Promise<Map<string, NextUp>> {
  const out = new Map<string, NextUp>();
  if (!pairs.length) return out;
  const owners = [...new Set(pairs.map(pair => pair[0]))];
  const dates = [...new Set(pairs.map(pair => pair[1]))];
  /* A recommendation the app has already saved for today wins: it carries the
     load and the cardio the athlete will actually see. */
  const { data: recs } = await admin.from('daily_recommendations').select('owner_id,recommendation_date,recommendation,status')
    .in('owner_id', owners).in('recommendation_date', dates);
  for (const row of (recs || []) as Array<Record<string, unknown>>) {
    const rec = (row.recommendation || {}) as { splitDay?: { name?: string; type?: string }; topSets?: Array<{ exercise?: string; weight?: number; reps?: number; selected?: boolean }>; cardio?: { summary?: string; selected?: boolean }; coachNote?: string };
    const day = String(rec.splitDay?.name || '');
    if (!day) continue;
    const set = (rec.topSets || []).find(item => item.selected !== false && Number(item.weight) > 0);
    const parts = [set ? `${set.exercise} ${set.weight} × ${set.reps}` : (rec.topSets || [])[0]?.exercise, rec.cardio && rec.cardio.selected !== false ? rec.cardio.summary : ''].filter(Boolean);
    out.set(pairKey(String(row.owner_id), String(row.recommendation_date)), { line: rec.splitDay?.type === 'rest' ? `${day}. ${rec.coachNote || 'Nothing owed today.'}` : `${day}${parts.length ? ` — ${parts.join(' · ')}` : ''}.` });
  }
  const remaining = owners.filter(owner => !dates.some(date => out.has(pairKey(owner, date))));
  if (!remaining.length) return out;
  /* THE LOG IS THE TRUTH, here as in the app (lib/cycleCursor): the day after
     the last session logged against a split position, rest expiring after a
     day. The cycle cursor is read only when no positioned session exists. */
  const { data: cycles } = await admin.from('training_cycle_state').select('owner_id,split_id,next_position').in('owner_id', remaining);
  const splitIds = [...new Set((cycles || []).map(row => String(row.split_id)))];
  const { data: days } = splitIds.length ? await admin.from('training_split_days').select('split_id,position,name,goal_lifts,cardio_types').in('split_id', splitIds) : { data: [] };
  const { data: recent } = await admin.from('workout_days').select('owner_id,workout_date,split_position').in('owner_id', remaining).not('split_position', 'is', null).gte('workout_date', Array.from({ length: 14 }).reduce<string>(date => dayBefore(date), [...dates].sort()[0])).order('workout_date', { ascending: false });
  const latestByOwner = new Map<string, { date: string; position: number }>();
  for (const row of (recent || []) as Array<Record<string, unknown>>) {
    const owner = String(row.owner_id);
    if (!latestByOwner.has(owner)) latestByOwner.set(owner, { date: String(row.workout_date), position: Number(row.split_position) });
  }
  const isRest = (day: Record<string, unknown>) => /^rest|recovery|off$/i.test(String(day.name || '').trim()) || (!(Array.isArray(day.goal_lifts) && day.goal_lifts.length) && !(Array.isArray(day.cardio_types) && day.cardio_types.length) && /rest|recover|off/i.test(String(day.name || '')));
  for (const cycle of (cycles || []) as Array<Record<string, unknown>>) {
    const owner = String(cycle.owner_id);
    const splitDays = ((days || []) as Array<Record<string, unknown>>).filter(item => String(item.split_id) === String(cycle.split_id)).sort((a, b) => Number(a.position) - Number(b.position));
    if (!splitDays.length) continue;
    const after = (position: number) => splitDays.find(item => Number(item.position) > position) || splitDays[0];
    const latest = latestByOwner.get(owner);
    for (const date of dates) {
      if (out.has(pairKey(owner, date))) continue;
      let day = latest ? after(latest.position) : (splitDays.find(item => Number(item.position) === Number(cycle.next_position)) || after(Number(cycle.next_position) - 1));
      if (latest && isRest(day)) {
        const gap = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${latest.date}T12:00:00Z`)) / 86400000);
        if (gap >= 2) day = after(Number(day.position));
      }
      const lifts = Array.isArray(day.goal_lifts) ? (day.goal_lifts as string[]).filter(Boolean) : [];
      /* cardio_types holds policies ("Forge", "Planned"), not sessions; only HYROX is worth a word. */
      const hyrox = Array.isArray(day.cardio_types) && (day.cardio_types as string[]).some(item => /^hyrox$/i.test(String(item)));
      const detail = [lifts[0], hyrox ? 'HYROX' : ''].filter(Boolean).join(' · ');
      out.set(pairKey(owner, date), { line: isRest(day) ? `${String(day.name)}. Nothing owed today.` : `${String(day.name)}${detail ? ` — ${detail}` : ''}.` });
    }
  }
  return out;
}

/* Athletes whose watch has sent a health summary in the last three days —
   the same rule the app uses to stop asking how they feel. */
async function watchSyncing(pairs: Array<[string, string]>): Promise<Set<string>> {
  if (!pairs.length) return new Set();
  const owners = [...new Set(pairs.map(pair => pair[0]))];
  const earliest = [...new Set(pairs.map(pair => pair[1]))].sort()[0];
  const since = dayBefore(dayBefore(dayBefore(earliest)));
  const { data } = await admin.from('health_daily_snapshots').select('owner_id').in('owner_id', owners).gte('snapshot_date', since);
  return new Set((data || []).map(row => String(row.owner_id)));
}

const dayBefore = (date: string) => {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
};

/* THE MORNING CRON WAKES TWELVE TIMES PER ATHLETE PER DAY AND MUST SPEAK ONCE.

   It runs hourly and each run asks, per subscription, "is it the morning hour
   where they are". A retry, a daylight-saving shift, or two workers on the same tick can
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

const COLUMNS = 'endpoint,owner_id,p256dh,auth,timezone,wants_morning,wants_partner,wants_sync';

/* THE TWO HOURS THAT DECIDE WHEN A PHONE IS ALLOWED TO BUZZ, in the athlete's
   own timezone — never the server's.

   MORNING_HOUR is when the day's training arrives. It is a single hour rather
   than a window because the cron wakes hourly and the brief must land once.

   QUIET_START and QUIET_END bound the partner notification, which is not
   scheduled — it fires the moment a partner's session is saved, so it can land
   at any hour at all. Outside these bounds it is dropped rather than held: a
   nudge delivered hours late is worse than none. The lower bound tracks
   MORNING_HOUR so an early riser is not woken by their own brief and then
   silenced for their partner two hours later. */
const MORNING_HOUR = 6;
const QUIET_START = MORNING_HOUR;
const QUIET_END = 21;

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
    /* Whose morning it is, decided before anything is asked of the database. */
    const due = ((data || []) as Row[])
      .filter(row => localHour(row.timezone) === MORNING_HOUR)
      .map(row => ({ row, date: localDate(row.timezone) }));
    const pairs = due.map(({ row, date }) => [row.owner_id, date] as [string, string]);
    const days = await daysAround(pairs);
    const told = await sentDays(kind, pairs);
    const answered = await answeredToday(pairs);
    const nextUp = await nextUpFor(pairs);
    const watched = await watchSyncing(pairs);
    for (const { row, date } of due) {
      const key = pairKey(row.owner_id, date);
      if (told.has(key)) { skipped.push({ kind, owner_id: row.owner_id, local_date: date, outcome: 'skipped', note: 'already sent today' }); continue; }
      /* THE CHECK-IN OUTRANKS THE TRAINING BRIEF, including on a day they have
         already trained — "how did you pull up" is worth asking after any
         session whatever today holds, and it is the input the whole plan runs
         on. Whether the session was hard enough to be worth a question is
         decided in the app, which has the history to judge it; out here the
         job is only to get them to open it. The brief itself still stands down
         once they have trained. */
      const yesterday = days.get(pairKey(row.owner_id, dayBefore(date)));
      /* A watch that is syncing answers this itself — the app stops asking
         how they feel, so the lock screen does too. */
      const needsCheckIn = Boolean(yesterday) && !answered.has(key) && !watched.has(row.owner_id);
      if (!needsCheckIn && days.has(key)) { skipped.push({ kind, owner_id: row.owner_id, local_date: date, outcome: 'skipped', note: 'already trained' }); continue; }
      const payload = needsCheckIn && yesterday
        ? {
          title: 'How did you pull up?',
          body: `${yesterday.title ? `${yesterday.title} yesterday` : 'You trained yesterday'}. Three taps and Forge shapes today around it.`,
          tag: `checkin-${date}`, url: './#/',
        }
        : { title: 'Today’s training', body: nextUp.get(key)?.line || 'Open Forge to see what is next in your split.', tag: `morning-${date}`, url: './#/' };
      messages.push({ row, date, payload });
    }
  }

  if (kind === 'partner') {
    /* One athlete just logged; their partners hear about it now. This is
       trigger-driven, not scheduled: it runs on the INSERT, so the phone buzzes
       within a second or two of the session being saved. */
    const actor = String(body.owner_id || '');
    if (!actor) return json({ sent: 0 });
    const { data: actorProfile } = await admin.from('profiles').select('display_name,username,unit_system').eq('id', actor).maybeSingle();
    const name = actorProfile?.display_name || actorProfile?.username || 'Your partner';
    /* WHAT THEY ACTUALLY DID, IN THE NOTIFICATION.

       "Adam trained" is the fact; "Adam trained · Bench 315 lb x 3" is the
       reason anyone cares. The session is committed by the time this runs —
       save_my_training_day writes the day, its top sets and its cardio in one
       transaction, and pg_net only dispatches after that commits — so the sets
       are there to be read.

       The heaviest set by estimated max is the one worth naming: the same
       36/(37-reps) curve every other surface uses, so a notification can never
       call a different set of theirs the top one. */
    const { data: session } = await admin.from('workout_days')
      .select('workout_date,top_sets(lift_name,weight,reps),cardio_sessions(activity,summary)')
      .eq('owner_id', actor).order('workout_date', { ascending: false }).limit(1).maybeSingle();
    const unit = actorProfile?.unit_system === 'metric' ? 'kg' : 'lb';
    const sets = (session?.top_sets || []) as Array<{ lift_name: string; weight: number; reps: number }>;
    const heaviest = sets.reduce<{ lift_name: string; weight: number; reps: number } | null>((best, set) => {
      const reps = Math.min(Math.max(Math.round(Number(set.reps) || 0), 1), 10);
      const estimate = Number(set.weight) * (36 / (37 - reps));
      const bestReps = best ? Math.min(Math.max(Math.round(Number(best.reps) || 0), 1), 10) : 0;
      const bestEstimate = best ? Number(best.weight) * (36 / (37 - bestReps)) : 0;
      return estimate > bestEstimate ? set : best;
    }, null);
    const topSet = heaviest ? `${heaviest.lift_name} ${Number(heaviest.weight)} ${unit} × ${Number(heaviest.reps)}` : '';
    /* "Run · 2.27 mi · 21:04" — the distance is the part that fits. A bare
       "Run" is a session someone opened and never filled in, worth no miles
       and no minutes; it is not news. */
    const cardioParts = String((session?.cardio_sessions as Array<{ activity: string; summary: string }> | null)?.[0]?.summary || '').split(' · ').filter(Boolean);
    const cardioLine = cardioParts.length > 1 ? `${cardioParts[0]} ${cardioParts[1]}` : '';
    const did = [topSet, cardioLine].filter(Boolean).join(' · ');
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
      if (hour < QUIET_START || hour >= QUIET_END) { skipped.push({ kind, owner_id: row.owner_id, local_date: date, outcome: 'skipped', note: `quiet hours (local ${hour})` }); continue; }
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
        ? { title: `${name} trained`, body: did ? `${did}. Both of you are in today.` : 'Both of you are in today.', tag: `partner-${date}`, url: './#/' }
        : { title: 'Your turn', body: did ? `${name} did ${did}. You haven’t logged yet.` : `${name} trained today. You haven’t logged yet.`, tag: `partner-${date}`, url: './#/' };
      messages.push({ row, date, payload });
    }
  }

  if (kind === 'sync') {
    /* THE WATCH SYNCED. Sent by the insert trigger on external_activities with
       the Garmin ids that just arrived — new rows only, so a resend is silent.
       No quiet hours: the athlete has just synced their watch, so they are
       awake and holding it. What it says is what arrived ("Strength 47 min ·
       Run 2.3 mi") and, for a lift, the day's top set the session belongs to —
       Forge files the lift's length on that day, so naming the set tells them
       it went to the right place. */
    const owner = String(body.owner_id || '');
    const ids = Array.isArray(body.external_ids) ? (body.external_ids as unknown[]).map(String).slice(0, 20) : [];
    if (!owner || !ids.length) return json({ sent: 0 });
    const { data: subs } = await admin.from('push_subscriptions').select(COLUMNS).eq('owner_id', owner).eq('wants_sync', true);
    if (!subs?.length) return json({ sent: 0 });
    const { data: activities } = await admin.from('external_activities')
      .select('activity_type,distance_meters,moving_seconds,elapsed_seconds,local_start:raw_summary->>start_date_local')
      .eq('owner_id', owner).eq('provider', 'garmin').in('external_id', ids).order('started_at', { ascending: true });
    const rows = (activities || []) as Array<{ activity_type: string; distance_meters: number | null; moving_seconds: number | null; elapsed_seconds: number | null; local_start: string | null }>;
    if (!rows.length) return json({ sent: 0 });
    const { data: profile } = await admin.from('profiles').select('unit_system').eq('id', owner).maybeSingle();
    const metric = profile?.unit_system === 'metric';
    const minutesOf = (row: typeof rows[number]) => Math.round((Number(row.moving_seconds || row.elapsed_seconds) || 0) / 60);
    const lift = (row: typeof rows[number]) => row.activity_type === 'WeightTraining';
    const name = (type: string) => ({ WeightTraining: 'Strength', Run: 'Run', TrailRun: 'Trail run', VirtualRun: 'Run', Ride: 'Ride', VirtualRide: 'Ride', Walk: 'Walk', Hike: 'Hike', Swim: 'Swim', Rowing: 'Row' } as Record<string, string>)[type] || type.replace(/([a-z])([A-Z])/g, '$1 $2');
    const parts = rows.map(row => {
      const distance = Number(row.distance_meters) || 0;
      const shown = distance > 0 && !lift(row) ? `${Math.round((distance / (metric ? 1000 : 1609.344)) * 10) / 10} ${metric ? 'km' : 'mi'}` : '';
      const minutes = minutesOf(row);
      return [name(row.activity_type), shown || (minutes ? `${minutes} min` : '')].filter(Boolean).join(' ');
    });
    /* The lift's day, by the athlete's local date — the same day the import
       files the minutes on. */
    const liftRow = rows.find(lift);
    let matched = '';
    if (liftRow?.local_start) {
      const { data: day } = await admin.from('workout_days').select('title,top_sets(lift_name,weight,reps,position)')
        .eq('owner_id', owner).eq('workout_date', liftRow.local_start.slice(0, 10)).maybeSingle();
      const sets = ((day?.top_sets || []) as Array<{ lift_name: string; weight: number; reps: number; position: number }>).sort((a, b) => a.position - b.position);
      const unit = metric ? 'kg' : 'lb';
      matched = sets.length
        ? ` Matched to ${day?.title ? `${day.title} · ` : ''}${sets[0].lift_name} ${Number(sets[0].weight)} ${unit} × ${Number(sets[0].reps)}${sets.length > 1 ? ` +${sets.length - 1}` : ''}.`
        : ' Log your top set and the time goes with it.';
    }
    for (const row of subs as Row[]) {
      const date = localDate(row.timezone);
      messages.push({ row, date, payload: { title: 'Garmin synced', body: `${parts.join(' · ')}.${matched}`, tag: `sync-${ids[ids.length - 1]}`, url: './#/' } });
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
