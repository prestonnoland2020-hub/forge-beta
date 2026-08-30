/* ADDING A TOP SET IS ONE ANSWER, AND A SAVED SET IS A LINE.

   "Add another top set" was a disclosure holding two dependent dropdowns:
   choose a muscle group — from the SPLIT DAY's muscles only — then an exercise
   mapped to it. On a day whose muscles did not cover the lift, or a fresh day
   with no muscles picked yet, the second list was empty and there was no way
   through. There was no path at all to a lift not already in the library,
   which is exactly when someone needs one.

   And every set rendered as a full card whether it was being filled in or long
   since logged, so four lifts was four screens of form for work already done. */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { setDial, setWeightDial } from './dialdriver.mjs';
import { setup, goals } from './seed.mjs';

let fails = 0;
const check = (l, c, d = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : '   → ' + d}`); if (!c) fails++; };

const page = readFileSync('src/pages/ProductPages.tsx', 'utf8');
check('the broken two-dropdown disclosure is gone', !/add-top-set-card/.test(page));
check('and the state that gated it went with it', !/newTopSetMuscle|topSetExerciseOptions/.test(page));
check('nothing styles it any more', !/add-top-set-card/.test(readFileSync('src/workout.css', 'utf8')));
const sheet = readFileSync('src/components/TopSetSheet.tsx', 'utf8');
check("the sheet offers the athlete's whole muscle list, not the day's", /STRENGTH_MUSCLES.map\(muscle/.test(sheet) && !/dayMuscles\.map\(/.test(sheet));
check('one muscle list, shared with the cards', /import \{ STRENGTH_MUSCLES \}/.test(readFileSync('src/components/TopSetCards.tsx', 'utf8')));

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 390, height: 950 } });
p.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 180)));
const today = new Date();
const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

await p.addInitScript(([s, g]) => {
  localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
  localStorage.setItem('forge-goals', JSON.stringify(g));
  localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'rolling', minWeeklyMileage: 0, maxWeeklyMileage: 0, days: [
    /* A chest day. The lift the athlete is about to add trains TRICEPS — a
       muscle this day does not list. Under the old rule that was unloggable. */
    { name: 'Chest Day', weekday: 'MON', dayType: 'strength', muscles: ['Chest'], exercises: ['Bench'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
  ] }));
  localStorage.setItem('forge-workout-history-v1', JSON.stringify([
    { id: 'today', date: new Date().toISOString().slice(0, 10), title: 'Chest Day', muscles: ['Chest'], hasCardio: false,
      topSets: [{ id: 't1', muscle: 'Chest', lift: 'Bench', weight: 300, reps: 5, completed: true, calculatedMax: 350 }] },
  ]));
}, [setup, goals]);

await p.goto('http://localhost:4191/#/workout', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2600);

const has = sel => p.evaluate(s => Boolean(document.querySelector(s)), sel);
const clickText = re => p.evaluate(src => { const rx = new RegExp(src, 'i'); const el = [...document.querySelectorAll('button')].find(x => rx.test(x.textContent || '') && !x.disabled); if (!el) return false; el.click(); return true; }, re);

check('the log shows the top sets it already has', await has('.top-set-card-stack'));
check('nothing takes over the screen unprompted', !(await has('.top-set-sheet-backdrop')));

check('add top set is offered', await clickText('Add top set'));
await p.waitForTimeout(600);
check('it takes over the screen', await has('.top-set-sheet-backdrop') && await has('.top-set-sheet'));
check('it asks for the exercise by typing, not by dropdown', await has('.top-set-sheet-search input') && !(await has('.top-set-sheet select')));

/* A lift that is NOT in the library, on a day whose muscles do not cover it. */
await p.fill('.top-set-sheet-search input', 'Cable overhead extension');
await p.waitForTimeout(400);
check('an unknown exercise is offered as a new one', await has('.top-set-sheet-new'));
const offer = await p.evaluate(() => document.querySelector('.top-set-sheet-new')?.innerText.replace(/\n/g, ' ') || '');
check('the offer names what was typed', /Cable overhead extension/i.test(offer), offer);
await p.click('.top-set-sheet-new');
await p.waitForTimeout(400);

const chips = await p.evaluate(() => [...document.querySelectorAll('.top-set-sheet-muscles .muscle-chip')].map(el => el.textContent.trim()));
check('muscle groups are offered for it', chips.length > 0, JSON.stringify(chips));
check('a muscle the day does not train is still offered', chips.includes('Triceps'), JSON.stringify(chips));

const saveDisabled = () => p.evaluate(() => [...document.querySelectorAll('.top-set-sheet footer button')].find(x => /Save top set/i.test(x.textContent))?.disabled);
check('it cannot be saved with no numbers', await saveDisabled() === true);

await p.evaluate(() => [...document.querySelectorAll('.top-set-sheet-muscles .muscle-chip')].find(el => el.textContent.trim() === 'Triceps')?.click());
await setWeightDial(p, 'Weight', '120');
await setDial(p, 'Reps', '8');
await p.waitForTimeout(400);
const maxShown = await p.evaluate(() => document.querySelector('.top-set-sheet .top-set-card-result')?.textContent || '');
check('the calculated max is shown before saving', /152/.test(maxShown), maxShown);
check('now it can be saved', await saveDisabled() === false);

await p.evaluate(() => [...document.querySelectorAll('.top-set-sheet footer button')].find(x => /Save top set/i.test(x.textContent)).click());
await p.waitForTimeout(1600);
check('the sheet closes on save', !(await has('.top-set-sheet-backdrop')));

const day = await p.evaluate(d => JSON.parse(localStorage.getItem('forge-workout-history-v1') || '[]').find(x => x.date === d), iso);
const added = (day?.topSets || []).find(set => /Cable overhead extension/i.test(set.lift || ''));
check('the set is on the day', Boolean(added), JSON.stringify((day?.topSets || []).map(s => s.lift)));
check('with the load and reps entered', added?.weight === 120 && added?.reps === 8, JSON.stringify(added));
check('and its calculated max', added?.calculatedMax === 152, String(added?.calculatedMax));
const library = await p.evaluate(() => (JSON.parse(localStorage.getItem('forge-training-library-v1') || 'null')?.exercises) || []);
const created = library.find(item => /Cable overhead extension/i.test(item.name || ''));
check('the new exercise went into the library', Boolean(created), String(library.length));
check('mapped to the muscle that was chosen', created?.muscles?.includes('Triceps'), JSON.stringify(created?.muscles));

/* Saved sets are lines, not cards. */
await p.waitForTimeout(600);
const rows = await p.evaluate(() => [...document.querySelectorAll('.top-set-entry.closed .top-set-row')].map(el => el.innerText.replace(/\n/g, ' ')));
check('a saved set collapses to one line', rows.length > 0, JSON.stringify(rows));
check('the line says the lift and what was done', rows.some(row => /Cable overhead extension/i.test(row) && /120/.test(row) && /8/.test(row)), JSON.stringify(rows));
check('the line carries the max too', rows.some(row => /max 152/i.test(row)), JSON.stringify(rows));
/* The set just saved shows no form; the day's still-unfilled planned lift does,
   because that one is the question on the screen. */
const openLifts = await p.evaluate(() => [...document.querySelectorAll('.top-set-entry:not(.closed)')].map(el => el.innerText.split('\n')[1] || ''));
check('the saved set shows no form until asked', !openLifts.some(name => /Cable overhead extension/i.test(name)), JSON.stringify(openLifts));
check('the unfilled planned lift is still open', openLifts.some(name => /Bench/i.test(name)), JSON.stringify(openLifts));

await p.evaluate(() => document.querySelector('.top-set-entry.closed .top-set-row').click());
await p.waitForTimeout(600);
check('tapping the line opens it', await has('.top-set-entry:not(.closed) .logged-top-set-summary'));
check('and offers the edit', await p.evaluate(() => [...document.querySelectorAll('.top-set-entry:not(.closed) button')].some(x => /^Edit$/i.test(x.textContent.trim()))));
await p.evaluate(() => document.querySelector('.top-set-entry-toggle')?.click());
await p.waitForTimeout(500);
check('tapping the head closes it again', (await p.evaluate(() => document.querySelectorAll('.top-set-entry.closed').length)) > 0);

/* REOPENING A FINISHED DAY. quickLoggedKeys only knew this visit, so every
   completed set came back as a blank form asking for work already done. */
const dayId = await p.evaluate(d => JSON.parse(localStorage.getItem('forge-workout-history-v1') || '[]').find(x => x.date === d)?.id, iso);
await p.goto(`http://localhost:4191/#/workout?edit=${dayId}`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2600);
const reopened = await p.evaluate(() => [...document.querySelectorAll('.top-set-entry.closed .top-set-row')].map(el => el.innerText.replace(/\n/g, ' ')));
check('a reopened day shows its completed sets as lines', reopened.length > 0, JSON.stringify(reopened));
check('including the one added through the sheet', reopened.some(row => /Cable overhead extension/i.test(row)), JSON.stringify(reopened));
const reopenedForms = await p.evaluate(() => document.querySelectorAll('.top-set-entry:not(.closed) .dial-field').length);
check('and asks for none of it again', reopenedForms === 0, `${reopenedForms} fields open`);

/* A DAY THAT STARTS BLANK IS THE ONE THAT NEEDS THIS MOST. The sheet appeared
   only once a set already existed, so the athlete with nothing to work from
   was the one who could not reach it. */
await p.goto('http://localhost:4191/#/workout?source=blank', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2600);
check('an empty day has no set stack yet', !(await has('.top-set-card-stack')));
check('and still offers the sheet', await clickText('Add a top set'));
await p.waitForTimeout(600);
check('which opens the same takeover', await has('.top-set-sheet-backdrop') && await has('.top-set-sheet-search input'));

await b.close();
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
