/* GUIDED: THE LOG'S NOTES SAY WHAT WAS DONE. A set reported by voice as
   20 lb x 8 followed by 20 lb x 10 was written "2x8 @ 20 lb" (reps of the
   first set, weight of the last). Uniform sets stay short; mixed sets list. */
import { moveNote } from './src/lib/guided/notes.ts';
let fails = 0;
const check = (l, got, want) => { const ok = got === want; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${ok ? '' : ` — got "${got}", want "${want}"`}`); if (!ok) fails++; };
check('uniform weighted', moveNote('Goblet squat', [{ reps: 10, weight: 15 }, { reps: 10, weight: 15 }], 'lb'), 'Goblet squat 2×10 @ 15 lb');
check('voice report then card', moveNote('Dumbbell Romanian deadlift', [{ reps: 8, weight: 20 }, { reps: 10, weight: 20 }], 'lb'), 'Dumbbell Romanian deadlift 20×8, 20×10 lb');
check('drop then back up', moveNote('Lat Pulldown', [{ reps: 10, weight: 45 }, { reps: 10, weight: 35 }, { reps: 10, weight: 45 }], 'lb'), 'Lat Pulldown 45×10, 35×10, 45×10 lb');
check('bodyweight uniform', moveNote('Push-up', [{ reps: 10, weight: null }, { reps: 10, weight: null }], 'lb'), 'Push-up 2×10');
check('bodyweight mixed', moveNote('Push-up', [{ reps: 10, weight: null }, { reps: 8, weight: null }], 'lb'), 'Push-up 10, 8');
check('timed', moveNote('Plank', [{ reps: 20, weight: null, timed: true }, { reps: 20, weight: null, timed: true }], 'lb'), 'Plank 2×20s');
check('kg', moveNote('Bench Press', [{ reps: 5, weight: 20 }], 'kg'), 'Bench Press 1×5 @ 20 kg');
console.log(fails ? `\n${fails} failed` : '\nall passed'); process.exit(fails ? 1 : 0);
