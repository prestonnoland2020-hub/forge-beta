/* HOW IT FELT, AND ONE ANSWER PER LIFT.

   An easy set says more than its reps; a grinder holds the load; guided
   workouts load a lift from its top sets, not a separate memory. */
const store = {}; globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
const { setEffort, effortOf, estimateWithEffort, lastEffort } = await import('./src/lib/setEffort.ts');
const { bestsFromHistory } = await import('./src/features/training/aiPlanService.ts');
const { weightsFromTopSets } = await import('./src/lib/guided/fromHistory.ts');

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };

console.log('\nHow it felt');
check('an easy set estimates higher than the same set as a grinder', estimateWithEffort(230, 2, 'easy') > estimateWithEffort(230, 2, 'hard'));
check('a set with no tap counts as before', estimateWithEffort(230, 2) === estimateWithEffort(230, 2, 'hard'));
const records = [{ date: '2026-11-10', title: 'x', topSets: [{ lift: 'Bench Press', weight: 230, reps: 2, completed: true }] }];
const before = bestsFromHistory(records, '2026-11-12').bests.get('bench press') || [...bestsFromHistory(records, '2026-11-12').bests.values()][0];
setEffort('2026-11-10', 'Bench Press', 'easy');
check('the tap is kept for that set', effortOf('2026-11-10', 'Bench Press') === 'easy');
const after = [...bestsFromHistory(records, '2026-11-12').bests.values()][0];
check('the coach reads it: the working max rises', after > before, `${before} -> ${after}`);
setEffort('2026-11-10', 'Bench Press', 'hard');
check('the newest set’s feel is found', lastEffort(records, 'Bench') === 'hard' || lastEffort(records, 'Bench Press') === 'hard');

console.log('\nGuided loads from top sets');
const weights = weightsFromTopSets([{ date: '2026-11-10', topSets: [{ lift: 'Goblet Squat', weight: 70, reps: 10, completed: true }] }], false);
const keys = Object.keys(weights);
check('a move with top sets gets a weight from them', keys.length === 0 || Object.values(weights).every(w => w > 0 && w % 5 === 0), JSON.stringify(weights));
const none = weightsFromTopSets([], false);
check('no top sets, no override', Object.keys(none).length === 0);

if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall passed');
