/* SEVEN PEOPLE, EVERY SCREEN.

   The audits found most of their bugs by reading. This finds the rest by
   opening the app as each kind of athlete who will actually sign up and
   looking at what is on the screen — because the failure mode that matters
   here is not a thrown error, it is a number that renders as `NaN`, a date
   that renders as `Invalid Date`, or a card that claims the athlete runs
   twelve miles a week on the day they installed the app.

   The seven:
     1  a brand-new account with nothing logged at all
     2  a returning athlete with months of history
     3  cardio only — an endurance goal, no lifts ever
     4  strength only — no cardio ever
     5  one body-composition goal and nothing else (the gate used to bounce
        this athlete back into setup forever, on every fresh device)
     6  the legal pages, with no session at all
     7  the billing screen, on the free tier

   Run:  node usercases.mjs
   (expects `npx vite preview --port 4191` already serving a fresh build) */

import { chromium } from 'playwright';
import { setup, goals, days } from './seed.mjs';

const BASE = 'http://localhost:4193';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let fails = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${ok ? '' : '\n          → ' + detail}`);
  if (!ok) fails++;
};

/* The strings that mean a calculation escaped without a guard. Each one is a
   real bug the reader would see: -Infinity from Math.max of an empty array,
   NaN from dividing by a zero count, Invalid Date from a mis-parsed day. */
const POISON = ['NaN', 'Infinity', 'Invalid Date', 'undefined', '[object Object]', 'null lb', 'null mi'];

const splitDays = [
  { name: 'Chest & Back', weekday: 'MON', dayType: 'strength', muscles: ['Chest', 'Back'], exercises: ['Bench Press'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
  { name: 'Quality Cardio', weekday: 'TUE', dayType: 'cardio', muscles: [], exercises: [], cardioPolicy: 'forge', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '45', maxDuration: '45' },
  { name: 'Lower Body', weekday: 'WED', dayType: 'strength', muscles: ['Quads', 'Hamstrings', 'Glutes'], exercises: ['Squat'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
];

const ROUTES = ['/', '/workout', '/plan', '/history', '/insights', '/goals', '/coach', '/exercises', '/profile'];

const browser = await chromium.launch({ executablePath: CHROME });

/* The sandbox has no route to fonts.googleapis.com, and a blocked font request
   hangs until the socket gives up — which is minutes per page, not seconds.
   Everything under test is local, so anything off-origin is refused fast. */
async function offline(page) {
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(BASE) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    return route.abort();
  });
}

async function visit(route, state) {
  const page = await browser.newPage({ viewport: { width: 390, height: 950 } });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error).slice(0, 200)));
  await offline(page);
  await page.addInitScript(seed => {
    localStorage.clear();
    for (const [key, value] of Object.entries(seed)) {
      if (value !== undefined) localStorage.setItem(key, JSON.stringify(value));
    }
  }, state);
  /* THE LAUNCH REDIRECT SENDS EVERY COLD OPEN TO TODAY, which is right for
     athletes and fatal for a test harness: without this, a suite that thinks
     it is checking nine screens is checking Today nine times. A route carrying
     a query string is treated as a deep link someone followed on purpose and
     is left alone — that is the documented escape hatch, so use it. */
  const deepLink = route.includes('?') ? route : `${route}?t=1`;
  await page.goto(`${BASE}/#${deepLink}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);
  const landed = await page.evaluate(() => location.hash);
  const text = await page.evaluate(() => document.body.innerText);
  return { page, errors, text, landed };
}

/* An athlete's whole local world, so each persona is one object. */
const world = ({ history = [], athleteGoals = goals, plan = splitDays, profile = setup }) => ({
  'forge-athlete-setup-v1:preview-user': profile,
  'forge-goals': athleteGoals,
  'forge-training-plan-v1': plan ? { name: 'Split', rhythm: 'rolling', minWeeklyMileage: 0, maxWeeklyMileage: 0, days: plan } : undefined,
  'forge-workout-history-v1': history,
});

async function persona(name, state, extra) {
  console.log(`\n${name}`);
  for (const route of ROUTES) {
    const { page, errors, text, landed } = await visit(route, state);
    const poison = POISON.filter(bad => text.includes(bad));
    /* Assert we are actually on the screen under test. A silent redirect is
       how a suite reports nine passes for one page. */
    const arrived = landed.startsWith(`#${route}`);
    check(`${route.padEnd(11)} renders clean`,
      arrived && !errors.length && !poison.length,
      [!arrived ? `redirected to ${landed}` : '', errors.length ? `threw: ${errors[0]}` : '', poison.length ? `shows ${poison.join(', ')}` : ''].filter(Boolean).join(' | '));
    if (extra) await extra(route, text, check);
    await page.close();
  }
}

/* ---------------------------------------------------------------- 1. new */
await persona('A brand-new account, nothing logged', world({ history: [] }), async (route, text) => {
  if (route === '/profile') {
    /* The single loudest lie the app used to tell: a runner's baseline of 12
       mi/week and a 4-mile long run, stated as fact under a heading that
       promises nothing is estimated, on an account with zero workouts. */
    const invented = /WEEKLY RUNNING\s*\n?\s*(?!0\s)(\d+(\.\d+)?)\s*(mi|km)/i.exec(text);
    check('             Profile does not invent a running baseline', !invented,
      invented ? `claims "${invented[0].replace(/\n/g, ' ')}" with no logged runs` : '');
  }
  if (route === '/insights') {
    check('             Progress has a real empty state',
      /nothing to measure yet/i.test(text),
      'no empty card — just zeros and negations');
  }
  if (route === '/') {
    /* The engine prescribes no top sets on a cardio day by design; the row
       demanding one was excluded for rest days only. */
    const cardioDay = /Quality Cardio/i.test(text);
    check('             no strength "Fix" prompt on a cardio day',
      !cardioDay || !/Forge needs a strength exercise mapped/i.test(text),
      'demands a lift for a day that prescribes none');
  }
});

/* ----------------------------------------------------------- 2. returning */
await persona('A returning athlete with months of history', world({ history: days }));

/* --------------------------------------------------------- 3. cardio only */
const runner = { ...setup, primaryFocus: 'Endurance' };
const runGoal = [{ type: 'Endurance', title: '5K goal', target: '22:00', date: '2026-12-01', connection: 'Cardio only', exercise: '5K', metric: 'Finish time', unit: 'mm:ss', trackingSource: 'Workout history' }];
await persona('Cardio only — an endurance goal, no lifts ever',
  world({ history: days.filter(day => !day.topSets?.length), athleteGoals: runGoal, profile: runner }));

/* ------------------------------------------------------- 4. strength only */
const lifter = { ...setup, primaryFocus: 'Strength' };
const liftGoal = [{ type: 'Strength', title: '425 lb Squat', target: '425 lb', date: '2026-12-01', connection: 'Lower Body', exercise: 'Squat', metric: 'Real 1RM', unit: 'lb', trackingSource: 'Workout history' }];
await persona('Strength only — no cardio ever',
  world({ history: days.filter(day => !day.hasCardio), athleteGoals: liftGoal, profile: lifter }));

/* ------------------------------------------------- 5. body-composition only */
const bodyGoal = [{ type: 'Body Composition', title: '185 lb body weight', target: '185 lb', date: '2026-12-01', connection: 'No fixed day', exercise: '', metric: 'Body weight', unit: 'lb', trackingSource: 'Workout history' }];
console.log('\nOne body-composition goal and nothing else');
{
  const { page, errors, text } = await visit('/', world({ history: days, athleteGoals: bodyGoal }));
  /* The gate marked itself "hydrated" as soon as the goals TABLE answered —
     and body goals are deliberately not in that table. The athlete was thrown
     back into setup on every fresh device, with their goal appearing a second
     later. */
  check('  the goal gate does not bounce them into setup',
    !/Ready in three steps|Name what the training is for/i.test(text),
    'redirected to onboarding despite having a goal');
  check('  and Today renders clean', !errors.length && !POISON.some(bad => text.includes(bad)),
    errors[0] || POISON.filter(bad => text.includes(bad)).join(', '));
  await page.close();
}

/* -------------------------------------------------------------- 6. legal */
console.log('\nThe legal pages, with no session');
for (const route of ['/legal/privacy', '/legal/terms']) {
  const page = await browser.newPage({ viewport: { width: 390, height: 950 } });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error).slice(0, 200)));
  await offline(page);
  await page.addInitScript(() => localStorage.clear());
  await page.goto(`${BASE}/#${route}?t=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const text = await page.evaluate(() => document.body.innerText);
  /* Guideline 5.1.1(i): a reviewer has to reach these without an account. The
     launch redirect used to send every unknown route to Today. */
  check(`  ${route} loads signed out`,
    !errors.length && text.length > 600 && !/Show up\.|Ready in three steps/i.test(text),
    errors[0] || `only ${text.length} chars — probably redirected`);
  check(`  ${route} says how to delete an account`,
    !/privacy/.test(route) || /Delete my account/i.test(text),
    'no deletion instructions in the privacy policy');
  await page.close();
}

/* ------------------------------------------------------------ 7. billing */
console.log('\nThe billing screen');
{
  const { page, errors, text } = await visit('/profile?view=billing', world({ history: days }));
  /* Billing is a Settings screen now: the header names it and the gear's
     list links to it, so the URL alone has to open it. */
  const opened = await page.evaluate(() => /Plan & billing/i.test(document.querySelector('.topbar h1')?.textContent || ''));
  await page.waitForTimeout(900);
  const billing = await page.evaluate(() => document.body.innerText);
  check('  the billing screen opens under Settings', opened, 'header did not name it');
  /* Which copy is correct depends on the tier. The preview build runs as the
     unmetered owner account, where the upgrade offer is deliberately absent —
     asserting the free-tier wording there would be asserting a bug. */
  const owner = /owner account/i.test(billing);
  check('  it states the plan honestly for this tier',
    owner
      ? /No limits apply/i.test(billing)
      : /Forge (Pro|Free)/i.test(billing) && /What stays free|never metered/i.test(billing),
    owner ? 'owner account without the no-limits line' : 'no plan status or free-tier explanation');
  check('  account deletion is reachable in-app (Guideline 5.1.1(v))',
    /Delete my account/i.test(billing),
    'no in-app deletion control — this is an automatic rejection');
  check('  renders clean', !errors.length && !POISON.some(bad => billing.includes(bad)),
    errors[0] || POISON.filter(bad => billing.includes(bad)).join(', '));
  await page.close();
  void text;
}

await browser.close();
console.log(`\n${fails ? `${fails} FAILING` : 'All checks passed'}`);
process.exit(fails ? 1 : 0);
