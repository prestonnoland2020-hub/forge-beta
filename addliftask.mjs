/* A lift added by hand on the logger still gets a top set to aim for. */
import { suggestAdded } from './src/components/TopSetCards.tsx';
let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${detail}`}`); if (!ok) fails += 1; };
const a = suggestAdded({ weight: 135, reps: 10 }, 'lb');
check('last time 135 × 10 → 140 × 10', a.weight === 140 && a.reps === 10, JSON.stringify(a));
const b = suggestAdded({ weight: 30, reps: 12 }, 'lb');
check('a 15 lb plate-loaded lift steps 2.5 lb', suggestAdded({ weight: 15, reps: 12 }, 'lb').weight === 17.5);
check('a 30 lb dumbbell steps to 35 (dumbbells jump in 5s)', b.weight === 35 && b.reps === 12, JSON.stringify(b));
const c = suggestAdded({ weight: 225, reps: 1 }, 'lb');
check('a single becomes a set of 5, lighter than the single', c.reps === 5 && c.weight < 225 && c.weight > 180, JSON.stringify(c));
const d = suggestAdded(undefined, 'lb');
check('never done: 10 reps, weight found on the day', d.reps === 10 && d.weight === 0, JSON.stringify(d));
check('kg steps 2.5', suggestAdded({ weight: 60, reps: 8 }, 'kg').weight === 62.5);
if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall passed');
