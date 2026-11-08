/* AN EXERCISE CAN BE MADE FROM THE SPLIT DAY.

   Picking lifts for a split day meant choosing from the library, filtered to
   the day's muscles — so someone with a thin library had a handful of lifts
   and no way to add the one she does without leaving the split. The day now
   offers to create a lift that is not there, and to show every lift instead
   of only the day's muscles. */
import { readFileSync } from 'node:fs';

let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : d ? ` — ${d}` : ''}`); if (!c) fails++; };
const page = readFileSync('src/pages/TrainingPlanPage.tsx', 'utf8');

console.log('\nThe split day can make an exercise');
check('a typed lift that is not in the library is offered to create', /＋ Create “\{typedLift\}”/.test(page) && /typedLift&&!typedExists/.test(page));
check('and there is a way in without searching first', /＋ Create a new exercise/.test(page));
check('it asks what the lift trains, starting from the day\'s muscles', /What does it train\?/.test(page) && /setNewLiftMuscles\(active\.muscles\.filter/.test(page));
check('it goes into the library as a programmable strength lift', /addLibraryExercise\(\{name,kind:'Strength',muscles:newLiftMuscles,[^}]*categories:\['Strength'\]\}\)/.test(page));
check('and onto this day, with its muscles', /updateDay\(\{exercises:\[\.\.\.active\.exercises,name\],muscles:Array\.from\(new Set\(\[\.\.\.active\.muscles,\.\.\.newLiftMuscles\]\)\)\}\)/.test(page));
check('a name already in the library is used, not duplicated', /if\(newLiftDuplicate\)\{addExercise\(newLiftDuplicate\.name\)/.test(page));

console.log('\nAnd can see past its own muscles');
check('every lift can be shown, not only the day\'s muscles', /showEveryLift\|\|exercise\.muscles\.some/.test(page) && /'Show every lift'/.test(page));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
