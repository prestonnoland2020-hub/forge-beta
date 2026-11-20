/* PARTNER GROWTH (Nov 20): strength as % from each person's own start, using
   the best so far (never drops), averaged over lifts done twice or more; miles
   per week from logged runs; partner runs parsed from their feed summary. */
import { growthByWeek, milesFromSummary, weekStarts } from './src/lib/partnerGrowth.ts';
let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${detail}`}`); if (!ok) fails += 1; };
const today = '2026-11-20';
const starts = weekStarts(today, 12);
check('12 Monday-started weeks ending this week', starts.length === 12 && starts[11] === '2026-11-16' && new Date(`${starts[0]}T12:00:00`).getDay() === 1, starts.join(','));
const sets = [
  { date: starts[0], lift: 'Bench Press', weight: 200, reps: 5 },
  { date: starts[4], lift: 'Bench', weight: 220, reps: 5 },
  { date: starts[6], lift: 'Bench Press', weight: 190, reps: 5 },
  { date: starts[2], lift: 'Curl', weight: 50, reps: 10 },
];
const g = growthByWeek(sets, [{ date: starts[11], miles: 3.2 }, { date: today, miles: 2 }], today, 12);
check('first week reads 0% growth', g[0].strength === 0, JSON.stringify(g[0]));
check('a bench PR shows as growth (220 vs 200 ≈ +10%)', g[4].strength === 10, JSON.stringify(g[4]));
check('a worse day later does not erase it', g[6].strength === 10 && g[11].strength === 10, JSON.stringify(g.map(w => w.strength)));
check('a lift done once is left out', g.every(w => w.strength === null || w.strength >= 0));
check('miles add up within the week', g[11].miles === 5.2, String(g[11].miles));
check('partner run summary parsed', milesFromSummary('Run', 'Run · 2.27 mi · 21:04') === 2.27 && Math.abs(milesFromSummary('Run', '5 km') - 3.107) < 0.01 && milesFromSummary('Bike', '10 mi') === 0);
if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall passed');
