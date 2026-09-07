import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendPush, type PushTarget } from './webpush.ts';

/* THE SENDER. Called by the database — never by a browser — for the two
   things worth interrupting someone's day with:

     morning   the day's training, once, in their own morning
     partner   a training partner logged and you have not

   It is deliberately not a general "send a notification" endpoint: the
   messages are composed here from the athlete's own data, so nothing a client
   says can put words on someone else's lock screen. */

const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:prestonnoland2020@gmail.com';
/* The database calls this with a shared secret; nothing else may. */
const PUSH_SECRET = Deno.env.get('FORGE_PUSH_SECRET')!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

type Row = { endpoint: string; owner_id: string; p256dh: string; auth: string; timezone: string };

/* Their local hour, without a timezone library. */
const localHour = (timezone: string) => {
  try {
    return Number(new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }).format(new Date()));
  } catch { return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hour: 'numeric', hour12: false }).format(new Date())); }
};
const localDate = (timezone: string) => {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date()); }
  catch { return new Date().toISOString().slice(0, 10); }
};

async function trainedToday(ownerId: string, date: string) {
  const { data } = await admin.from('workout_days').select('id').eq('owner_id', ownerId).eq('workout_date', date).limit(1);
  return Boolean(data?.length);
}

Deno.serve(async request => {
  if (request.headers.get('x-forge-push') !== PUSH_SECRET) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  const body = await request.json().catch(() => ({}));
  const kind = String(body.kind || 'morning');
  const vapid = { publicKey: VAPID_PUBLIC, privateKey: VAPID_PRIVATE, subject: VAPID_SUBJECT };

  /* Who to send to, and what to say — decided here, from stored data. */
  const messages: Array<{ row: Row; payload: Record<string, unknown> }> = [];

  if (kind === 'morning') {
    const { data } = await admin.from('push_subscriptions').select('endpoint,owner_id,p256dh,auth,timezone');
    for (const row of (data || []) as Row[]) {
      /* Their morning, not the server's. */
      if (localHour(row.timezone) !== 7) continue;
      const date = localDate(row.timezone);
      if (await trainedToday(row.owner_id, date)) continue;
      messages.push({ row, payload: { title: 'Today’s training', body: 'Open Forge to see what is next in your split.', tag: `morning-${date}`, url: './#/' } });
    }
  }

  if (kind === 'partner') {
    /* One athlete just logged; their partners hear about it, unless they have
       already trained themselves — a nudge after the fact is noise. */
    const actor = String(body.owner_id || '');
    if (!actor) return new Response(JSON.stringify({ sent: 0 }), { headers: { 'Content-Type': 'application/json' } });
    const { data: actorProfile } = await admin.from('profiles').select('display_name,username').eq('id', actor).maybeSingle();
    const name = actorProfile?.display_name || actorProfile?.username || 'Your partner';
    const { data: links } = await admin.from('friendships')
      .select('requester_id,addressee_id').eq('status', 'accepted')
      .or(`requester_id.eq.${actor},addressee_id.eq.${actor}`);
    const partnerIds = (links || []).map(link => link.requester_id === actor ? link.addressee_id : link.requester_id);
    if (!partnerIds.length) return new Response(JSON.stringify({ sent: 0 }), { headers: { 'Content-Type': 'application/json' } });
    const { data } = await admin.from('push_subscriptions').select('endpoint,owner_id,p256dh,auth,timezone').in('owner_id', partnerIds);
    for (const row of (data || []) as Row[]) {
      const hour = localHour(row.timezone);
      if (hour < 8 || hour >= 21) continue;
      const date = localDate(row.timezone);
      if (await trainedToday(row.owner_id, date)) continue;
      messages.push({ row, payload: { title: 'Your turn', body: `${name} trained today. You haven’t logged yet.`, tag: `partner-${date}`, url: './#/' } });
    }
  }

  const results = await Promise.all(messages.map(async ({ row, payload }) => {
    try { return await sendPush(row as PushTarget, payload, vapid); }
    catch { return { endpoint: row.endpoint, status: 0, gone: false }; }
  }));

  /* An endpoint the push service has retired is deleted rather than retried
     forever — iOS mints a new one on the next launch anyway. */
  const gone = results.filter(result => result.gone).map(result => result.endpoint);
  if (gone.length) await admin.from('push_subscriptions').delete().in('endpoint', gone);

  return new Response(JSON.stringify({
    sent: results.filter(result => result.status >= 200 && result.status < 300).length,
    failed: results.filter(result => result.status >= 400 && !result.gone).length,
    removed: gone.length,
  }), { headers: { 'Content-Type': 'application/json' } });
});
