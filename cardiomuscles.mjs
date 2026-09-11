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

console.log('\n  the muscles a day records');
/* The rule the logger applies, stated here so it cannot quietly change: a set
   on a cardio movement contributes nothing, and a day with no lifting on it
   takes no muscles from the split day it was logged against. */
const musclesForDay = ({ splitDayMuscles = [], sets = [], hasCardio = false }) => {
  const lifted = sets.filter(set => set.completed !== false && !isCardioMovement(by(set.lift)));
  const fromLifts = trainedMuscles(lifted.flatMap(set => by(set.lift)?.muscles || []));
  const content = !lifted.length && hasCardio ? [] : (splitDayMuscles.length ? trainedMuscles(splitDayMuscles) : fromLifts);
  return [...new Set([...content, ...(hasCardio ? ['Cardio'] : [])])];
};

const rowOnly = musclesForDay({ sets: [{ lift: 'Rowing', completed: true }], hasCardio: true });
check('a row records no muscles', rowOnly.join(',') === 'Cardio', JSON.stringify(rowOnly));

const rowOnALiftingDay = musclesForDay({ splitDayMuscles: ['Chest', 'Back', 'Shoulders'], sets: [{ lift: 'Rowing', completed: true }], hasCardio: true });
check('and it records none even on a day named Chest & Back', rowOnALiftingDay.join(',') === 'Cardio', JSON.stringify(rowOnALiftingDay));

const squatThenRow = musclesForDay({ splitDayMuscles: ['Quads', 'Glutes'], sets: [{ lift: 'Back Squat', completed: true }, { lift: 'Rowing', completed: true }], hasCardio: true });
check('a squat and then a row records the squat', squatThenRow.includes('Quads') && squatThenRow.includes('Cardio'), JSON.stringify(squatThenRow));
check('and does not pick up the rower’s back', !squatThenRow.includes('Back'), JSON.stringify(squatThenRow));

const sledPull = musclesForDay({ sets: [{ lift: 'Sled Pull', completed: true }] });
check('a sled pull is still a back session', sledPull.includes('Back'), JSON.stringify(sledPull));

console.log('\n  and the wiring is in the app, not just in this file');
import { readFileSync } from 'node:fs';
const logger = readFileSync('src/pages/ProductPages.tsx', 'utf8');
const insights = readFileSync('src/components/InsightsClassic.tsx', 'utf8');
const strava = readFileSync('src/components/StravaReviewModal.tsx', 'utf8');
check('the logger will not write muscles for a cardio lift', /liftIsCardio\(name\)\?\[\]/.test(logger));
check('and takes no split-day muscles when nothing was lifted', /!trainedALift&&hasCardio\?\[\]/.test(logger));
check('the frequency chart skips cardio-only days', /countsTowardMuscleFrequency/.test(insights));
check('and a Strava import does the same', /cardioLift\(lift\)/.test(strava));

console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
