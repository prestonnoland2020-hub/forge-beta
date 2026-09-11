/* "LOGGED · LEGS" OVER A LIST OF BENCH SETS.

   Preston's plan had Chest & Back on Monday; he trained it, and the today card
   said "Logged · Legs" — the name of the day the block PLANNED, printed over
   the sets he actually did. The week list below it, which reads history, said
   Chest & Back on the very same screen.

   Completed work is authoritative. The plan's intention is still worth saying
   when the two differ — once, quietly. */
import { chromium } from 'playwright';
import { setup } from './seed.mjs';

const BASE = 'http://localhost:4193';
let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : '   → ' + d}`); if (!c) fails++; };
const today = new Date().toISOString().slice(0, 10);
const oneRm = (w, r) => Math.round(w * (1 + r / 30));

const splitDays = [
  { name: 'Legs', type: 'Strength', muscles: ['Quads'], exercises: ['Squat'] },
  { name: 'Chest & Back', type: 'Strength', muscles: ['Chest', 'Back'], exercises: ['Bench Press'] },
];
/* A block that prescribes Legs, so the plan's idea of today is Legs. */
const mkWeek = n => ({ week: n, phase: 'Build', mileage: 0, longRunMiles: 0, longRunPace: '', quality: '', qualityPace: '',
  qualityDay: '', longRunDay: '', easyDays: [], easyMinutes: 0, easyPace: '',
  topSets: [{ splitDay: 'Legs', exercise: 'Squat', weight: 405, reps: 5 }], note: 'Wave.' });
const storedPlan = { plan: { summary: 'Block.', easyPace: '', weeks: Array.from({ length: 10 }, (_, i) => mkWeek(i + 1)) },
  generatedAt: new Date().toISOString(), startDate: today, fingerprint: 'seeded', blockWeeks: 10, saved: true, savedAt: new Date().toISOString() };
/* THE CONTENT MATCHES THE TITLE. This logged Bench Press under ['Chest'] no
   matter which day it claimed to be, so a record titled "Legs" was a chest
   session — and the cycle, which infers position from what was actually
   trained, read it as Chest & Back. The two faults cancelled while the week was
   also being drawn a day early, and this test passed on the strength of that.
   A fixture that lies is worse than no fixture. */
const CONTENT = {
  Legs: { muscle: 'Quads', lift: 'Squat', weight: 405, reps: 5, position: 1 },
  'Chest & Back': { muscle: 'Chest', lift: 'Bench Press', weight: 315, reps: 3, position: 2 },
};
const logged = title => { const it = CONTENT[title]; return [{ id: 'd1', date: today, title, muscles: [it.muscle], splitPosition: it.position,
  topSets: [{ id: 'd1t', muscle: it.muscle, lift: it.lift, weight: it.weight, reps: it.reps, completed: true, calculatedMax: oneRm(it.weight, it.reps) }],
  lift: it.lift, weight: it.weight, reps: it.reps, calculatedMax: oneRm(it.weight, it.reps), hasCardio: false, cardioSessions: [] }]; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const open = async title => {
  const page = await b.newPage({ viewport: { width: 430, height: 1400 } });
  await page.addInitScript(([s, h, sd, p]) => {
    localStorage.clear();
    localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
    localStorage.setItem('forge-goals', JSON.stringify([{ type: 'Strength', title: 'Squat 500', exercise: 'Squat', metric: 'Real 1RM', target: '500', unit: 'lb', date: '2026-12-30', connection: '' }]));
    localStorage.setItem('forge-workout-history-v1', JSON.stringify(h));
    /* A WEEKLY rhythm, because that is the only rhythm in which "the day the plan
       asked for" exists independently of what the athlete did. On a rolling
       cycle the position IS derived from the last session logged, so training
       Chest & Back makes Chest & Back today's day by definition and there is no
       swap to report. */
    localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'weekly', minWeeklyMileage: 0, maxWeeklyMileage: 0,
      days: sd.map((d, i) => ({ name: d.name, weekday: ['MON', 'TUE'][i], dayType: 'strength', muscles: d.muscles, exercises: d.exercises, cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' })) }));
    localStorage.setItem('forge-ai-plan-v1', JSON.stringify(p));
  }, [{ ...setup, splitDays, completedAt: new Date().toISOString(), acceptedSafety: true }, logged(title), splitDays, storedPlan]);
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { location.hash = '#/plan'; });
  await page.waitForTimeout(3000);
  const card = await page.evaluate(() => {
    const el = document.querySelector('.pv-today');
    return el ? { text: el.innerText.replace(/\n/g, ' | '), swap: el.querySelector('.pv-today-swap')?.textContent || '' } : null;
  });
  await page.close();
  return card;
};

/* He trained the day the block asked for. */
{
  const card = await open('Legs');
  console.log('\n  the logged day is the planned day');
  check('the card names what was trained', /Legs/.test(card.text), card.text.slice(0, 140));
  check('and says nothing about a swap', card.swap === '', card.swap);
}

/* He trained something else. */
{
  const card = await open('Chest & Back');
  console.log('\n  he trained off-plan');
  check('the card names what he actually did', /Chest & Back/.test(card.text), card.text.slice(0, 140));
  check('the planned day is not printed as the truth', !/Logged \| Legs/.test(card.text), card.text.slice(0, 140));
  check('it is said once, as the plan', /^Planned Legs$/.test(card.swap), card.swap);
}

await b.close();
console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
