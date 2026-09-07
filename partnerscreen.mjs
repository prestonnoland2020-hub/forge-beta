/* THE PARTNER SCREEN, ON PRESTON'S REAL FIGURES.

   Every stub below is what the live database actually returns for him and
   Adam: the head-to-head week, the metric list, and the corrected sustained
   pace series with the walk excluded. */
import { chromium } from 'playwright';
import { setup, goals, days } from './seed.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const BASE = 'http://localhost:4194';
mkdirSync('/tmp/tour', { recursive: true });
let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

const FEED = [{ friend_id: 'a1', username: 'adamgomez', display_name: 'Adam Gomez', block_week: 1, block_weeks: 10, wave_slot: 4,
  trained_today: true, last_trained: '2026-09-07', top_lift: null, top_weight: null, top_reps: null, cardio_summary: 'Run · 2.27 mi' }];
const WEEK = [
  { side: 'mine', days_trained: 1, miles: 1.0, top_sets: 1, streak: 2 },
  { side: 'theirs', days_trained: 1, miles: 2.3, top_sets: 0, streak: 8 },
];
/* Oldest first, as the RPC returns it. */
const PACE = [
  ['2026-06-15', null, '7.3'], ['2026-06-22', null, '7.4'], ['2026-06-29', null, '5.7'],
  ['2026-07-06', '8.5', '6.8'], ['2026-07-13', null, '6.3'], ['2026-07-20', '8.4', '7.9'],
  ['2026-07-27', '5.3', '7.8'], ['2026-08-03', '10.0', '7.5'], ['2026-08-17', '7.1', '5.9'],
  ['2026-08-24', '5.8', null], ['2026-08-31', '7.5', '6.4'], ['2026-09-07', null, '9.3'],
].map(([bucket, mine, theirs]) => ({ bucket, mine, theirs }));

for (const theme of ['dark', 'light']) {
  const page = await browser.newPage({ viewport: { width: 430, height: 1500 }, deviceScaleFactor: 2 });
  const PROFILE = { username: 'prestonnoland', display_name: 'Preston Noland', birth_date: '1999-01-01', height_cm: 183,
    starting_weight: 191, current_weight: 191, unit_system: 'imperial', experience_level: 'advanced',
    primary_goal: 'hybrid', equipment: [], preferred_training_days: [], onboarding_completed: true, updated_at: new Date().toISOString() };
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(BASE)) return route.continue();
    const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.includes('/rpc/forge_partner_feed')) return json(FEED);
    if (url.includes('/rpc/forge_partner_week')) return json(WEEK);
    if (url.includes('/rpc/forge_partner_requests')) return json([]);
    if (url.includes('/rpc/forge_partner_metrics')) return json([
      { key: 'run:pace', label: 'Best sustained pace', kind: 'endurance', mine: true, theirs: true },
      { key: 'run:miles', label: 'Weekly miles', kind: 'endurance', mine: true, theirs: true },
      { key: 'lift:bench', label: 'Bench', kind: 'strength', mine: true, theirs: true },
    ]);
    if (url.includes('/rpc/forge_partner_series')) return json(PACE);
    if (url.includes('/rest/v1/profiles')) return json(PROFILE);
    if (/\/rest\/v1\/(goals|exercise_library|workout_days|training_splits|athlete_notes|cardio_sessions|top_sets)/.test(url)) return json([]);
    if (url.includes('/rest/v1/') || url.includes('/auth/v1/')) return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    return route.abort();
  });
  await page.addInitScript(([s, g, d, t]) => {
    localStorage.clear();
    const user = { id: 'preview-user', aud: 'authenticated', role: 'authenticated', email: 'p@e.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
    localStorage.setItem('sb-test-auth-token', JSON.stringify({ access_token: 't', refresh_token: 't', token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, user }));
    localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
    localStorage.setItem('forge-goals', JSON.stringify(g));
    localStorage.setItem('forge-workout-history-v1', JSON.stringify(d));
    localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'rolling', days: [
      { name: 'Chest & Back', weekday: 'MON', dayType: 'strength', muscles: ['Chest','Back'], exercises: ['Bench Press'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' }] }));
    localStorage.setItem('forge-appearance-v5', JSON.stringify({ theme: t, ground: 'carbon', accent: 'signal', icon: 'match' }));
  }, [setup, goals, days, theme]);
  page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/partners/a1?t=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);
  writeFileSync(`/tmp/tour/partner-new-${theme}.png`, await page.screenshot({ fullPage: true }));
  console.log(`\n  ${theme}`);
  const rows = await page.evaluate(() => [...document.querySelectorAll('.h2h')].map(row => ({
    label: row.querySelector('.h2h-label').textContent,
    mine: row.querySelector('.h2h-mine b').textContent,
    theirs: row.querySelector('.h2h-theirs b').textContent,
    barWidth: Math.round(row.querySelector('.h2h-bar').getBoundingClientRect().width),
    fills: [...row.querySelectorAll('.h2h-bar i')].map(i => Math.round(i.getBoundingClientRect().width)),
  })));
  check('the week shows all four comparisons', rows.length === 4, rows.map(r => r.label).join(', '));
  /* The bars only mean anything if they are the same length in every row. */
  check('every bar is exactly as wide as every other', new Set(rows.map(r => r.barWidth)).size === 1, rows.map(r => r.barWidth).join('/'));
  const streak = rows.find(r => r.label === 'Day streak');
  check('a 2-vs-8 streak splits the bar 1:4, not down the middle',
    streak && Math.abs(streak.fills[1] / (streak.fills[0] + streak.fills[1]) - 0.8) < 0.05,
    streak && `${streak.fills[0]}px vs ${streak.fills[1]}px`);
  const sets = rows.find(r => r.label === 'Top sets');
  check('a zero draws nothing at all rather than a sliver', sets && sets.fills[1] === 0, sets && `${sets.fills[1]}px`);

  const text = await page.evaluate(() => document.body.innerText);
  /* The whole point of the rebuild: these are the numbers that used to be
     nonsense. +12:12 was his walk against a run six months earlier. */
  check('the trend is no longer the walk-versus-a-run figure', !text.includes('12:12'));
  check('his pace trend reads as an improvement', /YOUR TREND\s*\n−1:16/.test(text), (text.match(/YOUR TREND\s*\n[^\n]*/) || [''])[0].replace('\n', ' '));
  check("and Adam's reads as a slide", /ADAM TREND\s*\n\+0:53/.test(text), (text.match(/ADAM TREND\s*\n[^\n]*/) || [''])[0].replace('\n', ' '));
  check('best is the repeatable one, not the fluke 5:18 week', text.includes('5:48') && !text.includes('5:18'));
  check('the chart is labelled as progress, not raw numbers', text.includes('against your own starting point'));
  check('and its axis is anchored at the shared start', text.includes('start'));
  await page.close();
}
await browser.close();
console.log(fails ? `\n${fails} check(s) failed` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
