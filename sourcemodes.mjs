/* THREE WAYS TO START A DAY, AND NO MORE: Forge's recommendation, a day the
   athlete picks out of their own split, or a blank sheet where they choose the
   muscle groups. "Repeat a recent workout" was a fourth path that copied an old
   day's structure — it competed with the recommendation and produced days that
   matched neither the split nor the plan. */
import { chromium } from 'playwright';
import { days, setup, goals } from './seed.mjs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 390, height: 950 } });
await p.addInitScript(([d, s, g]) => {
  localStorage.setItem('forge-workout-history-v1', JSON.stringify(d));
  localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
  localStorage.setItem('forge-goals', JSON.stringify(g));
  localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'rolling', minWeeklyMileage: 15, maxWeeklyMileage: 30, days: [
    { name: 'Chest & Back', weekday: 'MON', dayType: 'strength', muscles: ['Chest', 'Back'], exercises: ['Bench'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
    { name: 'Lower Body', weekday: 'TUE', dayType: 'strength', muscles: ['Quads', 'Hamstrings', 'Glutes'], exercises: ['Squat'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
    { name: 'Rest', weekday: 'WED', dayType: 'rest', muscles: [], exercises: [], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '0', maxDuration: '0' },
  ] }));
}, [days, setup, goals]);
await p.goto('http://localhost:4191/#/workout', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2200);

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { if (ok) { pass++; console.log(`PASS  ${n}`); } else { fail++; console.log(`FAIL  ${n} ${d}`); } };
const options = () => p.evaluate(() => [...document.querySelectorAll('.source-options button')].map(x => x.innerText.replace(/\n/g, ' ')));

const opts = await options();
check('exactly three ways to start a day', opts.length === 3, JSON.stringify(opts));
check('Forge recommended is first', /FORGE/.test(opts[0] || '') && /Recommended/i.test(opts[0] || ''), opts[0]);
check('choose from your split is second', /SPLIT/.test(opts[1] || '') && /Choose day/i.test(opts[1] || ''), opts[1]);
check('start fresh is third', /FRESH/.test(opts[2] || '') && /Start fresh/i.test(opts[2] || ''), opts[2]);
check('Repeat is gone', !opts.some(o => /repeat|reuse/i.test(o)), JSON.stringify(opts));

const click = i => p.evaluate(n => document.querySelectorAll('.source-options button')[n].click(), i);

/* Recommended: Forge chose the day, so there is nothing to pick. */
await click(0); await p.waitForTimeout(700);
check('recommended mode hides the day picker', !(await p.$('.plan-day-picker')));
check('recommended mode does not ask for muscles', !(await p.$('.free-muscle-picker')));

/* From the split: every day of the athlete's own split, rest included. */
await click(1); await p.waitForTimeout(900);
const dayOptions = await p.evaluate(() => [...(document.querySelector('.plan-day-picker select')?.options || [])].map(o => o.text));
check('split mode offers a day picker', dayOptions.length > 0, JSON.stringify(dayOptions));
check('every split day is selectable', dayOptions.length === 3, JSON.stringify(dayOptions));
check("the picker names the athlete's own days", dayOptions.some(o => /Lower Body/.test(o)), JSON.stringify(dayOptions));
check('split mode does not ask for muscles', !(await p.$('.free-muscle-picker')));

/* Start fresh: the athlete says what they trained. */
await click(2); await p.waitForTimeout(900);
check('start fresh prompts for muscle groups', Boolean(await p.$('.free-muscle-picker')));
const chips = await p.evaluate(() => [...document.querySelectorAll('.free-muscle-picker .muscle-chip')].map(c => c.textContent));
check('muscle chips are offered', chips.length > 3, JSON.stringify(chips.slice(0, 5)));
check('start fresh has no day picker', !(await p.$('.plan-day-picker')));
await p.evaluate(() => [...document.querySelectorAll('.free-muscle-picker .muscle-chip')].find(c => c.textContent === 'Chest')?.click());
await p.waitForTimeout(500);
check('a chosen muscle group sticks', await p.evaluate(() => [...document.querySelectorAll('.free-muscle-picker .muscle-chip.active')].some(c => c.textContent === 'Chest')));

console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
