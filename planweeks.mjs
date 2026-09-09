/* THE SQUARES AT THE TOP ARE THE WEEK PICKER.

   Ten pips across the top of the Plan tab read as tabs on every phone anyone
   owns, and they were a picture: they showed which week you were in and did
   nothing when pressed. The only route to week four was a "The whole block"
   accordion at the very bottom of the page — two ways to the same ten weeks,
   one inert and one invisible.

   Now the pips drive the screen, the week itself swipes, the tab opens on the
   week you are in, and the accordion is gone. */
import { chromium } from 'playwright';
import { setup } from './seed.mjs';

const BASE = 'http://localhost:4193';
let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : '   → ' + d}`); if (!c) fails++; };
const oneRm = (w, r) => Math.round(w * (1 + r / 30));
const today = new Date().toISOString().slice(0, 10);
/* A month back, so the block is genuinely mid-flight and "the week you are in"
   is week five rather than week one. */
const startDate = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); })();

const splitDays = [{ name: 'Legs', type: 'Strength', muscles: ['Quads'], exercises: ['Squat'] }];
const WAVE = [8, 6, 4, 2, 1, 8, 6, 4, 2, 1];
const LOAD = { 8: 340, 6: 365, 4: 385, 2: 405, 1: 465 };
const mkWeek = n => ({ week: n, phase: 'Build', mileage: 0, longRunMiles: 0, longRunPace: '', quality: '', qualityPace: '',
  qualityDay: '', longRunDay: '', easyDays: [], easyMinutes: 0, easyPace: '',
  topSets: [{ splitDay: 'Legs', exercise: 'Squat', weight: LOAD[WAVE[n - 1]], reps: WAVE[n - 1] }], note: 'Wave.' });
const storedPlan = { plan: { summary: 'Block.', easyPace: '', weeks: Array.from({ length: 10 }, (_, i) => mkWeek(i + 1)) },
  generatedAt: new Date().toISOString(), startDate, fingerprint: 'seeded', blockWeeks: 10, saved: true, savedAt: new Date().toISOString() };
const hist = [{ id: 'd1', date: today, title: 'Legs', muscles: ['Quads'],
  topSets: [{ id: 'd1t', muscle: 'Quads', lift: 'Squat', weight: 405, reps: 3, completed: true, calculatedMax: oneRm(405, 3) }],
  lift: 'Squat', weight: 405, reps: 3, calculatedMax: oneRm(405, 3), hasCardio: false, cardioSessions: [] }];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await b.newPage({ viewport: { width: 390, height: 1200 }, hasTouch: true });
await page.addInitScript(([s, h, sd, p]) => {
  localStorage.clear();
  localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
  localStorage.setItem('forge-goals', JSON.stringify([{ type: 'Strength', title: 'Squat 500', exercise: 'Squat', metric: 'Real 1RM', target: '500', unit: 'lb', date: '2026-12-30', connection: '' }]));
  localStorage.setItem('forge-workout-history-v1', JSON.stringify(h));
  localStorage.setItem('forge-ai-plan-v1', JSON.stringify(p));
  localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'rolling', minWeeklyMileage: 0, maxWeeklyMileage: 0,
    days: sd.map(d => ({ name: d.name, weekday: 'MON', dayType: 'strength', muscles: d.muscles, exercises: d.exercises, cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' })) }));
}, [{ ...setup, splitDays, completedAt: new Date().toISOString(), acceptedSafety: true }, hist, splitDays, storedPlan]);
await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { location.hash = '#/plan'; });
await page.waitForTimeout(3000);

const read = () => page.evaluate(() => ({
  heading: document.querySelector('.pv-progress-week')?.innerText.replace(/\n/g, ' ') || '',
  wave: document.querySelector('.pv-progress-name')?.textContent || '',
  selected: [...document.querySelectorAll('.pv-dot')].findIndex(d => d.getAttribute('aria-selected') === 'true') + 1,
  here: [...document.querySelectorAll('.pv-dot')].findIndex(d => d.classList.contains('here')) + 1,
  weekTitle: document.querySelector('.pv-week h3')?.textContent || '',
  today: Boolean(document.querySelector('.pv-today')),
  back: document.querySelector('.pv-progress-back')?.textContent || '',
  note: document.querySelector('.pv-week-note')?.textContent || '',
  rows: [...document.querySelectorAll('.pv-row-body strong')].length,
}));

const open = await read();
check('it opens on the week you are in — five, not one', open.selected === 5, `week ${open.selected}`);
check('the heading agrees', /^Week 5\b/.test(open.heading), open.heading);
check('the week list is headed as this week', open.weekTitle === 'This week', open.weekTitle);
check('today has a card', open.today);
check('and nothing is telling you to come back', open.back === '', open.back);

/* A sideways drag is the same control, and it has to work where the thumb
   actually lands. The gesture used to live on the week list, which worked on
   every week except the one everybody opens: the week you are in has a TODAY
   card above the list, so on a phone the list is most of the way off the
   bottom and the thing under your thumb is the card. These drags start on
   whatever is directly below the pips — the card when there is one. */
const drag = (from, to) => page.evaluate(([x1, x2, y1, y2]) => {
  const el = document.querySelector('.pv-today') || document.querySelector('.pv-week');
  const touch = (x, y) => [new Touch({ identifier: 1, target: el, clientX: x, clientY: y })];
  el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: touch(x1, y1), changedTouches: touch(x1, y1) }));
  el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: touch(x2, y2) }));
}, [from.x, to.x, from.y, to.y]);
const surface = async () => page.evaluate(() => {
  const el = document.querySelector('.pv-today') || document.querySelector('.pv-week');
  const box = el.getBoundingClientRect();
  return { x: box.x, y: box.y, width: box.width, height: box.height };
});

/* THE WEEK YOU ARE IN IS THE ONE EVERYBODY OPENS, and it was the one week the
   swipe did not work — Preston: "it doesn't work from week 1 but works from
   the others". Its TODAY card sits between the pips and the week list, so the
   thing under a thumb is the card, and the gesture was listening on the list. */
{
  const box = await surface();
  check('the today card is what a thumb lands on here', open.today && box.height > 100, `${Math.round(box.height)}px tall`);
  await drag({ x: box.x + box.width - 20, y: box.y + 40 }, { x: box.x + 20, y: box.y + 40 });
  await page.waitForTimeout(500);
  const swiped = await read();
  check('swiping across it still moves the week', swiped.selected === 6, `week ${swiped.selected}`);
  await drag({ x: box.x + 20, y: box.y + 40 }, { x: box.x + box.width - 20, y: box.y + 40 });
  await page.waitForTimeout(500);
  check('and back', (await read()).selected === 5, `week ${(await read()).selected}`);
}

/* The pips are the control the whole thing looked like. */
await page.evaluate(() => document.querySelectorAll('.pv-dot')[7].click());
await page.waitForTimeout(500);
const ahead = await read();
check('tapping a pip moves the screen to that week', ahead.selected === 8, `week ${ahead.selected}`);
check('the heading follows', /^Week 8\b/.test(ahead.heading), ahead.heading);
check('and so does the wave name', ahead.wave === '4-REP WEEK' || ahead.wave === '4-rep week', ahead.wave);
check('the week is dated, because its rows only carry a number',
  /^Week 8 · \w{3} \d+ – \w{3} \d+$/.test(ahead.weekTitle), ahead.weekTitle);
check('it still draws seven days', ahead.rows === 7, String(ahead.rows));
check('a week that has not happened says it is a projection', /projection/.test(ahead.note), ahead.note.slice(0, 60));
check('there is no TODAY card on a week today is not in', !ahead.today);
check('the week you are in keeps its own mark', ahead.here === 5, `week ${ahead.here}`);
check('and the way back is one tap', /3 weeks ahead · return to this week/.test(ahead.back), ahead.back);

let box = await surface();
await drag({ x: box.x + box.width - 20, y: box.y + 40 }, { x: box.x + 20, y: box.y + 40 });
await page.waitForTimeout(500);
check('swiping left goes forward a week', (await read()).selected === 9, `week ${(await read()).selected}`);
box = await surface();
await drag({ x: box.x + 20, y: box.y + 40 }, { x: box.x + box.width - 20, y: box.y + 40 });
await page.waitForTimeout(500);
check('and swiping right goes back', (await read()).selected === 8, `week ${(await read()).selected}`);

/* A near-vertical drag is a scroll, not a swipe. */
box = await surface();
await drag({ x: box.x + box.width / 2, y: box.y + 40 }, { x: box.x + box.width / 2 - 60, y: box.y + 240 });
await page.waitForTimeout(400);
check('scrolling down the page is not a swipe', (await read()).selected === 8, `week ${(await read()).selected}`);

await page.locator('.pv-progress-back').click();
await page.waitForTimeout(500);
const home = await read();
check('return to this week does exactly that', home.selected === 5 && home.weekTitle === 'This week', `${home.selected} / ${home.weekTitle}`);
check('and today comes back with it', home.today);

/* One route to a week, not two. */
check('the whole-block accordion is gone',
  await page.evaluate(() => !document.querySelector('.pv-block') && !/The whole block/.test(document.body.innerText)));

/* Nothing above week ten, nothing below week one. */
await page.evaluate(() => document.querySelectorAll('.pv-dot')[9].click());
await page.waitForTimeout(400);
box = await surface();
await drag({ x: box.x + box.width - 20, y: box.y + 40 }, { x: box.x + 20, y: box.y + 40 });
await page.waitForTimeout(400);
check('swiping past the last week stays on it', (await read()).selected === 10, `week ${(await read()).selected}`);

await page.close();
await b.close();
console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
