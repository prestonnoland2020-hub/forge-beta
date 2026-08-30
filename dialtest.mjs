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
check('it sits to the left of the avatar', headerOrder.indexOf('top-log') < headerOrder.indexOf('avatar'), JSON.stringify(headerOrder));
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

check('a weight field is offered', await openField('Weight'));
await p.waitForTimeout(500);
check('tapping it raises the dial', Boolean(await p.$('.dial-backdrop')));
check('the dial shows a selection band', Boolean(await p.$('.dial-band')));

/* 3. A WEIGHT IS TWO WHEELS. One wheel from 0 to 900 in fives is 181 values —
   reaching 315 was a spin long enough to be worse than typing. */
const wheelCount = await p.evaluate(() => document.querySelectorAll('.dial-wheel').length);
check('weight is picked on two wheels, not one long one', wheelCount === 2, `${wheelCount} wheel(s)`);
const hundreds = await p.evaluate(() => [...document.querySelectorAll('.dial-wheel')[0].querySelectorAll('.dial-value')].map(v => Number(v.textContent)));
const remainder = await p.evaluate(() => [...document.querySelectorAll('.dial-wheel')[1].querySelectorAll('.dial-value')].map(v => Number(v.textContent)));
check('the left wheel steps in hundreds', hundreds[1] - hundreds[0] === 100, `${hundreds[0]} → ${hundreds[1]}`);
check('the left wheel is a short spin', hundreds.length <= 12, `${hundreds.length} values`);
check('the right wheel moves in fives', remainder[1] - remainder[0] === 5, `${remainder[0]} → ${remainder[1]}`);
check('the right wheel stops before the next hundred', remainder[remainder.length - 1] === 95, String(remainder[remainder.length - 1]));
check('together they reach a real deadlift', hundreds[hundreds.length - 1] + 95 >= 700, String(hundreds[hundreds.length - 1] + 95));
check('any load is two flicks, not a hundred', hundreds.length + remainder.length <= 40, `${hundreds.length} + ${remainder.length}`);

/* 4. The two wheels add up, and the choice is previewed before it commits. */
const pickWeight = (h, r) => p.evaluate(([a, b]) => {
  const wheels = document.querySelectorAll('.dial-wheel');
  [...wheels[0].querySelectorAll('.dial-value')].find(v => v.textContent === String(a))?.click();
  [...wheels[1].querySelectorAll('.dial-value')].find(v => v.textContent === String(b))?.click();
}, [h, r]);
await pickWeight(200, 25);
await p.waitForTimeout(400);
const preview = await p.evaluate(() => document.querySelector('.dial-preview')?.textContent);
check('300 + 15 style addition previews correctly', /225/.test(preview || ''), preview);
await p.evaluate(() => document.querySelector('.dial-cancel').click());
await p.waitForTimeout(400);
check('cancel leaves the field alone', !(await p.$('.dial-backdrop')));

await openField('Weight');
await p.waitForTimeout(500);
await pickWeight(300, 15);
await p.waitForTimeout(300);
await p.evaluate(() => document.querySelector('.dial-ok').click());
await p.waitForTimeout(500);
check('OK closes the dial', !(await p.$('.dial-backdrop')));
const shown = await p.evaluate(() => [...document.querySelectorAll('.dial-field')].find(el => el.querySelector('.dial-field-label')?.textContent?.includes('Weight'))?.querySelector('.dial-field-button b')?.textContent);
check('the two wheels sum into the field', shown === '315', shown);

/* Reopening starts where the field already is, not at zero. */
await openField('Weight');
await p.waitForTimeout(500);
const reopened = await p.evaluate(() => document.querySelector('.dial-preview')?.textContent);
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
