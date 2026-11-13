/* ADAM'S BENCH: 215 x 3 LAST TIME, AND THE FOUR-REP WEEK ASKED FOR 225 x 4.

   The ask was read off his heaviest four, from August. A rep week now stays
   one plate step from what his recent sets imply at its reps. */
import { bestsFromHistory, wavePrescription } from './src/features/training/aiPlanService.ts';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${detail}`}`); if (!ok) fails += 1; };
const raw = [['2026-07-06',225,3],['2026-08-01',205,8],['2026-08-06',230,3],['2026-08-06',225,4],['2026-08-14',205,8],['2026-08-20',230,3],['2026-08-24',215,5],['2026-09-05',205,8],['2026-09-10',185,13],['2026-09-17',210,7,8],['2026-10-05',225,3,8],['2026-10-12',205,8,6],['2026-11-07',215,3]];
const records = raw.map(([date, weight, reps, pr]) => ({ date, topSets: [{ lift: 'Bench', weight, reps, completed: true, prescribedReps: pr }] }));
const h = bestsFromHistory(records, '2026-11-13'); const k = [...h.bests.keys()][0];
const at = week => wavePrescription(h.bests.get(k), week, { anchors: h.anchors.get(k), lastAt: h.lastAt.get(k), latest: h.latest.get(k), tests: false });
console.log('\nAdam, after 215 x 3');
check('the four-rep week is 210 x 4, not 225', at(2).weight === 210 && at(2).reps === 4, `${at(2).weight} x ${at(2).reps}`);
check('the double is 225 — what he said he has', at(3).weight === 225 && at(3).reps === 2, `${at(3).weight} x ${at(3).reps}`);
check('the eight stays on his recent 205 x 8', at(0).weight <= 210, `${at(0).weight}`);
const fresh = bestsFromHistory(records, '2026-11-13').latest.get(k);
check('only the last eight weeks are read', fresh.every(set => set.date >= '2026-09-18'), fresh.map(s => s.date).join());
if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall passed');
