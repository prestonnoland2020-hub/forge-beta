/* Guided: a later set's card says what changed, "Same as before" only when nothing did.
   Run: npx vite-node guidedcardline.mjs */
const { changeNote, laterSetTail } = await import('./src/lib/guided/builder.ts');
let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${detail}`}`); if (!ok) fails += 1; };
const a = { name: 'Squat', reps: 12, weight: 135 };
const tail = (cur, last = false, prev = a) => laterSetTail(last, changeNote(prev, cur, 'pounds'));
check('unchanged: Same as before.', tail({ ...a }) === 'Same as before.', tail({ ...a }));
check('no previous set: Same as before.', laterSetTail(false, changeNote(null, a, 'pounds')) === 'Same as before.');
check('weight up', tail({ ...a, weight: 140 }) === 'Up to 140 pounds, from 135.', tail({ ...a, weight: 140 }));
check('weight down', tail({ ...a, weight: 130 }) === 'Down to 130 pounds, from 135.', tail({ ...a, weight: 130 }));
check('reps changed', tail({ ...a, reps: 14 }) === 'Now 14 reps, up from 12.', tail({ ...a, reps: 14 }));
check('reps down', tail({ ...a, reps: 10 }) === 'Now 10 reps, down from 12.');
check('seconds changed', laterSetTail(false, changeNote({ name: 'Plank', reps: 30, weight: null }, { name: 'Plank', reps: 40, weight: null }, 'pounds', true)) === 'Now 40 seconds, up from 30.');
check('move swapped', tail({ name: 'Goblet squat', reps: 12, weight: 135 }) === 'Switched from Squat.', tail({ name: 'Goblet squat', reps: 12, weight: 135 }));
check('last set unchanged: Make it count.', tail({ ...a }, true) === 'Make it count.');
check('last set changed: change then Make it count.', tail({ ...a, weight: 140 }, true) === 'Up to 140 pounds, from 135. Make it count.');
console.log(fails ? `\n${fails} FAILED` : '\nall passed'); process.exit(fails ? 1 : 0);
