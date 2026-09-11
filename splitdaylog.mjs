/* CHOOSING A DAY OUT OF THE SPLIT HAS TO PRESCRIBE THAT DAY.

   Forge recommended a long run. Preston went to the gym and trained chest and
   back instead, picked "Chest & Back 2" out of his split, and the log had no
   top-set section at all — it went 01 CARDIO, 03 SESSION DETAILS. Two faults
   stacked: cardio-only was decided from the RECOMMENDED day rather than the
   day being logged, so the section stayed hidden whatever he picked; and every
   handler that changed the chosen day called setTopSets([]), so even with the
   section visible there was nothing in it. */
import { chromium } from 'playwright';
import { days, setup, goals } from './seed.mjs';

let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${c ? (d ? ` — ${d}` : '') : '   → ' + d}`); if (!c) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 390, height: 950 } });
p.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 160)));
await p.addInitScript(([d, s, g]) => {
  localStorage.setItem('forge-workout-history-v1', JSON.stringify(d));
  localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
  localStorage.setItem('forge-goals', JSON.stringify(g));
  /* A cardio day FIRST, so the day Forge is due to recommend is the run — the
     same shape as the morning this broke. */
  localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'rolling', minWeeklyMileage: 10, maxWeeklyMileage: 25, days: [
    { name: 'Long Run', weekday: 'MON', dayType: 'cardio', muscles: [], exercises: [], cardioPolicy: 'forge', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '0', maxDuration: '60' },
    { name: 'Chest & Back 2', weekday: 'TUE', dayType: 'strength', muscles: ['Chest', 'Back', 'Shoulders'], exercises: ['Bench', 'Squat'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
  ] }));
}, [days, setup, goals]);

const body = () => p.evaluate(() => document.body.innerText);
const rows = () => p.evaluate(() => [...document.querySelectorAll('.top-set-entry, .top-set-row')].map(el => el.innerText.replace(/\n/g, ' ').trim()).filter(Boolean));
const click = re => p.evaluate(src => { const rx = new RegExp(src, 'i'); const el = [...document.querySelectorAll('button')].find(x => rx.test(x.textContent || '') && !x.disabled); if (!el) return false; el.click(); return true; }, re);

await p.goto('http://localhost:4191/#/workout', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2800);

console.log('\n  the morning Forge recommends a run');
check('the log opens on the recommendation', /RECOMMEND/i.test(await body()));

console.log('\n  he chooses a lifting day out of his split instead');
check('the split option is offered', await click('Choose day'));
await p.waitForTimeout(900);
/* The picker defaults to the day due today — the run — so pick the lifting
   day explicitly, the way he did. */
await p.evaluate(() => {
  const select = document.querySelector('.plan-day-picker select');
  if (!select) return;
  const option = [...select.options].find(o => /Chest & Back 2/i.test(o.textContent || ''));
  if (!option) return;
  select.value = option.value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
});
await p.waitForTimeout(1400);
const chosen = await body();
check('the chosen day is what the log says it is', /Chest & Back 2/i.test(chosen), chosen.slice(0, 80));

console.log('\n  the top-set section is on the screen');
check('it is not hidden behind the recommended run', /TOP SET/i.test(chosen), chosen.slice(0, 200));
const sections = await p.evaluate(() => [...document.querySelectorAll('.section-title span, .top-set-card-stack header .eyebrow')]
  .map(el => (el.textContent || '').trim()));
check('and the sections are numbered in the order they appear',
  sections.map(row => row.split(' ')[0].replace(/[^0-9]/g, '')).join(',') === '01,02,03', JSON.stringify(sections));

console.log('\n  with the day’s own movements in it');
const listed = await rows();
check('the day’s exercises are prescribed, not an empty section', listed.length > 0, JSON.stringify(listed).slice(0, 200));
check('and they are the movements mapped to this day',
  listed.some(row => /bench/i.test(row)) || listed.some(row => /squat/i.test(row)), JSON.stringify(listed).slice(0, 200));

console.log('\n  and a top set can actually be logged');
check('the sheet is reachable', await click('Add top set|Log a top set'));
await p.waitForTimeout(700);
check('it opens', await p.evaluate(() => Boolean(document.querySelector('.top-set-sheet'))));

console.log('\n  and a cardio day picked out of the split is still cardio-only');
await p.evaluate(() => {
  const select = document.querySelector('.plan-day-picker select');
  if (!select) return;
  const option = [...select.options].find(o => /Long Run/i.test(o.textContent || ''));
  if (!option) return;
  select.value = option.value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
});
await p.waitForTimeout(1400);
const runDay = await body();
/* Sets already logged today stay on the screen — that is work, not a
   prescription. What a run day must not do is ASK for a lift. */
const asksForALift = await p.evaluate(() => Boolean(document.querySelector('.top-set-launch'))
  || [...document.querySelectorAll('.top-set-entry:not(.closed)')].length > 0);
check('a run day does not ask for a lift', !asksForALift, runDay.replace(/\n/g, ' ').slice(0, 160));
const runSections = await p.evaluate(() => [...document.querySelectorAll('.section-title span')].map(el => (el.textContent || '').trim()));
check('and cardio takes the 01 with details at 02', runSections.join(',') === '01,02', JSON.stringify(runSections));

console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
await b.close();
process.exit(fails ? 1 : 0);
