/* A RECORD IS SAID WHEN IT HAPPENS.

   A top set that beats every calculated max before it is acknowledged on its
   own line — no pop-up. A real single heavier than every single before it is
   the big one: confetti across the screen. A lift's first ever set is a
   baseline and sets no record at all. */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { setDial, setWeightDial } from './dialdriver.mjs';

let fails = 0;
const check = (l, c, d = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : '   → ' + d}`); if (!c) fails++; };

const lib = readFileSync('src/lib/personalRecords.ts', 'utf8');
check('one rule decides what a record is', /export function topSetRecord/.test(lib));
check('the save path asks it before the set lands', /topSetRecord\(records,set,sessionIso,false\)/.test(readFileSync('src/pages/ProductPages.tsx', 'utf8')));

const b = await chromium.launch({ executablePath: process.env.FORGE_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await c.newPage();
p.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 180)));
const visibleInputs = async () => { const out = []; for (const i of await p.$$('input')) if (await i.isVisible()) out.push(i); return out; };
const tapText = async (t, i = 0) => { const loc = p.locator(`text=${t}`); await loc.nth(i).scrollIntoViewIfNeeded(); await loc.nth(i).click(); await p.waitForTimeout(450); };
const dismissModals = async () => { for (const label of ['Yes, that was real', 'Not now', 'Got it']) { const loc = p.locator(`text=${label}`); if (await loc.count()) { try { await loc.first().click({ timeout: 1500 }); await p.waitForTimeout(400); } catch { /* not blocking */ } } } await p.evaluate(() => document.querySelector('.update-ready-pill')?.remove()); };
const has = sel => p.evaluate(s => Boolean(document.querySelector(s)), sel);

await p.addInitScript(() => {
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  localStorage.clear();
  localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify({
    displayName: 'Casey', username: 'casey', units: 'Imperial', primaryFocus: 'Hybrid',
    trainingDays: 4, runningDays: 2, weeklyMileage: 12, longestRun: 4,
    splitDays: [{ name: 'Upper Strength', type: 'Strength', muscles: ['Chest'], exercises: ['Bench Press'] },
      { name: 'Lower Strength', type: 'Strength', muscles: ['Quads'], exercises: ['Back Squat'] },
      { name: 'Conditioning', type: 'Cardio', muscles: [] }, { name: 'Recovery', type: 'Rest', muscles: [] }],
    acceptedSafety: true, completedAt: '2026-01-01T00:00:00.000Z',
  }));
  localStorage.setItem('forge-goals', JSON.stringify([{ type: 'Strength', title: '405 lb Squat', target: '405 lb', date: '2027-12-01', connection: 'Quads', exercise: 'Back Squat', metric: 'Real 1RM', unit: 'lb' }]));
  const iso = d => { const x = new Date(); x.setDate(x.getDate() - d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  localStorage.setItem('forge-workout-history-v1', JSON.stringify([
    { id: 'h1', date: iso(7), title: 'Lower Strength', muscles: ['Quads'], hasCardio: false, topSets: [
      { lift: 'Back Squat', weight: 300, reps: 5, muscle: 'Quads', completed: true },
      { lift: 'Bench Press', weight: 225, reps: 1, muscle: 'Chest', completed: true }] },
    { id: 'h2', date: iso(3), title: 'Lower Strength', muscles: ['Quads'], hasCardio: false, topSets: [
      { lift: 'Back Squat', weight: 315, reps: 1, muscle: 'Quads', completed: true }] },
  ]));
});

const addViaSheet = async (lift, weight, reps) => {
  await p.evaluate(() => [...document.querySelectorAll('button')].find(x => /Add a lift/i.test(x.textContent || ''))?.click());
  await p.waitForTimeout(600);
  await p.fill('.top-set-sheet-search input', lift);
  await p.waitForTimeout(400);
  const picked = await p.evaluate(name => { const el = [...document.querySelectorAll('.top-set-sheet-result')].find(item => item.querySelector('strong')?.textContent === name); el?.click(); return Boolean(el); }, lift);
  if (!picked) throw new Error(`the sheet does not offer ${lift}`);
  await p.waitForTimeout(400);
  await setWeightDial(p, 'Weight', String(weight));
  await setDial(p, 'Reps', String(reps));
  await p.waitForTimeout(300);
  await p.evaluate(() => [...document.querySelectorAll('.top-set-sheet footer button')].find(x => /Save top set/i.test(x.textContent)).click());
  await p.waitForTimeout(900);
};
const rows = () => p.evaluate(() => [...document.querySelectorAll('.top-set-entry.closed .top-set-row')].map(el => el.innerText.replace(/\n/g, ' ')));
const rowText = async (name, figure) => (await rows()).find(t => t.startsWith(name) && (!figure || t.includes(figure))) || '';

await p.goto('http://localhost:4191/#/workout', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2600); await dismissModals();

console.log('\nA new calculated max is a nod');
/* 300×5 → 338 and 315×1 → 315 on the curve; 305×5 → 343 beats both. */
await addViaSheet('Back Squat', 305, 5);
check('no pop-up for a calculated max', !(await has('.pr-celebration')));
const squat = await rowText('Back Squat');
check('the line says it is a new calculated max', /New est. max · 343/.test(squat), squat);
check('and it animates in, because it just happened', await has('.top-set-pr.calc.fresh'));

console.log('\nA real 1RM PR is the big one');
await addViaSheet('Bench Press', 235, 1);
check('confetti takes the screen', await has('.pr-celebration .pr-confetti i'));
const card = await p.evaluate(() => document.querySelector('.pr-celebration-card')?.innerText.replace(/\n/g, ' ') || '');
check('it names the record and the gain', /NEW 1RM PR/.test(card) && /235/.test(card) && /\+10 lb/.test(card) && /Bench Press/.test(card), card);
if (process.env.PR_SHOT) { await p.waitForTimeout(700); await p.screenshot({ path: process.env.PR_SHOT }); }
await p.click('.pr-celebration-card');
await p.waitForTimeout(400);
check('a tap puts it away', !(await has('.pr-celebration')));
const bench = await rowText('Bench Press');
check('and the day keeps the record on the line', /1RM PR/.test(bench), bench);
if (process.env.PR_SHOT) await p.screenshot({ path: process.env.PR_SHOT.replace('.png', '-rows.png') });

console.log('\nNot every set is a record');
await addViaSheet('Back Squat', 225, 5);
check('a lighter set gets nothing', !(await has('.pr-celebration')));
const light = await rowText('Back Squat', '225');
check('no badge on the lighter set', light && !/est. max|1RM PR/.test(light), JSON.stringify(await rows()));

console.log('\nA first ever set is a baseline');
await addViaSheet('Deadlift', 405, 1);
check('no confetti for a lift with no history', !(await has('.pr-celebration')));
const dl = await rowText('Deadlift');
check('and no badge', dl && !/1RM PR|est. max/.test(dl), dl);

await p.reload(); await p.waitForTimeout(2600); await dismissModals();
check('on reopening the day the records are still marked', /New est. max/.test(await rowText('Back Squat', '305')) && /1RM PR/.test(await rowText('Bench Press')), JSON.stringify(await rows()));
check('but nothing re-animates', !(await has('.top-set-pr.fresh')));

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
