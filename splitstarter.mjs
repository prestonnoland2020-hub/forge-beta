/* A STARTER DAY IS A REAL DAY. Setup fills each lifting day with one staple
   per muscle (up to three), the goal lift first on the day it fits best. */
import { starterSplit, defaultLifts } from './src/pages/OnboardingPage.tsx';
import { starterExercises, isProgrammableStrength } from './src/features/training/TrainingLibraryProvider.tsx';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${detail}`}`); if (!ok) fails += 1; };
const library = starterExercises.filter(exercise => exercise.enabled && isProgrammableStrength(exercise));

const hybrid = starterSplit('Hybrid', 4);
const training = split => split.filter(day => day.type !== 'Rest');
const at = (split, name) => split.findIndex(day => day.name === name);
check('hybrid names are plain', training(hybrid).map(day => day.name).join() === 'Chest & Back,Run,Shoulders & Arms,Lower Body', hybrid.map(d => d.name).join());
check('runner names are plain', training(starterSplit('Endurance', 3)).map(day => day.name).join() === 'Speed Run,Easy Run,Long Run');

console.log('\nThe days off are in the cycle');
for (const count of [2, 3, 4, 5, 6]) {
  const split = starterSplit('Strength', count);
  check(`${count} days a week is ${count} training days and ${7 - count} rest in a 7-day cycle`, split.length === 7 && training(split).length === count, split.map(d => d.name).join());
  check(`…and the cycle starts on a training day`, split[0].type !== 'Rest');
}
check('7 days a week has no rest day', training(starterSplit('Strength', 7)).length === 7);
const CB = at(hybrid, 'Chest & Back'), RUN = at(hybrid, 'Run'), SA = at(hybrid, 'Shoulders & Arms'), LB = at(hybrid, 'Lower Body');

const none = defaultLifts(hybrid, library, []);
check('Chest & Back is a bench and a row', none[CB]?.join() === 'Bench Press,Barbell Row', String(none[CB]));
check('Shoulders & Arms is press, curl, pushdown', none[SA]?.join() === 'Overhead Press,Barbell Curl,Triceps Pushdown', String(none[SA]));
check('Lower Body is a squat and an RDL', none[LB]?.join() === 'Back Squat,Romanian Deadlift', String(none[LB]));
check('the run day has no lifts', none[RUN] === undefined);

const dead = defaultLifts(hybrid, library, ['Deadlift']);
check('a deadlift goal goes to Lower Body, first', dead[LB]?.[0] === 'Deadlift', String(dead[LB]));
check('…and not to Chest & Back', !dead[CB]?.includes('Deadlift'), String(dead[CB]));
check('…and covers the hamstrings, so no RDL as well', !dead[LB]?.includes('Romanian Deadlift'), String(dead[LB]));
const pull = defaultLifts(hybrid, library, ['Pull Ups']);
check('a pull-up goal replaces the row', pull[CB]?.join() === 'Pull Ups,Bench Press', String(pull[CB]));

const five = starterSplit('Strength', 5);
const fiveLifts = defaultLifts(five, library, []);
const first = fiveLifts[at(five, 'Chest & Back')], repeat = fiveLifts[at(five, 'Chest & Back 2')];
check('a repeat day is a different day', repeat?.join() !== first?.join(), `${first} / ${repeat}`);
check('no day has more than three lifts', Object.values(fiveLifts).every(list => list.length <= 3));
check('kept lifts are kept', defaultLifts([{ name: 'Mine', type: 'Strength', muscles: ['Chest'], exercises: ['Push Ups'] }], library, [])[0].join() === 'Push Ups');

console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
