/* A TOP SET NEEDS A DAY TO BELONG TO.

   Which split day a lift "belongs" to is not something Forge can infer. A
   squat logged on a chest day is either a leg day or a chest day with a squat
   on it, and only the athlete knows which — every rule that guessed got one of
   those two cases wrong. The three source buttons at the top of the log
   already answer it, so that IS the answer: Forge recommended, a day from the
   split, or a fresh day named by the muscles chosen for it. Until one of them
   names the day, a top set has nothing to attach to. */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { setup, goals } from './seed.mjs';

let fails = 0;
const check = (l, c, d = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : '   → ' + d}`); if (!c) fails++; };

const page = readFileSync('src/pages/ProductPages.tsx', 'utf8');
check('the label comes from the header, not from the lift', /const dayLabel=usingSplit\?\(plannedDay\?\.name\|\|''\):freeMuscles/.test(page));
check('and saving without one is refused with the reason', /if\(!dayLabel\)\{setQuickLogMessage\(noDayReason\)/.test(page));

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const today = new Date();
const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const splitDays = [
  { name: 'Chest & Back', weekday: 'MON', dayType: 'strength', muscles: ['Chest', 'Back'], exercises: ['Bench'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
  { name: 'Lower Body', weekday: 'TUE', dayType: 'strength', muscles: ['Quads', 'Hamstrings', 'Glutes'], exercises: ['Squat'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
];
const open = async route => {
  const p = await b.newPage({ viewport: { width: 390, height: 950 } });
  p.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 180)));
  await p.addInitScript(([s, g, sd]) => {
    localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
    localStorage.setItem('forge-goals', JSON.stringify(g));
    localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'rolling', minWeeklyMileage: 0, maxWeeklyMileage: 0, days: sd }));
    localStorage.setItem('forge-workout-history-v1', JSON.stringify([]));
  }, [setup, goals, splitDays]);
  await p.goto(`http://localhost:4191/#${route}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2800);
  return p;
};
const openSheet = async p => { await p.evaluate(() => [...document.querySelectorAll('button')].find(x => /Add a top set|Add top set/i.test(x.textContent))?.click()); await p.waitForTimeout(700); };
/* Scoped to the sheet: with no sets on the day yet, the log page behind it
   carries its own Weight and Reps fields, and an unscoped driver reaches those
   instead — filling the form nobody is looking at. */
const sheetDial = async (page, label, pick) => {
  await page.evaluate(text => {
    const field = [...document.querySelectorAll('.top-set-sheet .dial-field')]
      .find(el => (el.querySelector('.dial-field-label')?.textContent || '').toLowerCase().includes(text.toLowerCase()));
    field?.querySelector('.dial-field-button')?.click();
  }, label);
  await page.waitForTimeout(450);
  await page.evaluate(values => {
    const wheels = document.querySelectorAll('.dial-wheel');
    values.forEach((value, index) => [...wheels[index].querySelectorAll('.dial-value')].find(el => el.textContent === String(value))?.click());
  }, pick);
  await page.waitForTimeout(250);
  await page.evaluate(() => document.querySelector('.dial-ok').click());
  await page.waitForTimeout(350);
};
const fillSet = async (p, lift) => {
  await p.fill('.top-set-sheet-search input', lift);
  await p.waitForTimeout(400);
  await p.evaluate(() => (document.querySelector('.top-set-sheet-result') || document.querySelector('.top-set-sheet-new'))?.click());
  await p.waitForTimeout(400);
  await sheetDial(p, 'Weight', [300, 15]);
  await sheetDial(p, 'Reps', [5]);
};
const saveDisabled = page => page.evaluate(() => [...document.querySelectorAll('.top-set-sheet footer button')].find(x => /Save top set/i.test(x.textContent))?.disabled);

/* 1. A FRESH DAY WITH NOTHING PICKED HAS NO LABEL. */
{
  const p = await open('/workout?source=blank');
  await openSheet(p);
  await fillSet(p, 'Squat');
  check('a complete set still cannot be saved without a day', await saveDisabled(p) === true);
  const why = await p.evaluate(() => document.querySelector('.top-set-sheet-warning')?.textContent || '');
  check('and the sheet says why, and where to fix it', /muscle groups you trained, at the top/i.test(why), why);

  /* Naming the day at the top is what unblocks it. */
  await p.evaluate(() => document.querySelector('.top-set-sheet-close')?.click());
  await p.waitForTimeout(400);
  await p.evaluate(() => [...document.querySelectorAll('.free-muscle-picker .muscle-chip')].find(el => el.textContent.trim() === 'Quads')?.click());
  await p.waitForTimeout(500);
  await openSheet(p);
  await fillSet(p, 'Squat');
  check('picking the muscles unblocks it', await saveDisabled(p) === false);
  await p.evaluate(() => [...document.querySelectorAll('.top-set-sheet footer button')].find(x => /Save top set/i.test(x.textContent)).click());
  await p.waitForTimeout(1600);
  const day = await p.evaluate(d => JSON.parse(localStorage.getItem('forge-workout-history-v1') || '[]').find(x => x.date === d), iso);
  check('a fresh day is named by what was trained', day?.title === 'Quads', day?.title);
  check('not by the lift', !/^Top set ·/.test(day?.title || ''), day?.title);
  await p.close();
}

/* 2. THE RECOMMENDED DAY IS ALREADY A LABEL — nothing extra to answer. */
{
  const p = await open('/workout');
  await openSheet(p);
  await fillSet(p, 'Squat');
  check('the recommended day needs no extra answer', await saveDisabled(p) === false);
  check('and nothing is blocking the sheet', !(await p.$('.top-set-sheet-warning')));
  await p.evaluate(() => [...document.querySelectorAll('.top-set-sheet footer button')].find(x => /Save top set/i.test(x.textContent)).click());
  await p.waitForTimeout(1600);
  const day = await p.evaluate(d => JSON.parse(localStorage.getItem('forge-workout-history-v1') || '[]').find(x => x.date === d), iso);
  /* THE SQUAT DOES NOT RENAME THE DAY. This is the case rightfix argued about:
     a lift that belongs elsewhere is still logged on the day the athlete said
     they were on. Forge no longer guesses either way. */
  check('a lift from another day does not rename the day', day?.title === 'Chest & Back', day?.title);
  await p.close();
}

/* 3. A SPLIT DAY CHOSEN BY HAND LABELS IT TOO. */
{
  const p = await open('/workout?source=split');
  await p.evaluate(() => {
    const el = document.querySelector('.plan-day-picker select');
    const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set;
    setter.call(el, '1'); el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.waitForTimeout(700);
  await openSheet(p);
  await fillSet(p, 'Squat');
  check('a hand-picked split day is a label', await saveDisabled(p) === false);
  await p.evaluate(() => [...document.querySelectorAll('.top-set-sheet footer button')].find(x => /Save top set/i.test(x.textContent)).click());
  await p.waitForTimeout(1600);
  const day = await p.evaluate(d => JSON.parse(localStorage.getItem('forge-workout-history-v1') || '[]').find(x => x.date === d), iso);
  check('the day takes the name that was chosen', day?.title === 'Lower Body', day?.title);
  check('and its position in the cycle', day?.splitPosition === 2, String(day?.splitPosition));
  await p.close();
}

await b.close();
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
