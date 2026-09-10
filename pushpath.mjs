/* WHO GETS TOLD, AND WHO DOES NOT.

   The crypto is covered by pushcrypto.mjs — this covers the decisions made
   before any crypto happens, which is where every complaint about
   notifications actually comes from: a brief that arrived at midnight, one
   that arrived twice, one that never arrived because a toggle was ignored.

   The edge function is Deno and talks to PostgREST, so it is loaded here with
   a stubbed Supabase client: every table read and RPC is answered from plain
   fixtures, and the outbound push is captured rather than sent. What is under
   test is the function's own reasoning, unchanged. */
import { readFileSync } from 'node:fs';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };

/* ---- the world the function runs in ---------------------------------- */
const CHICAGO = 'America/Chicago';
const state = {
  subs: [], workouts: [], sentLog: [], profiles: [], friendships: [], workoutQueries: 0,
  vapid: { pub: 'PUB', priv: 'PRIV' }, written: [], pushed: [], deleted: [],
};

const table = name => {
  const q = { name, filters: [], eq(c, v) { this.filters.push([c, v]); return this; },
    in(c, v) { this.filters.push([c, v, 'in']); return this; },
    select(columns) { this.columns = String(columns || ''); return this; }, limit() { return this; },
    /* The partner branch asks for the athlete's newest day and its sets. */
    order(column, options) { this.orderBy = [column, options?.ascending !== false]; return this; },
    delete() { this.isDelete = true; return this; },
    maybeSingle() { return this.then(r => ({ data: r.data[0] ?? null })); },
    then(resolve) { return Promise.resolve(run(this)).then(resolve); },
    or(expr) { this.orExpr = expr; return this; } };
  return q;
};
const matches = (row, filters) => filters.every(([c, v, op]) => op === 'in' ? v.includes(row[c]) : row[c] === v);
function run(q) {
  if (q.name === 'push_subscriptions') {
    if (q.isDelete) { state.deleted.push(...q.filters); return { data: [] }; }
    return { data: state.subs.filter(row => matches(row, q.filters)) };
  }
  if (q.name === 'workout_days') {
    state.workoutQueries += 1;
    let rows = state.workouts.filter(row => matches(row, q.filters));
    if (q.orderBy) rows = [...rows].sort((a, b) => q.orderBy[1]
      ? String(a[q.orderBy[0]]).localeCompare(String(b[q.orderBy[0]]))
      : String(b[q.orderBy[0]]).localeCompare(String(a[q.orderBy[0]])));
    return { data: rows };
  }
  if (q.name === 'profiles') return { data: state.profiles.filter(row => matches(row, q.filters)) };
  if (q.name === 'friendships') {
    const actor = (q.orExpr.match(/requester_id\.eq\.([^,]+)/) || [])[1];
    return { data: state.friendships.filter(f => f.requester_id === actor || f.addressee_id === actor) };
  }
  return { data: [] };
}
const admin = {
  from: table,
  rpc: async (fn, args) => {
    if (fn === 'forge_push_settings') return { data: { push_secret: 'shhh', vapid_public: state.vapid.pub, vapid_private: state.vapid.priv, vapid_subject: 'mailto:a@b.c' } };
    if (fn === 'forge_push_record') { state.written.push(...args.p_rows); return { data: null }; }
    if (fn === 'forge_push_sent_days') {
      return { data: state.sentLog
        .filter(r => r.kind === args.p_kind && args.p_owners.includes(r.owner) && args.p_dates.includes(r.date))
        .map(r => ({ owner_id: r.owner, local_date: r.date })) };
    }
    return { data: null };
  },
};

/* ---- load the real function with its edges stubbed ------------------- */
const source = readFileSync('supabase/functions/forge-push/index.ts', 'utf8')
  .replace("import { createClient } from 'npm:@supabase/supabase-js@2';", '')
  .replace("import { sendPush, type PushTarget } from './webpush.ts';", '')
  .replace(/const SERVICE_ROLE[\s\S]*?const admin = createClient\([^;]*;/, '')
  .replace('Deno.serve(', 'globalThis.__handler = (');
const { transform } = await import('esbuild');
const { code } = await transform(source, { loader: 'ts', format: 'esm' });

globalThis.Deno = { env: { get: name => (name === 'FORGE_PUSH_SECRET' ? 'shhh' : undefined) } };
globalThis.admin = admin;
globalThis.sendPush = async (target, payload) => { state.pushed.push({ endpoint: target.endpoint, payload }); return { endpoint: target.endpoint, status: 201, gone: false }; };
await import(`data:text/javascript,${encodeURIComponent(
  code.replace(/\bconst admin\b/, 'const _unusedAdmin').replace(/^/, 'const admin = globalThis.admin; const sendPush = globalThis.sendPush;\n'))}`);
const call = async body => {
  state.pushed = []; state.written = []; state.deleted = []; state.workoutQueries = 0;
  const response = await globalThis.__handler(new Request('https://x/', {
    method: 'POST', headers: { 'x-forge-push': 'shhh', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
  return { status: response.status, body: await response.json() };
};

/* The hour the function sees is real, so the fixtures are built around it:
   a subscription whose timezone makes it 7am right now, and one that makes
   it the middle of the night. */
const zoneWhereItIs = hour => {
  const utcHour = new Date().getUTCHours();
  const offset = (hour - utcHour + 24) % 24;
  /* Etc/GMT signs are inverted: Etc/GMT+6 is UTC-6. */
  return offset === 0 ? 'UTC' : offset <= 12 ? `Etc/GMT-${offset}` : `Etc/GMT+${24 - offset}`;
};
const MORNING = zoneWhereItIs(6);   /* MORNING_HOUR in the sender */
const MIDNIGHT = zoneWhereItIs(0);  /* inside quiet hours either way */
const AFTERNOON = zoneWhereItIs(14);
const dayIn = tz => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());

const sub = (owner, tz, extra = {}) => ({
  endpoint: `https://push/${owner}`, owner_id: owner, p256dh: 'p', auth: 'a', timezone: tz,
  wants_morning: true, wants_partner: true, ...extra,
});

console.log('\nThe morning brief');
/* The hours are read out of the sender rather than restated here, so a change
   to MORNING_HOUR cannot leave this suite quietly asserting the old one. */
const hourOf = name => Number(readFileSync('supabase/functions/forge-push/index.ts', 'utf8').match(new RegExp(`const ${name} = (\\d+)`))?.[1]);
check('the suite is testing the sender\'s own morning hour', hourOf('MORNING_HOUR') === 6, `MORNING_HOUR=${hourOf('MORNING_HOUR')}`);
check('and its own quiet-hours end', hourOf('QUIET_END') === 21, `QUIET_END=${hourOf('QUIET_END')}`);
state.subs = [sub('early', MORNING), sub('asleep', MIDNIGHT)];
state.workouts = []; state.sentLog = [];
let out = await call({ kind: 'morning' });
check('reaches the athlete for whom it is 6am', state.pushed.length === 1 && state.pushed[0].endpoint === 'https://push/early');
check('and leaves the one for whom it is midnight alone', !state.pushed.some(p => p.endpoint.includes('asleep')));

state.sentLog = [{ owner: 'early', kind: 'morning', date: dayIn(MORNING) }];
out = await call({ kind: 'morning' });
check('a second run in the same local hour says nothing', state.pushed.length === 0, `skipped ${out.body.skipped}`);
check('and records why', state.written.some(r => r.note === 'already sent today'));

state.sentLog = [];
state.workouts = [{ owner_id: 'early', workout_date: dayIn(MORNING), id: 1 }];
out = await call({ kind: 'morning' });
check('an athlete who already trained is not told to train', state.pushed.length === 0);
check('and that reason is recorded too', state.written.some(r => r.note === 'already trained'));

state.workouts = [];
state.subs = [sub('early', MORNING, { wants_morning: false })];
out = await call({ kind: 'morning' });
check('the morning toggle, off, is obeyed', state.pushed.length === 0);

console.log('\nThe partner nudge');
state.profiles = [{ id: 'actor', display_name: 'Adam Gomez', username: 'adamgomez' }];
state.friendships = [{ requester_id: 'actor', addressee_id: 'friend', status: 'accepted' }];
state.subs = [sub('friend', AFTERNOON)];
state.workouts = []; state.sentLog = [];
out = await call({ kind: 'partner', owner_id: 'actor' });
check('reaches the partner during the day', state.pushed.length === 1);
check('and names who trained', state.pushed[0]?.payload.body.startsWith('Adam Gomez trained today'), state.pushed[0]?.payload.body);

state.subs = [sub('friend', MIDNIGHT)];
out = await call({ kind: 'partner', owner_id: 'actor' });
check('but never at midnight', state.pushed.length === 0);
check('and says it was the hour', state.written.some(r => (r.note || '').startsWith('quiet hours')));

state.subs = [sub('friend', AFTERNOON, { wants_partner: false })];
out = await call({ kind: 'partner', owner_id: 'actor' });
check('the partner toggle, off, is obeyed', state.pushed.length === 0);

state.subs = [sub('friend', AFTERNOON)];
state.workouts = [{ owner_id: 'friend', workout_date: dayIn(AFTERNOON), id: 9 }];
state.sentLog = [];
out = await call({ kind: 'partner', owner_id: 'actor' });
check('someone who already trained still hears about it', state.pushed.length === 1);
check('and is told they both got it in, not told to go', state.pushed[0]?.payload.body === 'Both of you are in today.', state.pushed[0]?.payload.body);

state.workouts = [];
state.sentLog = [{ owner: 'friend', kind: 'partner', date: dayIn(AFTERNOON) }];
out = await call({ kind: 'partner', owner_id: 'actor' });
check('and a partner is told once a day, not once a session', state.pushed.length === 0);

/* ── WHAT THEY DID, NOT JUST THAT THEY DID ────────────────────────────────
   "Adam trained" is the fact; "Adam trained · Bench 315 lb x 3" is the reason
   anyone cares. The whole day — the row, its top sets, its cardio — is written
   by one RPC, so by the time pg_net dispatches this the sets are committed and
   there to be read. */
console.log('\nWhat the notification says they did');
const session = (sets, cardio) => [{ owner_id: 'actor', workout_date: dayIn(AFTERNOON), id: 11,
  top_sets: sets, cardio_sessions: cardio }];

state.sentLog = []; state.subs = [sub('friend', AFTERNOON)];
state.workouts = session([{ lift_name: 'Bench', weight: 315, reps: 3 }], []);
await call({ kind: 'partner', owner_id: 'actor' });
check('the top set is in the notification', /Bench 315 lb × 3/.test(state.pushed[0]?.payload.body || ''), state.pushed[0]?.payload.body);
check('and the nudge is still there', /You haven’t logged yet/.test(state.pushed[0]?.payload.body || ''));

/* The heaviest set by estimated max, on the same curve every other surface
   uses — never whichever was logged first. */
state.sentLog = []; state.subs = [sub('friend', AFTERNOON)];
state.workouts = session([
  { lift_name: 'Lat Pulldown', weight: 220, reps: 8 },
  { lift_name: 'Bench', weight: 315, reps: 3 },
  { lift_name: 'Pull Ups', weight: 105, reps: 5 },
], []);
await call({ kind: 'partner', owner_id: 'actor' });
check('three sets, and it names the heaviest', /Bench 315 lb × 3/.test(state.pushed[0]?.payload.body || ''), state.pushed[0]?.payload.body);
check('not the first one logged', !/Lat Pulldown/.test(state.pushed[0]?.payload.body || ''));

state.sentLog = []; state.subs = [sub('friend', AFTERNOON)];
state.workouts = session([{ lift_name: 'Squat', weight: 460, reps: 4 }],
  [{ activity: 'Run', summary: 'Run · 2.27 mi · 21:04' }]);
await call({ kind: 'partner', owner_id: 'actor' });
check('a lift and a run both fit', /Squat 460 lb × 4 · Run 2.27 mi/.test(state.pushed[0]?.payload.body || ''), state.pushed[0]?.payload.body);

/* A partner who has already trained hears the same session, framed as news. */
state.sentLog = []; state.subs = [sub('friend', AFTERNOON)];
state.workouts = [...session([{ lift_name: 'Bench', weight: 315, reps: 3 }], []),
  { owner_id: 'friend', workout_date: dayIn(AFTERNOON), id: 12, top_sets: [], cardio_sessions: [] }];
await call({ kind: 'partner', owner_id: 'actor' });
check('both of you in, and it still says what they did',
  /Bench 315 lb × 3\. Both of you are in today\./.test(state.pushed[0]?.payload.body || ''), state.pushed[0]?.payload.body);

/* Cardio-only, and a session with nothing measurable in it at all. */
state.sentLog = []; state.subs = [sub('friend', AFTERNOON)];
state.workouts = session([], [{ activity: 'Run', summary: 'Run · 5.12 miles · 40:00' }]);
await call({ kind: 'partner', owner_id: 'actor' });
check('a run alone is worth saying', /Run 5.12 miles/.test(state.pushed[0]?.payload.body || ''), state.pushed[0]?.payload.body);

state.sentLog = []; state.subs = [sub('friend', AFTERNOON)];
state.workouts = session([], []);
await call({ kind: 'partner', owner_id: 'actor' });
check('and an empty one falls back to the old line',
  state.pushed[0]?.payload.body === 'Adam Gomez trained today. You haven’t logged yet.', state.pushed[0]?.payload.body);

console.log('\nWhen it cannot send');
state.sentLog = [];
state.vapid = { pub: 'PUB', priv: '' };
/* The function caches its config for a minute so the hourly cron does not
   re-read it once per subscription. That means a key changed just now is not
   visible just now — which is correct, and which this has to step past. Doing
   it by moving the clock rather than by reaching into the module also checks
   that the cache actually expires instead of lasting for the life of the
   instance. */
const realNow = Date.now;
let skew = 0;
Date.now = () => realNow() + skew;
skew = 61_000;
out = await call({ kind: 'morning' });
check('it refuses rather than pretending', out.status === 503, `${out.status}`);
check('and names the half that is missing', out.body.missing === 'private', out.body.missing);
check('and writes that to the log', state.written.some(r => (r.note || '').includes('VAPID private key is not set')));

state.vapid = { pub: 'PUB', priv: 'PRIV' };
state.subs = [sub('early', MORNING)];
state.workouts = []; state.sentLog = [];
out = await call({ kind: 'morning' });
check('a key added is still not seen inside the cache window', state.pushed.length === 0);
skew += 61_000;
out = await call({ kind: 'morning' });
check('and is picked up once the window passes, without a redeploy', state.pushed.length === 1);
Date.now = realNow;

console.log('\nAt more than one subscriber');
state.vapid = { pub: 'PUB', priv: 'PRIV' };
state.sentLog = []; state.workouts = [];
state.subs = Array.from({ length: 25 }, (_, index) => sub(`athlete-${index}`, MORNING));
out = await call({ kind: 'morning' });
check('twenty-five athletes all get their brief', state.pushed.length === 25, `${state.pushed.length}`);
check('and the gates cost one query, not one each', state.workoutQueries === 1, `${state.workoutQueries} workout queries`);

console.log('\nAuthorisation');
const forbidden = await globalThis.__handler(new Request('https://x/', {
  method: 'POST', headers: { 'x-forge-push': 'wrong' }, body: '{}',
}));
check('a caller without the secret is refused', forbidden.status === 403);

console.log(fails ? `\n${fails} check(s) failed` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
