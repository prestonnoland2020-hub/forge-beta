/* A SYNCED LIFT IS HALF A RECORD. Strava knows the athlete was in the gym for
   54 minutes; it does not know which split day that was or what they lifted —
   the two facts Forge's program runs on. The card asks for exactly those and
   derives the rest. */
import { chromium } from 'playwright';
import { setup, goals } from './seed.mjs';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 390, height: 950 } });
const today = new Date();
const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

await p.addInitScript(([s, g, day]) => {
  localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
  localStorage.setItem('forge-goals', JSON.stringify(g));
  localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'rolling', minWeeklyMileage: 10, maxWeeklyMileage: 25, days: [
    { name: 'Chest & Back', weekday: 'MON', dayType: 'strength', muscles: ['Chest', 'Back'], exercises: ['Bench'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
    { name: 'Lower Body', weekday: 'TUE', dayType: 'strength', muscles: ['Quads', 'Hamstrings', 'Glutes'], exercises: ['Squat'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
  ] }));
  /* A gym session that synced from Strava: a dated day, no top set. */
  localStorage.setItem('forge-workout-history-v1', JSON.stringify([
    { id: 'strava-day', date: day, title: 'Morning Weight Training', muscles: [], hasCardio: false, topSets: [] },
  ]));
  localStorage.setItem('forge-strava-strength-review-v1', JSON.stringify([day]));
}, [setup, goals, iso]);

await p.goto('http://localhost:4191/#/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2200);

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { if (ok) { pass++; console.log(`PASS  ${n}`); } else { fail++; console.log(`FAIL  ${n} ${d}`); } };
const card = () => p.$('.strava-strength-review');

check('a synced lift raises the card', Boolean(await card()));
const heading = await p.evaluate(() => document.querySelector('.strava-strength-review')?.innerText.replace(/\n/g, ' ') || '');
check('the card names the synced activity', /MORNING WEIGHT TRAINING/i.test(heading), heading.slice(0, 80));
check('it asks the two questions', /Which day was this/i.test(heading) && /top set/i.test(heading), heading.slice(0, 140));

/* Nothing can be saved until both answers exist. */
const saveDisabled = () => p.evaluate(() => document.querySelector('.strava-strength-review button.button')?.disabled);
check('save is refused with no answers', await saveDisabled() === true);

const days = await p.evaluate(() => [...(document.querySelector('.strava-strength-review select')?.options || [])].map(o => o.text));
check('every split day is offered', days.includes('Chest & Back') && days.includes('Lower Body'), JSON.stringify(days));

const setSelect = (index, value) => p.evaluate(([i, v]) => {
  const el = document.querySelectorAll('.strava-strength-review select')[i];
  const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set;
  setter.call(el, v); el.dispatchEvent(new Event('change', { bubbles: true }));
}, [index, value]);

await setSelect(0, '1'); // Lower Body
await p.waitForTimeout(600);
check('choosing a day reveals the top set row', Boolean(await p.$('.strength-review-set')));
const lifts = await p.evaluate(() => [...(document.querySelectorAll('.strava-strength-review select')[1]?.options || [])].map(o => o.text));
check("the day's own lift is offered first", lifts[1] === 'Squat', JSON.stringify(lifts.slice(0, 4)));
check('the rest of the library is still reachable', lifts.length > 3, String(lifts.length));

await setSelect(1, 'Squat');
await p.waitForTimeout(400);
check('save is still refused without numbers', await saveDisabled() === true);

const fill = (index, value) => p.evaluate(([i, v]) => {
  const el = document.querySelectorAll('.strava-strength-review input')[i];
  const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set;
  setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
}, [index, value]);
await fill(0, '315'); await fill(1, '5');
await p.waitForTimeout(500);
const maxShown = await p.evaluate(() => document.querySelector('.strength-review-max')?.textContent || '');
check('the calculated max is shown before saving', /368/.test(maxShown), maxShown);
check('save is now offered', await saveDisabled() === false);

await p.evaluate(() => document.querySelector('.strava-strength-review button.button').click());
await p.waitForTimeout(1200);
const day = await p.evaluate(d => JSON.parse(localStorage.getItem('forge-workout-history-v1') || '[]').find(x => x.date === d), iso);
check('the day takes the split day it was assigned', day?.title === 'Lower Body', day?.title);
check('it lands on that split position', day?.splitPosition === 2, String(day?.splitPosition));
check('the top set is recorded', day?.topSets?.[0]?.lift === 'Squat' && day.topSets[0].weight === 315 && day.topSets[0].reps === 5, JSON.stringify(day?.topSets));
check('the calculated max is stored', day?.topSets?.[0]?.calculatedMax === 368, String(day?.topSets?.[0]?.calculatedMax));
check('muscles come from the day and the lift', ['Quads', 'Hamstrings', 'Glutes'].every(m => day?.muscles?.includes(m)), JSON.stringify(day?.muscles));
check('the card clears once answered', !(await card()));

console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
