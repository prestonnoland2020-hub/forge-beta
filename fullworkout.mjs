/* BUILD MY WORKOUT, AND ADAM'S BENCH.

   The full workout wraps the top sets: back-offs under each, an accessory for
   every muscle the day trains, a weight when one is on file. And a goal a few
   pounds past the ceiling, with nothing heavy logged, says "test it", not
   "out of reach". */
import { buildFullWorkout, warmupRamp, todaysObjective } from './src/lib/fullWorkout.ts';
import { goalFeasibility } from './src/lib/goalFeasibility.ts';
import { goalProgress } from './src/lib/goalProgress.ts';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };

console.log('\nBuild my workout');
const library = [
  { name: 'Bench', kind: 'Strength', muscles: ['Chest', 'Triceps'], detail: 'Barbell · Primary lift', enabled: true },
  { name: 'Barbell Row', kind: 'Strength', muscles: ['Back'], detail: 'Barbell · Primary lift', enabled: true },
  { name: 'Dumbbell Fly', kind: 'Strength', muscles: ['Chest'], detail: 'Dumbbell · Accessory', enabled: true },
  { name: 'Lat Pulldown', kind: 'Strength', muscles: ['Back'], detail: 'Cable · Accessory', enabled: true },
  { name: 'Triceps Pushdown', kind: 'Strength', muscles: ['Triceps'], detail: 'Cable · Accessory', enabled: true },
  { name: 'Wall Balls', kind: 'Strength', muscles: ['Triceps'], detail: 'HYROX · reps', enabled: true },
];
const records = [{ date: '2026-11-01', topSets: [{ lift: 'Lat Pulldown', weight: 140, reps: 10 }] }];
const full = buildFullWorkout({ topSets: [{ exercise: 'Bench', muscle: 'Chest', weight: 225, reps: 5 }, { exercise: 'Barbell Row', muscle: 'Back', weight: 185, reps: 6 }],
  dayMuscles: ['Chest', 'Back', 'Triceps'], library, records, metric: false, unit: 'lb' });
const tops = full.filter(b => b.kind === 'top'); const acc = full.filter(b => b.kind === 'accessory');
check('the top sets lead, in order', tops.map(b => b.exercise).join() === 'Bench,Barbell Row', tops.map(b => b.exercise).join());
check('each top set gets back-offs at 85%', tops[0].plan === 'Then 2 × 7 @ 190 lb', tops[0].plan);
check('every muscle of the day gets an accessory', ['Chest', 'Back', 'Triceps'].every(m => acc.some(b => b.muscle === m)), acc.map(b => b.muscle).join());
check('the muscle the top sets do not lead comes first', acc[0].muscle === 'Triceps', acc[0].muscle);
check('no HYROX movement is an accessory', !acc.some(b => b.exercise === 'Wall Balls'));
check('an accessory with history carries its weight', acc.find(b => b.exercise === 'Lat Pulldown')?.plan === '3 × 10–12 @ 140 lb');
check('one without says how to pick', /pick a weight/.test(acc.find(b => b.exercise === 'Dumbbell Fly')?.plan || ''));
check('no lift appears twice', new Set(full.map(b => b.exercise)).size === full.length);
check('the warm-up climbs to the top set', warmupRamp(225, false).join() === '115,160,190', warmupRamp(225, false).join());
check('the objective is the goal lift', todaysObjective([{ exercise: 'Curl', muscle: 'Biceps', weight: 60, reps: 8 }, { exercise: 'Bench', muscle: 'Chest', weight: 225, reps: 5 }], name => name === 'Bench')?.exercise === 'Bench');

console.log("\nAdam's bench: close, nothing heavy logged");
const iso = days => { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); };
const ahead = days => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
const sets = [[100, 225, 3], [70, 205, 8], [60, 205, 8], [40, 210, 7], [30, 205, 8], [5, 215, 3]];
const bench = sets.map(([ago, weight, reps], i) => ({ id: `b${i}`, date: iso(ago), title: 'x', muscles: [], topSets: [{ lift: 'Bench', weight, reps, completed: true }] }));
const goal = { id: 'g', type: 'Strength', title: 'Bench', exercise: 'Bench', target: '275', unit: 'lb', date: ahead(49) };
const [verdict] = goalFeasibility([goal], bench);
check('it is a question, not out of reach', verdict.verdict === 'needs-more', verdict.verdict);
check('and says to test a heavy single', /heavy single/.test(verdict.change || ''), verdict.change);
const pill = goalProgress(goal, bench, verdict, null, 'calculated');
check('the pill is not red', pill.tone !== 'off-track' && pill.label === 'Close — test it', `${pill.tone} ${pill.label}`);
const tested = [...bench, { id: 's', date: iso(3), title: 'x', muscles: [], topSets: [{ lift: 'Bench', weight: 240, reps: 1, completed: true }] }];
const [after] = goalFeasibility([goal], tested);
check('a recent heavy single settles it', after.verdict !== 'needs-more', after.verdict);
const far = { ...goal, target: '350' };
check('far past the ceiling is still out of reach', goalFeasibility([far], bench)[0].verdict === 'out-of-reach');

if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall passed');
