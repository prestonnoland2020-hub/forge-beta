/* THREE THINGS THAT WERE TRUE AND UNSAYABLE.

   1. A lift leaves no mark. Strava says the athlete was in the gym for 49
      minutes; it does not say what they lifted, so there is nothing to write
      onto the day. A morning of lifting plus two runs was indistinguishable
      from a morning of two runs, and the card asked it what it asks a run:
      nothing. The fact rides with the QUESTION now — the review queue, which
      already survives a reload and is the only thing that needs to know.

   2. A day is named after the split day it is. Saving one set created
      "Top set · Back Squat", so a history of real training days read as a
      list of lifts, and the day carried the lift's muscles alone.

   3. "Calc max 517 → max week 485 × 1" reads as the plan asking for less than
      the athlete can do. It is not: 517 is Epley's estimate from a rep set,
      475 is what he has held, 485 is the next real single. */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { setup, goals } from './seed.mjs';

let fails = 0;
const check = (l, c, d = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : '   → ' + d}`); if (!c) fails++; };

const importer = readFileSync('src/features/training/stravaImportService.ts', 'utf8');
check('the queue remembers whether a lift was in the day', /stravaReviewHasStrength/.test(importer));
check('and a queue of bare dates still reads', /typeof item === 'string' \? \{ d: item \}/.test(importer));
check('the card asks the queue, not the record', /stravaReviewHasStrength\(pending\.date\)/.test(readFileSync('src/components/StravaReviewModal.tsx', 'utf8')));

/* 1. A lift + two runs: the record looks like cardio, the question knows better. */
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const today = new Date();
const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const splitDays = [
  { name: 'Chest & Back', weekday: 'MON', dayType: 'strength', muscles: ['Chest', 'Back'], exercises: ['Bench'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
  { name: 'Legs', weekday: 'TUE', dayType: 'strength', muscles: ['Quads', 'Hamstrings', 'Glutes'], exercises: ['Squat'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
];
const run = summary => ({ id: `s-${summary}`, structure: 'steady', activity: 'Run', summary,
  prescription: { legacyIntervals: [{ cardioType: 'Run', unit: 'miles', distance: 1, time: 9 }], distanceUnit: 'miles' } });

const open = async (record, queue) => {
  const p = await b.newPage({ viewport: { width: 390, height: 950 } });
  p.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 180)));
  await p.addInitScript(([s, g, sd, rec, q]) => {
    localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
    localStorage.setItem('forge-goals', JSON.stringify(g));
    localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'rolling', minWeeklyMileage: 10, maxWeeklyMileage: 25, days: sd }));
    localStorage.setItem('forge-workout-history-v1', JSON.stringify([rec]));
    localStorage.setItem('forge-strava-review-v1', JSON.stringify(q));
    localStorage.setItem('forge-split-cycle-v1', JSON.stringify({ nextPosition: 1, revision: 1 }));
  }, [setup, goals, splitDays, record, queue]);
  await p.goto('http://localhost:4191/#/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2600);
  return p;
};
const sheet = p => p.evaluate(() => document.querySelector('.strava-review-sheet')?.innerText.replace(/\n/g, ' | ') || '');

/* Preston's actual morning: a 49-minute lift and two runs, nothing logged. */
const liftAndRuns = { id: 'd1', date: iso, title: 'Morning Weight Training', muscles: ['Cardio'], hasCardio: true, topSets: [],
  cardioSessions: [run('Run · 1.09 mi · 9:36 · 8:48 /mi'), run('Run · 1 mile · 5:48 · 5:48 /mi')] };
{
  const p = await open(liftAndRuns, [{ d: iso, s: true }]);
  const text = await sheet(p);
  check('a lift among the runs is asked for its split day', /SPLIT DAY/i.test(text), text.slice(0, 200));
  check('and for the top set it did not record', /TOP SET/i.test(text), text.slice(0, 200));
  check('the split day arrives matched', await p.evaluate(() => document.querySelector('.strava-review-sheet select')?.value) !== '');
  await p.close();
}
{
  /* The same day with no lift in it stays a run. */
  const p = await open({ ...liftAndRuns, title: 'Lunch Run' }, [{ d: iso, s: false }]);
  const text = await sheet(p);
  check('runs alone are still asked nothing they do not have', !/SPLIT DAY/i.test(text) && !/TOP SET/i.test(text), text.slice(0, 200));
  await p.close();
}
{
  /* A queue written before this existed is a list of strings. */
  const p = await open({ ...liftAndRuns, title: 'Lunch Run' }, [iso]);
  check('an old queue entry still raises its card', Boolean(await p.$('.strava-review-sheet')));
  await p.close();
}

/* 2. Quick-logging one set names the day after the split day. */
{
  const p = await b.newPage({ viewport: { width: 390, height: 950 } });
  p.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 180)));
  await p.addInitScript(([s, g, sd]) => {
    localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
    localStorage.setItem('forge-goals', JSON.stringify(g));
    localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'rolling', minWeeklyMileage: 0, maxWeeklyMileage: 0, days: sd }));
    localStorage.setItem('forge-workout-history-v1', JSON.stringify([]));
  }, [setup, goals, splitDays]);
  await p.goto('http://localhost:4191/#/workout', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2800);
  const opened = await p.evaluate(() => { const el = [...document.querySelectorAll('button')].find(x => /Add a top set|Add top set|Log a top set/i.test(x.textContent)); if (!el) return false; el.click(); return true; });
  check('the log offers the top-set sheet', opened);
  await p.waitForTimeout(700);
  await p.fill('.top-set-sheet-search input', 'Bench');
  await p.waitForTimeout(400);
  await p.evaluate(() => document.querySelector('.top-set-sheet-result')?.click());
  await p.waitForTimeout(400);
  const { setWeightDial, setDial } = await import('./dialdriver.mjs');
  await setWeightDial(p, 'Weight', '315');
  await setDial(p, 'Reps', '5');
  await p.evaluate(() => [...document.querySelectorAll('.top-set-sheet footer button')].find(x => /Save top set/i.test(x.textContent))?.click());
  await p.waitForTimeout(1600);
  const day = await p.evaluate(d => JSON.parse(localStorage.getItem('forge-workout-history-v1') || '[]').find(x => x.date === d), iso);
  check('the day is named after the split day, not the lift', day?.title === 'Chest & Back', day?.title);
  check('it is not named after the lift any more', !/^Top set ·/.test(day?.title || ''), day?.title);
  /* THE NAME IS THE ATHLETE'S; THE MUSCLES ARE THE LOG'S. This asserted that
     the day also inherited the split day's muscle list, and the app changed
     its mind for a good reason: naming a session "Chest & Back" must not
     credit BACK for a day that was one bench press. Insights and muscle
     frequency read this field, and a phantom back session is a back session
     that never happened. The day takes the split day's NAME and the lift's
     muscles. */
  check('it carries the muscles the lift actually trained', (day?.muscles || []).includes('Chest'), JSON.stringify(day?.muscles));
  check('and not a muscle group nothing on the day touched', !(day?.muscles || []).includes('Quads'), JSON.stringify(day?.muscles));
  check('and the set that was logged', day?.topSets?.[0]?.lift === 'Bench Press' || day?.topSets?.[0]?.lift === 'Bench', JSON.stringify(day?.topSets?.map(s => s.lift)));
  await p.close();
}

/* 3. THE LEDGER THAT EXPLAINED THE TWO NUMBERS IS GONE, AND SO IS THE SCREEN
   IT EXPLAINED.

   "Calc max 517 → max week 485 × 1" read as the plan asking for less than the
   athlete can do, and a per-lift ledger on the plan tab said why: 517 is
   Epley's estimate from a rep set, 475 is what he has actually held, 485 is
   the next real single. The plan rewrite ("The app as a user finds it") took
   the ledger out along with the card it lived on, and the plan no longer
   prints a calculated max anywhere — so there is no contradiction on screen
   left to explain, and four assertions against deleted markup were reporting
   a missing feature nobody had asked for.

   What is still true is that the LOG shows "Calc max 517" and the PLAN shows
   "485 × 1", on different screens, with nothing joining them. That is a
   design question, not a broken feature, and it is written down here rather
   than asserted as a bug. */
const plan = readFileSync('src/components/AiProgramPlan.tsx', 'utf8');
check('the plan does not print a calculated max it cannot explain', !/Calc max/.test(plan));

await b.close();
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
