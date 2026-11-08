/* A STARTER DAY IS A REAL DAY. Setup fills each lifting day with one staple
   per muscle (up to three), the goal lift first on the day it fits best. */
import { starterSplit, defaultLifts } from './src/pages/OnboardingPage.tsx';
import { starterExercises, isProgrammableStrength } from './src/features/training/TrainingLibraryProvider.tsx';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${detail}`}`); if (!ok) fails += 1; };
const library = starterExercises.filter(exercise => exercise.enabled && isProgrammableStrength(exercise));

const hybrid = starterSplit('Hybrid', 4);
check('hybrid names are plain', hybrid.map(day => day.name).join() === 'Chest & Back,Run,Shoulders & Arms,Lower Body', hybrid.map(d => d.name).join());
check('runner names are plain', starterSplit('Endurance', 3).map(day => day.name).join() === 'Speed Run,Easy Run,Long Run');

const none = defaultLifts(hybrid, library, []);
check('Chest & Back is a bench and a row', none[0]?.join() === 'Bench Press,Barbell Row', String(none[0]));
check('Shoulders & Arms is press, curl, pushdown', none[2]?.join() === 'Overhead Press,Barbell Curl,Triceps Pushdown', String(none[2]));
check('Lower Body is a squat and an RDL', none[3]?.join() === 'Back Squat,Romanian Deadlift', String(none[3]));
check('the run day has no lifts', none[1] === undefined);

const dead = defaultLifts(hybrid, library, ['Deadlift']);
check('a deadlift goal goes to Lower Body, first', dead[3]?.[0] === 'Deadlift', String(dead[3]));
check('…and not to Chest & Back', !dead[0]?.includes('Deadlift'), String(dead[0]));
check('…and covers the hamstrings, so no RDL as well', !dead[3]?.includes('Romanian Deadlift'), String(dead[3]));
const pull = defaultLifts(hybrid, library, ['Pull Ups']);
check('a pull-up goal replaces the row', pull[0]?.join() === 'Pull Ups,Bench Press', String(pull[0]));

const five = starterSplit('Strength', 5);
const fiveLifts = defaultLifts(five, library, []);
check('a repeat day is a different day', fiveLifts[3]?.join() !== fiveLifts[0]?.join(), `${fiveLifts[0]} / ${fiveLifts[3]}`);
check('no day has more than three lifts', Object.values(fiveLifts).every(list => list.length <= 3));
check('kept lifts are kept', defaultLifts([{ name: 'Mine', type: 'Strength', muscles: ['Chest'], exercises: ['Push Ups'] }], library, [])[0].join() === 'Push Ups');

console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
