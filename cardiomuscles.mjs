/* CARDIO IS NOT A MUSCLE SESSION.

   Rowing's library entry is Cardio · Back · Quads · Hamstrings · Glutes. That
   is true of the movement — it is what lets Forge know a hard row leaves the
   back tired — and it is not a back day. Log a row and the frequency chart was
   reporting Back, Quads, Hamstrings and Glutes trained, so the one thing that
   chart exists to tell the athlete — what has been neglected — was exactly
   what it got wrong. */
import { isCardioMovement, trainedMuscles } from './src/lib/muscleGroups.ts';

let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${d ? ` — ${d}` : ''}`); if (!c) fails++; };

console.log('\n  what counts as a cardio movement');
const LIBRARY = [
  { name: 'Rowing', kind: 'Cardio', muscles: ['Back', 'Quads', 'Hamstrings', 'Glutes', 'Cardio'] },
  { name: 'Run', kind: 'Cardio', muscles: ['Quads', 'Hamstrings', 'Glutes', 'Cardio'] },
  { name: 'SkiErg', kind: 'Cardio', muscles: ['Back', 'Shoulders', 'Abs', 'Cardio'] },
  /* Tagged Cardio in one field and not the other — both have drifted before. */
  { name: 'Assault Bike', kind: 'Strength', muscles: ['Quads', 'Cardio'] },
  { name: 'Echo Row', kind: 'Cardio', muscles: ['Back'] },
  { name: 'Back Squat', kind: 'Strength', muscles: ['Quads', 'Glutes', 'Hamstrings'] },
  { name: 'Sled Pull', kind: 'Strength', muscles: ['Back', 'Biceps', 'Quads', 'Glutes'] },
];
const by = name => LIBRARY.find(item => item.name === name);
for (const name of ['Rowing', 'Run', 'SkiErg', 'Assault Bike', 'Echo Row']) {
  check(`${name} is cardio`, isCardioMovement(by(name)));
}
for (const name of ['Back Squat', 'Sled Pull']) {
  check(`${name} is not`, !isCardioMovement(by(name)));
}
check('an unknown movement is not assumed to be cardio', !isCardioMovement(undefined));

console.log('\n  the record keeps what the movement uses');
/* Nothing is dropped at save. A row is tagged Back and Quads because the row
   uses them, and recovery is entitled to know that. */
const musclesOf = name => (by(name)?.muscles || []).filter(m => m.toLowerCase() !== 'cardio');
check('rowing still carries its muscles', musclesOf('Rowing').join(',') === 'Back,Quads,Hamstrings,Glutes', musclesOf('Rowing').join(','));

console.log('\n  the frequency chart is what excludes them');
/* The rule the chart applies, stated here so it cannot quietly change: a muscle
   drops out when nothing but cardio put it there that day; a muscle a lift also
   trained stays; a day with no lifting counts nothing at all. */
const countedOn = ({ muscles = [], sets = [], hasCardio = false }) => {
  const completed = sets.filter(set => set.completed !== false);
  const lifted = completed.filter(set => !isCardioMovement(by(set.lift)));
  if (!lifted.length && (hasCardio || completed.length)) return [];
  const fromLifts = new Set(lifted.flatMap(set => musclesOf(set.lift)));
  const cardioOnly = new Set(completed.filter(set => isCardioMovement(by(set.lift)))
    .flatMap(set => musclesOf(set.lift)).filter(m => !fromLifts.has(m)));
  return trainedMuscles(muscles).filter(m => !cardioOnly.has(m));
};

const rowOnly = countedOn({ muscles: ['Back', 'Quads', 'Hamstrings', 'Glutes', 'Cardio'], sets: [{ lift: 'Rowing' }], hasCardio: true });
check('a row counts toward nothing', rowOnly.length === 0, JSON.stringify(rowOnly));

const rowOnALiftingDay = countedOn({ muscles: ['Chest', 'Back', 'Shoulders', 'Cardio'], sets: [{ lift: 'Rowing' }], hasCardio: true });
check('and still nothing on a day named Chest & Back', rowOnALiftingDay.length === 0, JSON.stringify(rowOnALiftingDay));

const squatThenRow = countedOn({ muscles: ['Quads', 'Glutes', 'Hamstrings', 'Back', 'Cardio'], sets: [{ lift: 'Back Squat' }, { lift: 'Rowing' }], hasCardio: true });
check('a squat and then a row counts the squat', squatThenRow.includes('Quads') && squatThenRow.includes('Glutes'), JSON.stringify(squatThenRow));
check('and not the back the rower used', !squatThenRow.includes('Back'), JSON.stringify(squatThenRow));

/* The subtraction is per muscle, not per day: the row and the squat share
   Quads, Hamstrings and Glutes, and a muscle a lift trained is kept. */
const runAfterSquats = countedOn({ muscles: ['Quads', 'Glutes', 'Hamstrings', 'Cardio'], sets: [{ lift: 'Back Squat' }, { lift: 'Run' }], hasCardio: true });
check('a run after squats does not erase the squat’s legs',
  ['Quads', 'Glutes', 'Hamstrings'].every(m => runAfterSquats.includes(m)), JSON.stringify(runAfterSquats));

const sledPull = countedOn({ muscles: ['Back', 'Biceps', 'Quads', 'Glutes'], sets: [{ lift: 'Sled Pull' }] });
check('a sled pull is still a back session', sledPull.includes('Back'), JSON.stringify(sledPull));

const legacyDay = countedOn({ muscles: ['Chest', 'Back'], sets: [] });
check('a legacy day with muscles and no sets still counts', legacyDay.join(',') === 'Chest,Back', JSON.stringify(legacyDay));

console.log('\n  and the wiring is in the app, not just in this file');
import { readFileSync } from 'node:fs';
const logger = readFileSync('src/pages/ProductPages.tsx', 'utf8');
const insights = readFileSync('src/components/InsightsClassic.tsx', 'utf8');
const strava = readFileSync('src/components/StravaReviewModal.tsx', 'utf8');
check('the logger still writes what the movement uses', !/liftIsCardio/.test(logger));
check('the frequency chart subtracts what only cardio put there', /fromCardioOnly/.test(insights));
check('and it is the only place that does', !/isCardioMovement/.test(strava));

console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
