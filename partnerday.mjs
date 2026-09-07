/* A PARTNER'S DAY IS THE VIEWER'S DAY. The feed used to ask Postgres for
   current_date — UTC — so from early evening westward the server had already
   rolled over and every partner's top set disappeared. The client sends its
   own date now; this pins that it does, and that the row renders the set. */
import { chromium } from 'playwright';
import { setup, goals, days } from './seed.mjs';
const BASE = 'http://localhost:4194';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };
/* The container runs UTC and the page runs Chicago — which is exactly the
   split that produced the bug, so the expected date has to come from the
   page's timezone, not this process's. */
const TZ = 'America/Chicago';
const localDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

let sentDate = null;
const page = await browser.newPage({ viewport: { width: 430, height: 950 }, timezoneId: TZ });
await page.route('**/*', async route => {
  const url = route.request().url();
  if (url.startsWith(BASE)) return route.continue();
  const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  if (url.includes('/rpc/forge_partner_feed')) {
    sentDate = JSON.parse(route.request().postData() || '{}').p_today ?? null;
    return json([{ friend_id: 'c1', username: 'coltoneilers', display_name: 'Colton Eilers',
      block_week: 1, block_weeks: 10, wave_slot: 2, trained_today: true, last_trained: localDay(),
      top_lift: 'Smith Machine Shoulder Press', top_weight: 215, top_reps: 5, cardio_summary: null }]);
  }
  if (url.includes('/rpc/forge_partner_requests')) return json([]);
  if (url.includes('/rest/v1/profiles')) return json({ username: 'prestonnoland', display_name: 'Preston Noland',
    unit_system: 'imperial', onboarding_completed: true, updated_at: new Date().toISOString(), discoverable: true });
  if (/\/rest\/v1\/(goals|exercise_library|workout_days|training_splits)/.test(url)) return json([]);
  if (url.includes('/rest/v1/') || url.includes('/auth/v1/')) return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  return route.abort();
});
await page.addInitScript(([s, g, d]) => {
  localStorage.clear();
  const user = { id: 'preview-user', aud: 'authenticated', role: 'authenticated', email: 'p@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  localStorage.setItem('sb-test-auth-token', JSON.stringify({ access_token: 't', refresh_token: 't', token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, user }));
  localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
  localStorage.setItem('forge-goals', JSON.stringify(g));
  localStorage.setItem('forge-workout-history-v1', JSON.stringify(d));
  localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'rolling', days: [
    { name: 'Chest & Back', weekday: 'MON', dayType: 'strength', muscles: ['Chest'], exercises: ['Bench Press'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' }] }));
  localStorage.setItem('forge-appearance-v5', JSON.stringify({ theme: 'dark', ground: 'carbon', accent: 'signal', icon: 'match' }));
}, [setup, goals, days]);
await page.goto(`${BASE}/#/?t=1`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2600);

check('the feed is asked for the device\'s own day', sentDate === localDay(), `sent ${sentDate}, device ${localDay()}`);
const card = await page.evaluate(() => document.querySelector('.partners-card')?.innerText.replace(/\n/g, ' | ') || '');
check('the partner card is on Today', /Colton Eilers/.test(card), card);
check('and it shows the set they logged', /215 lb × 5/.test(card), card);
check('marked as trained', /✓/.test(card), card);
await browser.close();
console.log(fails ? `\n${fails} check(s) failed` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
