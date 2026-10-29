/* NUMBERS ARE PICKED, NOT TYPED. A keyboard for a barbell load offers 40
   characters when 12 are plausible and invites the typo that turns 225 into
   2250 — a number Forge would then treat as a calculated max and program from.
   The wheel offers only real values. */
import { chromium } from 'playwright';
import { days, setup, goals } from './seed.mjs';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 390, height: 950 } });
await p.addInitScript(([d, s, g]) => {
  localStorage.setItem('forge-workout-history-v1', JSON.stringify(d));
  localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
  localStorage.setItem('forge-goals', JSON.stringify(g));
  localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'rolling', minWeeklyMileage: 10, maxWeeklyMileage: 25, days: [
    { name: 'Chest & Back', weekday: 'MON', dayType: 'strength', muscles: ['Chest', 'Back'], exercises: ['Bench'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
    { name: 'Lower Body', weekday: 'TUE', dayType: 'strength', muscles: ['Quads', 'Hamstrings', 'Glutes'], exercises: ['Squat'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
  ] }));
}, [days, setup, goals]);

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { if (ok) { pass++; console.log(`PASS  ${n}`); } else { fail++; console.log(`FAIL  ${n} ${d}`); } };

/* 1. Logging is a header action, not a place in the nav. */
await p.goto('http://localhost:4191/#/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2200);
check('the log button lives in the header', Boolean(await p.$('.top-log')));
const headerOrder = await p.evaluate(() => [...document.querySelectorAll('.top-actions > *')].map(el => el.className.split(' ')[0]));
/* The avatar became a settings control; what the check is about is that the
   log button comes before the account one, so the thing you do every day is
   not the last thing in the row. */
check('it sits before the account control', headerOrder.indexOf('top-log') < headerOrder.indexOf('top-settings'), JSON.stringify(headerOrder));
const navLabels = await p.evaluate(() => [...document.querySelectorAll('.bottom-nav a')].map(a => a.getAttribute('aria-label')));
check('the bottom bar no longer carries it', !navLabels.includes('Log a workout'), JSON.stringify(navLabels));
check('the bottom bar keeps its five destinations', navLabels.length === 5, JSON.stringify(navLabels));
check('the header log opens the log page', (await p.evaluate(() => document.querySelector('.top-log')?.getAttribute('href'))) === '#/workout');

/* 2. A number field raises a wheel, never a keyboard. */
await p.goto('http://localhost:4191/#/workout', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2400);
const fields = await p.evaluate(() => [...document.querySelectorAll('.dial-field-label')].map(el => el.textContent));
check('the log page asks for numbers through dials', fields.length > 0, JSON.stringify(fields));
const rawNumberInputs = await p.evaluate(() => [...document.querySelectorAll('input[inputmode="decimal"], input[inputmode="numeric"]')].length);
check('no raw number keyboard is left on the log page', rawNumberInputs === 0, `${rawNumberInputs} remain`);

const openField = label => p.evaluate(text => {
  const field = [...document.querySelectorAll('.dial-field')].find(el => el.querySelector('.dial-field-label')?.textContent?.includes(text));
  field?.querySelector('.dial-field-button')?.click();
  return Boolean(field);
}, label);

/* The weight wheel lives where a set is entered — the top-set sheet — not
   loose on the day screen. This looked for it on the page and found nothing,
   then read `.dial-wheel[0]` of an empty list and threw. */
await p.evaluate(() => [...document.querySelectorAll('button')]
  .find(el => /Add a lift|Add a top set|Add a lift|Add top set|Log a top set/i.test(el.textContent || ''))?.click());
await p.waitForTimeout(700);
await p.fill('.top-set-sheet-search input', 'Bench').catch(() => {});
await p.waitForTimeout(400);
await p.evaluate(() => (document.querySelector('.top-set-sheet-result') || document.querySelector('.top-set-sheet-new'))?.click());
await p.waitForTimeout(400);
check('a weight field is offered', await openField('Weight'));
await p.waitForTimeout(500);
check('tapping it raises the dial', Boolean(await p.$('.dial-backdrop')));
check('the dial shows a selection band', Boolean(await p.$('.dial-band')));

/* 3. A WEIGHT IS ONE WHEEL IN PLATE STEPS, opening on the current value
   (or a loaded bar when empty), so the load is a short flick away. */
const wheelCount = await p.evaluate(() => document.querySelectorAll('.dial-wheel').length);
check('weight is picked on one wheel', wheelCount === 1, `${wheelCount} wheel(s)`);
const loads = await p.evaluate(() => [...document.querySelectorAll('.dial-wheel')[0].querySelectorAll('.dial-value')].map(v => Number(v.textContent)));
check('the wheel moves in fives', loads[1] - loads[0] === 5, `${loads[0]} → ${loads[1]}`);
check('it reaches a real deadlift', loads[loads.length - 1] >= 700, String(loads[loads.length - 1]));
check('the band sits exactly on the selected value', await p.evaluate(() => {
  const band = document.querySelector('.dial-band').getBoundingClientRect();
  const active = document.querySelector('.dial-value.active').getBoundingClientRect();
  return Math.abs((band.top + band.height / 2) - (active.top + active.height / 2)) <= 1;
}));

/* 4. Picking a value and confirming writes it to the field. */
const pickWeight = value => p.evaluate(v => {
  [...document.querySelectorAll('.dial-wheel')[0].querySelectorAll('.dial-value')].find(item => item.textContent === String(v))?.click();
}, value);
await pickWeight(225);
await p.waitForTimeout(300);
await p.evaluate(() => document.querySelector('.dial-cancel').click());
await p.waitForTimeout(400);
check('cancel leaves the field alone', !(await p.$('.dial-backdrop')));

await openField('Weight');
await p.waitForTimeout(500);
await pickWeight(315);
await p.waitForTimeout(300);
await p.evaluate(() => document.querySelector('.dial-ok').click());
await p.waitForTimeout(500);
check('OK closes the dial', !(await p.$('.dial-backdrop')));
const shown = await p.evaluate(() => [...document.querySelectorAll('.dial-field')].find(el => el.querySelector('.dial-field-label')?.textContent?.includes('Weight'))?.querySelector('.dial-field-button b')?.textContent);
check('the picked load lands in the field', shown === '315', shown);

/* Reopening starts where the field already is, not at zero. */
await openField('Weight');
await p.waitForTimeout(500);
const reopened = await p.evaluate(() => document.querySelector('.dial-value.active')?.textContent);
check('reopening lands on the current value', /315/.test(reopened || ''), reopened);
await p.evaluate(() => document.querySelector('.dial-cancel').click());
await p.waitForTimeout(300);

/* 5. Reps are whole and bounded — a 400-rep set does not exist. */
await openField('Reps');
await p.waitForTimeout(500);
const reps = await p.evaluate(() => [...document.querySelectorAll('.dial-wheel')[0].querySelectorAll('.dial-value')].map(v => Number(v.textContent)));
check('reps start at one, not zero', reps[0] === 1, String(reps[0]));
check('reps step by one', reps[1] - reps[0] === 1);
check('a 400-rep set cannot be entered', !reps.includes(400) && reps[reps.length - 1] <= 50, String(reps[reps.length - 1]));

console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
