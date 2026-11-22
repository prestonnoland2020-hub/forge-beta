/* Guided: a working set that felt easy starts heavier next time, as the done
   screen promises. Run: npx vite-node guidedeasy.mjs */
const store = {}; globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
const { setEffort } = await import('./src/lib/setEffort.ts');
const { weightsFromTopSets } = await import('./src/lib/guided/fromHistory.ts');
const { heavierNextTime } = await import('./src/lib/guided/builder.ts');

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };

const day = '2026-11-21';
const sets = [
  { moveId: 'db-row', name: 'One-arm dumbbell row', reps: 10, weight: 15, feel: 'easy' },
  { moveId: 'db-rdl', name: 'Dumbbell Romanian deadlift', reps: 10, weight: 15, feel: 'right' },
  { moveId: 'goblet', name: 'Goblet squat', reps: 10, weight: 15, feel: 'hard' },
];
setEffort(day, 'One-arm dumbbell row', 'easy');
setEffort(day, 'Dumbbell Romanian deadlift', 'good');
const w = weightsFromTopSets([{ date: day, topSets: sets.map(s => ({ lift: s.name, weight: s.weight, reps: s.reps, completed: true })) }], false);
const promised = heavierNextTime(sets);
check('the done screen promises heavier only for the easy set', promised.length === 1 && promised[0] === 'One-arm dumbbell row', JSON.stringify(promised));
const ids = Object.keys(w);
console.log('  weights', JSON.stringify(w));
check('easy 15 x 10 → 20 lb next time', Object.entries(w).some(([id, v]) => /row/.test(id) && v === 20));
check('just right 15 x 10 → 15 lb next time', Object.entries(w).some(([id, v]) => /rdl|romanian/.test(id) && v === 15));
check('too hard 15 x 10 → not heavier', Object.entries(w).every(([id, v]) => !/goblet/.test(id) || v <= 15));
check('every weight is a 5 lb step', ids.every(id => w[id] % 5 === 0 && w[id] > 0));
const heavy = weightsFromTopSets([{ date: '2026-11-20', topSets: [{ lift: 'Goblet squat', weight: 70, reps: 3, completed: true }] }], false);
setEffort('2026-11-20', 'Goblet squat', 'easy');
const heavy2 = weightsFromTopSets([{ date: '2026-11-20', topSets: [{ lift: 'Goblet squat', weight: 70, reps: 3, completed: true }] }], false);
check('a heavy triple still goes through the estimate (no +step on top of it)', Object.values(heavy2).every(v => v < 70), JSON.stringify(heavy2));

if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall passed');
