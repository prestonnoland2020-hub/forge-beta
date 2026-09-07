/* The partner surfaces, with a partner who has trained and one who has not.
   The RPC needs a real server, so the feed is stubbed at the network edge —
   the shapes are exactly what forge_partner_feed returns. */
import { chromium } from 'playwright';
import { setup, goals, days } from './seed.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const BASE = 'http://localhost:4194';
mkdirSync('/tmp/tour', { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const FEED = [
  { friend_id: 'a1', username: 'adamgomez', display_name: 'Adam Gomez', block_week: 3, block_weeks: 10, wave_slot: 2,
    trained_today: true, last_trained: new Date().toISOString().slice(0,10), top_lift: 'Squat', top_weight: 455, top_reps: 4, cardio_summary: 'Run · 4 miles · 36:00 · 9:00 /mi' },
  { friend_id: 'c1', username: 'coltoneilers', display_name: 'Colton Eilers', block_week: 1, block_weeks: 10, wave_slot: 0,
    trained_today: false, last_trained: new Date(Date.now() - 2*86400000).toISOString().slice(0,10), top_lift: null, top_weight: null, top_reps: null, cardio_summary: null },
];
async function shot(route, theme, name, width = 430, typed = '') {
  const page = await browser.newPage({ viewport: { width, height: 950 }, deviceScaleFactor: 2 });
  /* Playwright matches the most recently registered route first, so this is
     one handler rather than a stack of them: the app's own files pass through,
     Supabase gets canned answers, everything else is refused. */
  const PROFILE = { username: 'prestonnoland', display_name: 'Preston Noland', birth_date: '1999-01-01', height_cm: 183,
    starting_weight: 191, current_weight: 191, unit_system: 'imperial', experience_level: 'advanced',
    primary_goal: 'hybrid', equipment: [], preferred_training_days: [], onboarding_completed: true, updated_at: new Date().toISOString() };
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(BASE)) return route.continue();
    const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.includes('/rpc/forge_partner_feed')) return json(FEED);
    if (url.includes('/rpc/forge_partner_requests')) return json([]);
    if (url.includes('/rpc/forge_partner_metrics')) return json([
      { key: 'lift:bench', label: 'Bench', kind: 'strength', mine: true, theirs: true },
      { key: 'lift:squat', label: 'Squat', kind: 'strength', mine: true, theirs: true },
      { key: 'lift:hack squat', label: 'Hack Squat', kind: 'strength', mine: true, theirs: true },
      { key: 'run:miles', label: 'Weekly miles', kind: 'endurance', mine: true, theirs: false },
      { key: 'run:pace', label: 'Average pace', kind: 'endurance', mine: true, theirs: false },
    ]);
    if (url.includes('/rpc/forge_partner_series')) return json([
      { bucket: '2026-07-06', mine: '360.0', theirs: null },
      { bucket: '2026-07-20', mine: '365.8', theirs: null },
      { bucket: '2026-07-27', mine: null, theirs: '280.6' },
      { bucket: '2026-08-03', mine: '372.4', theirs: '272.0' },
      { bucket: '2026-08-10', mine: '365.8', theirs: '280.6' },
      { bucket: '2026-08-17', mine: '369.0', theirs: '270.0' },
      { bucket: '2026-08-24', mine: '365.8', theirs: '291.7' },
      { bucket: '2026-08-31', mine: '380.1', theirs: '290.3' },
    ]);
    if (url.includes('/rpc/forge_search_athletes')) return json([
      { id: 'a1', username: 'adamgomez', display_name: 'Adam Gomez', relation: 'partner' },
      { id: 'g1', username: 'andrewgomez', display_name: 'Andrew Gomez', relation: 'none' },
      { id: 'r1', username: 'rileywells', display_name: 'Riley Wells', relation: 'requested' },
    ]);
    if (url.includes('/rest/v1/profiles')) return json(PROFILE);
    /* PostgREST answers a maybeSingle with an object or nothing at all, so a
       harness that returns [] everywhere invents shapes the app never sees. */
    if (/\/rest\/v1\/(goals|exercise_library|workout_days|training_splits|athlete_notes|cardio_sessions|top_sets)/.test(url)) return json([]);
    if (url.includes('/rest/v1/') || url.includes('/auth/v1/')) return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    return route.abort();
  });
  await page.addInitScript(([s, g, d, t]) => {
    localStorage.clear();
    /* A signed-in athlete: supabase-js restores this session from storage
       without a network round trip, which is all this harness needs. */
    const user = { id: 'preview-user', aud: 'authenticated', role: 'authenticated', email: 'preston@example.com', app_metadata: {}, user_metadata: { full_name: 'Preston Noland' }, created_at: new Date().toISOString() };
    localStorage.setItem('sb-test-auth-token', JSON.stringify({
      access_token: 'test', refresh_token: 'test', token_type: 'bearer',
      expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, user,
    }));
    localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
    localStorage.setItem('forge-goals', JSON.stringify(g));
    localStorage.setItem('forge-workout-history-v1', JSON.stringify(d));
    localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'rolling', days: [
      { name: 'Chest & Back', weekday: 'MON', dayType: 'strength', muscles: ['Chest','Back'], exercises: ['Bench Press'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
    ] }));
    localStorage.setItem('forge-appearance-v5', JSON.stringify({ theme: t, ground: 'carbon', accent: 'signal', icon: 'match' }));
  }, [setup, goals, days, theme]);
  page.on('console', m => { const t = m.text(); if (/could not render|Error|error/i.test(t) && !/Failed to load/.test(t)) console.log('  [c]', t.replace(/\n/g, ' ').slice(0, 260)); });
  
  await page.goto(`${BASE}/#${route}${route.includes('?') ? '&' : '?'}t=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2400);
  if (typed) { await page.fill('#partner-username', typed); await page.waitForTimeout(900); }
  writeFileSync(`/tmp/tour/${name}.png`, await page.screenshot({ fullPage: true }));
  const text = await page.evaluate(() => document.body.innerText);
  await page.close();
  return text;
}
const home = await shot('/', 'dark', 'partners-home');
console.log('--- TODAY CARD ---');
console.log((home.match(/TRAINING PARTNERS[\s\S]{0,320}/i) || ['(card not on Today)'])[0]);
const page = await shot('/partners', 'dark', 'partners-page', 430, 'adm gomez');
console.log('\n--- PARTNER SCREEN ---');
console.log(page.slice(0, 700));
await shot('/partners', 'light', 'partners-page-light', 430, 'adm gomez');
const detail = await shot('/partners/a1', 'dark', 'partner-detail');
console.log('\n--- PARTNER DETAIL ---');
console.log(detail.split('AI')[0].slice(0, 700));
await shot('/partners/a1', 'light', 'partner-detail-light');
await browser.close();
