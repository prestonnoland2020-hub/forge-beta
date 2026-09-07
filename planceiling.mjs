/* A BLOCK IS NOT OUTGROWN BECAUSE WEEK ONE IS EASY.

   Forge quietly rebuilds a block it thinks the athlete has passed. It decided
   that by comparing their best calculated max against WEEK ONE's prescribed
   set — but week one of a wave is deliberately submaximal. Preston's block
   opened on heavy doubles; his best sat comfortably above a working double, as
   it should, so the block read as outgrown from the moment it was written and
   was rebuilt on every visit to the Plan tab. On screen that was "Building…"
   sitting over a greyed-out Save plan, forever.

   The bar is now the block's CEILING — the heaviest thing it prescribes in any
   week. These two cases are the two sides of that line.

   Needs the auth build:
     VITE_DEMO_MODE=false VITE_SUPABASE_URL=https://test.supabase.co \
     VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_testtesttesttesttest \
     npm run build -- --outDir dist-auth
     npx vite preview --host 127.0.0.1 --port 4194 --outDir dist-auth  */
import { chromium } from 'playwright';
import { setup } from './seed.mjs';

const BASE = 'http://localhost:4194';
let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : '   → ' + d}`); if (!c) fails++; };
const oneRm = (w, r) => Math.round(w * (1 + r / 30));

const splitDays = [{ name: 'Legs', type: 'Strength', muscles: ['Quads', 'Hamstrings', 'Glutes'], exercises: ['Squat'] }];
/* A real wave: heavy doubles up front, the true ceiling on max week. */
const WAVE = [2, 8, 6, 4, 2, 8, 6, 4, 2, 1];
const LOAD = { 8: 340, 6: 365, 4: 385, 2: 405, 1: 465 };
const mkWeek = n => ({ week: n, phase: 'Build', mileage: 0, longRunMiles: 0, longRunPace: '', quality: '', qualityPace: '',
  qualityDay: '', longRunDay: '', easyDays: [], easyMinutes: 0, easyPace: '',
  topSets: [{ splitDay: 'Legs', exercise: 'Squat', weight: LOAD[WAVE[n - 1]], reps: WAVE[n - 1] }], note: 'Wave.' });
const weeks = Array.from({ length: 10 }, (_, i) => mkWeek(i + 1));
const ceiling = Math.max(...weeks.map(w => oneRm(w.topSets[0].weight, w.topSets[0].reps)));
const weekOne = oneRm(weeks[0].topSets[0].weight, weeks[0].topSets[0].reps);

const mkPlan = fingerprint => ({ plan: { summary: 'Original block.', easyPace: '', weeks }, generatedAt: new Date().toISOString(),
  startDate: new Date().toISOString().slice(0, 10), fingerprint: fingerprint || 'seeded', blockWeeks: 10, saved: false });
const mkDay = (weight, reps) => ([{ id: 'p1', date: '2026-09-05', title: 'Legs', muscles: ['Quads'],
  topSets: [{ id: 'p1t', muscle: 'Quads', lift: 'Squat', weight, reps, completed: true, calculatedMax: oneRm(weight, reps) }],
  lift: 'Squat', weight, reps, calculatedMax: oneRm(weight, reps), hasCardio: false, cardioSessions: [] }]);
/* The same day as the server returns it — history for a signed-in athlete is
   read from workout_days, not from the local mirror. */
const mkRows = (weight, reps) => ([{ id: 'p1', workout_date: '2026-09-05', title: 'Legs', muscle_groups: ['Quads'],
  notes: null, body_weight: null, effort: null, recommendation_id: null, split_id: null, split_day_id: null, split_position: null,
  cardio_sessions: [],
  top_sets: [{ id: 'p1t', position: 1, muscle_group: 'Quads', lift_name: 'Squat', weight, reps, recommendation_top_set_id: null }] }]);

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const run = async (hist, rows, fingerprint) => {
  const page = await b.newPage({ viewport: { width: 430, height: 1400 } });
  let built = 0;
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(BASE)) return route.continue();
    const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.includes('/functions/v1/forge-plan')) {
      built += 1;
      return json({ plan: { summary: 'Rebuilt block.', easyPace: '', adjustmentNote: '', weeks } });
    }
    if (url.includes('/rest/v1/workout_days')) return json(rows);
    if (url.includes('/rest/v1/profiles')) return json({ username: 'preston', display_name: 'Preston', unit_system: 'imperial', onboarding_completed: true, updated_at: new Date().toISOString() });
    if (url.includes('/rest/v1/') || url.includes('/rpc/')) return json([]);
    if (url.includes('/auth/v1/')) return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    return route.abort();
  });
  await page.addInitScript(([s, h, p, sd]) => {
    localStorage.clear();
    const user = { id: 'preview-user', aud: 'authenticated', role: 'authenticated', email: 'p@e.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
    localStorage.setItem('sb-test-auth-token', JSON.stringify({ access_token: 't', refresh_token: 't', token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, user }));
    localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
    localStorage.setItem('forge-goals', JSON.stringify([{ type: 'Strength', title: 'Squat 500', exercise: 'Squat', metric: 'Real 1RM', target: '500', unit: 'lb', date: '2026-12-30', connection: '' }]));
    localStorage.setItem('forge-workout-history-v1', JSON.stringify(h));
    localStorage.setItem('forge-ai-plan-v1', JSON.stringify(p));
    localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'rolling', minWeeklyMileage: 0, maxWeeklyMileage: 0,
      days: sd.map(d => ({ name: d.name, weekday: 'MON', dayType: 'strength', muscles: d.muscles, exercises: d.exercises, cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' })) }));
  }, [{ ...setup, splitDays, completedAt: new Date().toISOString(), acceptedSafety: true }, hist, mkPlan(fingerprint), splitDays]);
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { location.hash = '#/plan'; });
  await page.waitForTimeout(3600);
  const actions = await page.evaluate(() => {
    const row = document.querySelector('.pv-actions-row');
    return [...(row?.querySelectorAll('button') || [])].map(x => ({ text: x.textContent.trim(), disabled: x.disabled }));
  });
  const block = await page.evaluate(() => JSON.parse(localStorage.getItem('forge-ai-plan-v1') || 'null'));
  await page.close();
  return { built, actions, summary: block?.plan?.summary, fingerprint: block?.fingerprint };
};

console.log(`\n  the block waves 365×8 up to ${LOAD[1]}×1 — week one reads ${weekOne} lb, the ceiling ${ceiling} lb`);

/* A best above week one but below the ceiling: mid-block, exactly where the
   athlete is supposed to be. */
{
  const best = oneRm(415, 3);
  /* Let Forge write the block once so the seeded copy carries ITS OWN
     fingerprint — otherwise every load is stale for an unrelated reason and
     the ceiling is never the thing under test. */
  const primed = await run(mkDay(415, 3), mkRows(415, 3));
  const r = await run(mkDay(415, 3), mkRows(415, 3), primed.fingerprint);
  console.log(`\n  a ${best} lb best — past week one, under the ceiling`);
  check('the block is left alone', r.built === 0, `${r.built} rebuild(s)`);
  check('and it still says what it said', r.summary === 'Original block.', String(r.summary));
  const save = r.actions.find(a => /^Save plan$/i.test(a.text));
  check('Save plan is offered', Boolean(save), JSON.stringify(r.actions));
  check('and it can actually be pressed', save ? save.disabled === false : false);
  check('nothing is stuck on Building…', !r.actions.some(a => /Building/.test(a.text)), JSON.stringify(r.actions));
}

/* Past the ceiling: the block genuinely has nothing left to ask. */
{
  const best = oneRm(500, 2);
  const primed = await run(mkDay(500, 2), mkRows(500, 2));
  const r = await run(mkDay(500, 2), mkRows(500, 2), primed.fingerprint);
  console.log(`\n  a ${best} lb best — past the ${ceiling} lb ceiling`);
  check('the block is rebuilt', r.built >= 1, `${r.built} rebuild(s)`);
  check('and the new one is what is stored', r.summary === 'Rebuilt block.', String(r.summary));
}

await b.close();
console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
