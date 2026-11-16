/* A SET SAVED UNDER THE OLD CURVE MUST NOT REACH A GOAL.

   405 x 8 was stored as 503 before the curve was softened; today it reads
   481. The device kept the stored number, so a 500 squat goal read as
   reached on a lifter whose best set is worth 487. */
import { goalFeasibility } from './src/lib/goalFeasibility.ts';
import { calculateEstimatedOneRepMax, topSetMax } from './src/lib/strength.ts';

let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${d ? ` — ${d}` : ''}`); if (!c) fails++; };
const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const inWeeks = n => { const d = new Date(); d.setDate(d.getDate() + n * 7); return d.toISOString().slice(0, 10); };

check('weight and reps win over a stale stored max', topSetMax({ weight: 405, reps: 8, calculatedMax: 503 }) === calculateEstimatedOneRepMax(405, 8), String(topSetMax({ weight: 405, reps: 8, calculatedMax: 503 })));
check('a stored max still stands when there is nothing to recompute from', topSetMax({ calculatedMax: 300 }) === 300);

const squat = (ago, weight, reps, stored) => ({ id: `s${ago}`, date: day(ago), title: 'Legs', muscles: ['Quads'], hasCardio: false,
  topSets: [{ muscle: 'Quads', lift: 'Squat', weight, reps, calculatedMax: stored, completed: true }] });
const records = [squat(28, 405, 8, 503), squat(16, 430, 6, 499), squat(7, 435, 4, 475)];
const goal = { type: 'Strength', title: '500 lb squat', exercise: 'Squat', target: '500', unit: 'lb', date: inWeeks(6) };
const verdict = goalFeasibility([goal], records)[0];
check('the prediction starts from today\'s curve, not the stored 503', verdict?.prediction?.start < 500, String(verdict?.prediction?.start));
check('a 487 squat is not "Reached" on a 500 goal', !/^Reached/.test(verdict?.say || ''), verdict?.say);

console.log(fails ? `\n  ${fails} failed` : '\n  all passed');
process.exit(fails ? 1 : 0);
