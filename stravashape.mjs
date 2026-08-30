/* WHAT THE DAY IS DECIDES WHAT IT IS ASKED.

   The review card asked every synced day the same three questions. A run has
   no split day and no top set, so two of the three were asking the athlete to
   answer nothing before they could dismiss the card — and the card would not
   save until one of them was answered.

   A gym session does have a split day, and it is almost always the one Forge
   already had up for that date. Demanding it is asking the athlete to repeat
   what the app already decided. And when the day already carries logged top
   sets, assigning the day IS the whole job: there is nothing to re-enter. */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { setup, goals } from './seed.mjs';

let fails = 0;
const check = (l, c, d = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : '   → ' + d}`); if (!c) fails++; };

const src = readFileSync('src/components/StravaReviewModal.tsx', 'utf8');
check('the shape of the day is derived, not assumed', /const cardioOnly = /.test(src));
check('what the day trained outranks what Forge expected', /if \(trained\.size\)/.test(src) && src.indexOf('if (trained.size)') < src.indexOf('recommendation.splitDay.name'));
check("sets already on the day count toward its muscles", /const loggedMuscles = loggedTopSets\.flatMap/.test(src));
check('a lift inside a synced day still counts as strength', /cardioClass\(session\.activity \|\| ''\) !== 'strength'/.test(src));
check("the day Forge had up is what a gym session matches to", /recommendation\.splitDay\.name/.test(src));
check('and it is folded, so Legs 2 matches Legs', /splitDayKey\(day\.name\) === splitDayKey\(recommendation\.splitDay\.name\)/.test(src));

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const today = new Date();
const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

const splitDays = [
  { name: 'Chest & Back', weekday: 'MON', dayType: 'strength', muscles: ['Chest', 'Back'], exercises: ['Bench'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
  { name: 'Legs', weekday: 'TUE', dayType: 'strength', muscles: ['Quads', 'Hamstrings', 'Glutes'], exercises: ['Squat'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
];

const open = async record => {
  const p = await b.newPage({ viewport: { width: 390, height: 950 } });
  p.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 180)));
  await p.addInitScript(([s, g, day, sd, rec]) => {
    localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
    localStorage.setItem('forge-goals', JSON.stringify(g));
    localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'rolling', minWeeklyMileage: 10, maxWeeklyMileage: 25, days: sd }));
    localStorage.setItem('forge-workout-history-v1', JSON.stringify([rec]));
    localStorage.setItem('forge-strava-review-v1', JSON.stringify([day]));
    localStorage.setItem('forge-split-cycle-v1', JSON.stringify({ nextPosition: 1, revision: 1 }));
  }, [setup, goals, iso, splitDays, record]);
  await p.goto('http://localhost:4191/#/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2600);
  return p;
};
const sheetText = p => p.evaluate(() => document.querySelector('.strava-review-sheet')?.innerText.replace(/\n/g, ' | ') || '');
const has = (p, sel) => p.evaluate(s => Boolean(document.querySelector(s)), sel);
const selects = p => p.evaluate(() => [...document.querySelectorAll('.strava-review-sheet select')].length);

/* 1. A RUN. Strava named it "Morning Weight Training", but it is a 1.09 mile
      run at 8:48/mi — nothing about it is a split day or a top set. */
{
  const run = { id: 'r1', date: iso, title: 'Morning Weight Training', muscles: ['Cardio'], hasCardio: true, topSets: [],
    cardioSessions: [{ id: 's1', structure: 'steady', activity: 'Run', summary: 'Run · 1.09 mi · 9:36 · 8:48 /mi',
      prescription: { legacyIntervals: [{ cardioType: 'Run', unit: 'miles', distance: 1.09, time: 9.6 }], distanceUnit: 'miles' } }] };
  const p = await open(run);
  check('a synced run still takes over the screen', await has(p, '.strava-review-sheet'));
  const text = await sheetText(p);
  check('it does not ask a run for a split day', !/SPLIT DAY/i.test(text), text.slice(0, 200));
  check('it does not ask a run for a top set', !/TOP SET/i.test(text), text.slice(0, 200));
  check('no dropdown is left to answer', await selects(p) === 0, String(await selects(p)));
  check('it still asks what the session actually was', /DESCRIBE IT/i.test(text) && await has(p, '.strava-review-sheet textarea'));
  check('the lede talks about the session, not the split', /intervals/i.test(text), text.slice(0, 200));
  const saveDisabled = () => p.evaluate(() => [...document.querySelectorAll('.strava-review-sheet button.button')].find(x => /Save this day/.test(x.textContent))?.disabled);
  check('nothing to save until the athlete describes it', await saveDisabled() === true);
  check('and Looks right still dismisses it', await p.evaluate(() => { const el = [...document.querySelectorAll('.strava-review-sheet button')].find(x => /Looks right/.test(x.textContent)); if (!el) return false; el.click(); return true; }));
  await p.waitForTimeout(700);
  check('dismissing closes the takeover', !(await has(p, '.strava-review-backdrop')));
  await p.close();
}

/* 2. A GYM SESSION. No cardio on it — Forge should already know which day. */
{
  const lift = { id: 'g1', date: iso, title: 'Morning Weight Training', muscles: [], hasCardio: false, topSets: [], cardioSessions: [] };
  const p = await open(lift);
  const text = await sheetText(p);
  check('a gym session is asked for its split day', /SPLIT DAY/i.test(text), text.slice(0, 200));
  const chosen = await p.evaluate(() => { const el = document.querySelectorAll('.strava-review-sheet select')[0]; return el?.options[el.selectedIndex]?.text; });
  check("it is prefilled with the day Forge had up", chosen === 'Chest & Back', String(chosen));
  check('and says so, so the athlete knows it can be changed', /change it if that is wrong/i.test(text), text.slice(0, 260));
  check('it can still be overridden', await p.evaluate(() => [...document.querySelectorAll('.strava-review-sheet select')[0].options].map(o => o.text).includes('Legs')));
  const saveDisabled = () => p.evaluate(() => [...document.querySelectorAll('.strava-review-sheet button.button')].find(x => /Save this day/.test(x.textContent))?.disabled);
  check('the prefilled day is already an answer', await saveDisabled() === false);
  check('a top set is still offered for a bare gym session', /TOP SET/i.test(text), text.slice(0, 240));

  await p.evaluate(() => [...document.querySelectorAll('.strava-review-sheet button.button')].find(x => /Save this day/.test(x.textContent)).click());
  await p.waitForTimeout(1200);
  const saved = await p.evaluate(d => JSON.parse(localStorage.getItem('forge-workout-history-v1') || '[]').find(x => x.date === d), iso);
  check('saving takes the matched day', saved?.title === 'Chest & Back', saved?.title);
  check('and its position in the cycle', saved?.splitPosition === 1, String(saved?.splitPosition));
  await p.close();
}

/* 3. A GYM SESSION WITH SETS ALREADY LOGGED. Assigning the day is the job. */
{
  const withSets = { id: 'g2', date: iso, title: 'Morning Weight Training', muscles: ['Chest'], hasCardio: false, cardioSessions: [],
    topSets: [{ id: 't1', muscle: 'Chest', lift: 'Bench', weight: 315, reps: 5, completed: true, calculatedMax: 368 }] };
  const p = await open(withSets);
  const text = await sheetText(p);
  check('a day with sets is not asked for another one', !/No top set/i.test(text), text.slice(0, 240));
  check('it says what is already logged', /ALREADY LOGGED/i.test(text) && /Bench 315×5/.test(text), text.slice(0, 260));
  check('and what assigning the day will do', /ties them to Chest & Back/i.test(text), text.slice(0, 300));
  check('only the split day is left to answer', await selects(p) === 1, String(await selects(p)));

  await p.evaluate(() => [...document.querySelectorAll('.strava-review-sheet button.button')].find(x => /Save this day/.test(x.textContent)).click());
  await p.waitForTimeout(1200);
  const saved = await p.evaluate(d => JSON.parse(localStorage.getItem('forge-workout-history-v1') || '[]').find(x => x.date === d), iso);
  check('the day takes its split identity', saved?.title === 'Chest & Back' && saved?.splitPosition === 1, `${saved?.title} / ${saved?.splitPosition}`);
  check('the sets that were there are still there', saved?.topSets?.length === 1 && saved.topSets[0].lift === 'Bench', JSON.stringify(saved?.topSets));
  check('and none were duplicated', saved?.topSets?.length === 1, String(saved?.topSets?.length));
  /* The day Preston actually had: a lift logged on it, and it came back
     reading "Cardio" and nothing else. */
  check('a day that was lifted on does not read as cardio', (saved?.muscles || []).includes('Chest'), JSON.stringify(saved?.muscles));
  await p.close();
}

await b.close();
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
