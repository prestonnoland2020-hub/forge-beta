/* Adding cardio to a day that already has lifts — the exact shape a Strava
   import hands to addRecord. The lifts, the muscles and the day's NAME must
   all survive; only the cardio is added. */
import { chromium } from 'playwright';
import { setup } from './seed.mjs';
import { setDistanceDial, setClockDial } from './dialdriver.mjs';
const today = new Date(); const iso = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
const loggedDay = { id: 'legs-day', date: iso, title: 'Legs', muscles: ['Quads','Hamstrings','Glutes'], splitPosition: 2, splitId: 'split-1',
  topSets: [{ id: 't1', muscle: 'Quads', lift: 'Squat', weight: 405, reps: 3, completed: true, calculatedMax: 446 }],
  lift: 'Squat', weight: 405, reps: 3, calculatedMax: 446, hasCardio: false, cardioSessions: [] };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 390, height: 1000 } });
p.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 200)));
await p.addInitScript(([d, s]) => {
  if (localStorage.getItem('forge-seeded')) return;
  localStorage.setItem('forge-seeded', '1');
  localStorage.setItem('forge-workout-history-v1', JSON.stringify([d]));
  localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
  /* A goal is now part of being set up — the onboarding gate routes a
     goal-less athlete into the goal step, so every fixture needs one. */
  localStorage.setItem('forge-goals', JSON.stringify([{ type: 'Strength', title: '510 lb Squat', target: '510 lb', date: '2026-12-01', connection: 'Quads', exercise: 'Squat', metric: 'Real 1RM', unit: 'lb' }]));
}, [loggedDay, setup]);
await p.goto('http://localhost:4191/#/workout', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2000);
let fails = 0;
const check = (l, c, d = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : '   → ' + d}`); if (!c) fails++; };
// log a run onto that day, the way an import does: cardio only, its own title
await p.evaluate(() => [...document.querySelectorAll('button')].find(x => /Add cardio/i.test(x.textContent || ''))?.click());
await p.waitForTimeout(700);
/* Distance and time are picked from a wheel, not typed — the same dial the
   rest of the logger uses. This suite still drove them as text inputs, so it
   threw on an undefined element before it asserted anything, and a suite that
   throws reports no failures at all. */
await setDistanceDial(p, 'Distance', 4, 20);
await setClockDial(p, 'Time', 36, 0);
await p.waitForTimeout(400);
await p.evaluate(() => [...document.querySelectorAll('button')].find(x => /^Save cardio$/i.test(x.textContent.trim()))?.click());
await p.waitForTimeout(1200);
const day = await p.evaluate((d) => JSON.parse(localStorage.getItem('forge-workout-history-v1')).find(r => r.date === d), iso);
console.log('   day after:', JSON.stringify({ title: day?.title, muscles: day?.muscles, sets: day?.topSets?.length, cardio: day?.cardioSessions?.length, splitPosition: day?.splitPosition }));
check('the day keeps its name', day?.title === 'Legs', String(day?.title));
check('the logged lift survives', day?.topSets?.length === 1 && day.topSets[0].lift === 'Squat', JSON.stringify(day?.topSets));
check('trained muscles survive, Cardio added', ['Quads','Hamstrings','Glutes','Cardio'].every(m => day?.muscles?.includes(m)), JSON.stringify(day?.muscles));
check('the run was added', (day?.cardioSessions?.length || 0) >= 1 && day.hasCardio === true, JSON.stringify(day?.cardioSessions?.length));
check('split identity survives', day?.splitPosition === 2 && day?.splitId === 'split-1', `${day?.splitPosition}/${day?.splitId}`);
await b.close();
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
