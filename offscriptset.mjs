/* A SET THAT IGNORED THE PRESCRIPTION IS NOT THE LAST LOAD "AT" IT.

   Preston, sick, was asked for 265×6 on the shoulder press and did 160×10.
   That set was filed as his last completed 6, so after three 265×5
   near-misses the back-off sent him to 160×6 — a hundred pounds under the
   bar he had just failed by a single rep. */
import { bestsFromHistory } from './src/features/training/aiPlanService.ts';

let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${d ? ` — ${d}` : ''}`); if (!c) fails++; };
const rec = (date, weight, reps, prescribedReps) => ({ date, topSets: [{ lift: 'Smith Machine Shoulder Press', weight, reps, prescribedReps, completed: true }] });

const history = [
  rec('2026-11-01', 265, 5, 6),
  rec('2026-10-28', 265, 5, 6),
  rec('2026-10-24', 265, 5, 6),
  rec('2026-10-19', 245, 8, 8),
  rec('2026-10-15', 230, 10, 10),
  rec('2026-10-08', 160, 10, 6),
  rec('2026-09-14', 250, 6, 6),
];
const { misses, lastAt } = bestsFromHistory(history, '2026-11-05');
const key = [...lastAt.keys()][0];

console.log('\n  three misses at the 6');
check('counted at 6 reps', misses.get(key)?.get(6) === 3, String(misses.get(key)?.get(6)));

console.log('\n  the last completed 6 is the 250×6, not the off-script 160×10');
check('lastAt[6] = 250', lastAt.get(key)?.get(6) === 250, String(lastAt.get(key)?.get(6)));
check('the 160×10 is filed as a set of 10', lastAt.get(key)?.get(10) === 230 || lastAt.get(key)?.get(10) === 160, String(lastAt.get(key)?.get(10)));

console.log('\n  a set that answered its prescription still files under it');
const answered = bestsFromHistory([rec('2026-11-01', 240, 7, 6)], '2026-11-02').lastAt;
check('240×7 asked for 6 is the last 6', [...answered.values()][0]?.get(6) === 240, String([...answered.values()][0]?.get(6)));

console.log(fails ? `\n  ${fails} failing` : '\n  all passing');
process.exit(fails ? 1 : 0);
