/* CALC MAX DRIVES THE GOAL: pounds per week over the last weeks, carried to
   the goal date. Same rule for everyone. */
import { liftTrend } from './src/lib/liftTrend.ts';
let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${detail}`}`); if (!ok) fails += 1; };
const iso = days => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
const recs = rows => rows.map(([ago, weight, reps]) => ({ date: iso(-ago), topSets: [{ lift: 'Squat', weight, reps, completed: true }] }));
console.log('\nClimbing');
const up = liftTrend('Squat', recs([[49, 225, 5], [35, 235, 5], [21, 245, 5], [7, 255, 5]]), 300, iso(70));
check('a rising line is read in lb/week', up && up.perWeek > 0, JSON.stringify(up));
check('carried to the goal date', up && up.projected > up.current);
check('and capped at 1% a week', up && up.perWeek <= up.current * 0.01 + 0.05, String(up?.perWeek));
console.log('\nOn pace');
const easy = liftTrend('Squat', recs([[49, 225, 5], [35, 230, 5], [21, 235, 5], [7, 240, 5]]), 270, iso(70));
check('enough pace to reach it: on track', easy?.status === 'on-track', JSON.stringify(easy));
console.log('\nFlat');
const flat = liftTrend('Squat', recs([[49, 245, 5], [35, 245, 5], [21, 245, 5], [7, 245, 5]]), 300, iso(70));
check('no gain: behind, and it says so', flat?.status === 'behind' && /flat/.test(flat.sentence), JSON.stringify(flat));
console.log('\nToo little to call');
check('two sets: no trend', liftTrend('Squat', recs([[14, 245, 5], [7, 250, 5]]), 300, iso(70)) === null);
if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall passed');
