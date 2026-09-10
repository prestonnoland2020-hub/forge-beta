/* HIS SEVENTH GOAL.

   "Bodyweight goal needs to be on the goal page." The count on the page says
   7 GOALS and the six lifts and races are all listed; the body-composition
   goal is the one nobody can find. It lives in athlete_settings rather than
   the goals table — the only one of the seven that does — so this loads it the
   way his phone does and looks for the row. */
import { chromium } from 'playwright';
import { setup } from './seed.mjs';

const BASE = 'http://localhost:4194';
let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${d ? ` — ${d}` : ''}`); if (!c) fails++; };

/* The goals table, as it really is. */
const ROWS = [
  { type: 'lift', name: 'Squat', target_value: 500, muscle_group: 'Quads', target_date: '2026-12-30', created_at: '2026-08-13' },
  { type: 'lift', name: 'Bench', target_value: 400, muscle_group: 'Chest', target_date: '2026-12-30', created_at: '2026-08-13' },
  { type: 'lift', name: 'Pull Ups', target_value: 200, muscle_group: 'Back', target_date: '2026-12-31', created_at: '2026-08-13' },
  { type: 'race', name: 'Mile', target_value: 4.983, muscle_group: null, target_date: '2026-12-31', created_at: '2026-08-13' },
  { type: 'race', name: '2 Mile', target_value: 10.983, muscle_group: null, target_date: '2026-12-31', created_at: '2026-08-13' },
  { type: 'race', name: '5K', target_value: 18.983, muscle_group: null, target_date: '2026-12-31', created_at: '2026-08-13' },
  /* Moved here from athlete_settings, where it was the only one of the seven
     that lived somewhere different. */
  { type: 'bodyweight', name: 'Body weight', target_value: 200, muscle_group: null, target_date: '2026-12-31', created_at: '2026-08-13' },
];

/* His weigh-ins, as workout_days holds them: most days since March, 189.7 up
   to 192. This is the evidence the card is supposed to be reading. */
const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const WEIGHTS = [[0, 192], [1, 192], [3, 192], [4, 191], [5, 190], [6, 190], [7, 191], [8, 191],
  [11, 190.8], [13, 190], [16, 190.3], [18, 190], [22, 189.5], [25, 188.9], [28, 190], [32, 195],
  [36, 190], [39, 193], [43, 193], [50, 190], [57, 192], [64, 187], [71, 192], [78, 190],
  [85, 189.5], [92, 188], [99, 191], [106, 189.5], [113, 191], [120, 189.7]];
const DAYS = WEIGHTS.map(([ago, weight], index) => ({
  id: `d${index}`, workout_date: day(ago), title: 'Legs', muscle_groups: ['Quads'], notes: null,
  body_weight: weight, effort: null, recommendation_id: null, split_id: null, split_day_id: null,
  split_position: null, cardio_sessions: [],
  top_sets: index ? [] : [{ id: 't0', position: 1, muscle_group: 'Quads', lift_name: 'Squat', weight: 460, reps: 4, recommendation_top_set_id: null }],
}));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 430, height: 1600 }, deviceScaleFactor: 2 });
page.on('pageerror', error => console.log('  [pageerror]', String(error).slice(0, 160)));
await page.route('**/*', route => {
  const url = route.request().url();
  if (url.startsWith(BASE)) return route.continue();
  const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  if (url.includes('/rest/v1/goals')) return json(ROWS);
  if (url.includes('/rest/v1/workout_days')) return json(DAYS);
  /* athlete_settings is answered EMPTY on purpose: the goal has to survive on
     the table row alone, because that second fetch is the thing that used to
     be the only way it ever appeared. */
  if (url.includes('/rest/v1/athlete_settings')) return json({ setup: null, plan: null, appearance: null, goals: [] });
  if (url.includes('/rest/v1/profiles')) return json({ username: 'preston', display_name: 'Preston Noland', unit_system: 'imperial', onboarding_completed: true, updated_at: new Date().toISOString() });
  if (url.includes('/rest/v1/') || url.includes('/rpc/')) return json([]);
  if (url.includes('/auth/v1/')) return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  return route.abort();
});
await page.addInitScript(s => {
  localStorage.clear();
  const user = { id: 'preview-user', aud: 'authenticated', role: 'authenticated', email: 'p@e.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  localStorage.setItem('sb-test-auth-token', JSON.stringify({ access_token: 't', refresh_token: 't', token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, user }));
  localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
  localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'rolling', minWeeklyMileage: 8, maxWeeklyMileage: 20,
    days: [{ name: 'Legs', weekday: 'MON', dayType: 'strength', muscles: ['Quads'], exercises: ['Squat'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
           { name: 'Chest & Back', weekday: 'TUE', dayType: 'strength', muscles: ['Chest', 'Back'], exercises: ['Bench', 'Pull Ups'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' }] }));
}, { ...setup, completedAt: new Date().toISOString(), acceptedSafety: true,
  splitDays: [{ name: 'Legs', type: 'Strength', muscles: ['Quads'], exercises: ['Squat'] },
              { name: 'Chest & Back', type: 'Strength', muscles: ['Chest', 'Back'], exercises: ['Bench', 'Pull Ups'] }] });
await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { location.hash = '#/goals'; });
await page.waitForTimeout(4000);

const list = await page.evaluate(() => ({
  count: document.querySelector('.compact-goal-list h2')?.textContent || '',
  rows: [...document.querySelectorAll('.compact-goal-row')].map(row => ({
    tag: row.querySelector('.goal-type-tag')?.textContent || '',
    title: row.querySelector('.goal-row-name strong')?.textContent || '',
    target: row.querySelector('.goal-row-target')?.textContent || '',
  })),
}));
console.log('\n  the list');
console.log('   ', JSON.stringify(list, null, 1).replace(/\n\s*/g, ' '));
check('it counts seven', /7 goals/i.test(list.count), list.count);
check('and it draws seven rows', list.rows.length === 7, `${list.rows.length} rows`);
const body = list.rows.find(row => row.tag === 'BODY');
check('one of them is the body-weight goal', Boolean(body), list.rows.map(r => r.tag).join(','));
check('and it arrives with the other six, not on a later fetch of its own',
  Boolean(body), 'athlete_settings answered empty');
check('with its target on it', body?.target?.includes('200'), body?.target || '');

if (body) {
  const index = list.rows.findIndex(row => row.tag === 'BODY');
  await page.evaluate(i => document.querySelectorAll('.compact-goal-select')[i].click(), index);
  await page.waitForTimeout(1200);
  const card = await page.evaluate(() => {
    const detail = document.querySelector('.goal-row-detail');
    return detail ? detail.innerText.replace(/\n+/g, ' | ').slice(0, 400) : '';
  });
  console.log('\n  and what opening it shows');
  console.log('   ', card);
  check('it opens a read-out', card.length > 20, card.slice(0, 80));
  check('which knows what he weighs', /192/.test(card), card.slice(0, 160));
  check('and does not claim there is nothing logged', !/not logged/i.test(card), card.slice(0, 200));
}

await page.close(); await browser.close();
console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
