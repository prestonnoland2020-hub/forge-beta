/* ON A BLANK DAY, THE MUSCLES TICKED ARE THE MUSCLES TRAINED.

   (This said the opposite for a day. Preston: a custom workout with muscle
   groups selected should count — a strength dot in Activities and a session
   in muscle frequency — even when no top set was typed in.)

   On a blank (custom) day the muscle chips choose which lifts are offered and
   name the day. They were also written into the saved day's muscles, so
   ticking Chest + Back and logging one curl credited a chest and a back
   session to Insights' frequency chart — and deleting the last set fell back
   to the old muscle list, leaving a day with nothing logged on it counted as
   a workout in Activities.

   Read off the source, because what matters is which muscles each write
   path puts on the record. */
import { readFileSync } from 'node:fs';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };
const page = readFileSync('./src/pages/ProductPages.tsx', 'utf8');

console.log('\nOn a blank day, the muscles ticked are muscles trained');
check('a set logged on a blank day carries the ticked muscles', /const dayMuscles=usingSplit\?\[\]:freeMuscles\.filter/.test(page) && /muscles:Array\.from\(new Set\(\[\.\.\.dayMuscles,\.\.\.\(primary\.length\?primary:\[set\.muscle\]\)\]\)\)/.test(page));
check('a blank day can be finished with only muscles ticked', /&&!blankMuscles\.length\)\{/.test(page));
check('and that day is saved with those muscles', /\(blankMuscles\.length\|\|exerciseDriven\.length\)\?Array\.from\(new Set\(\[\.\.\.blankMuscles,\.\.\.exerciseDriven\]\)\)/.test(page));

check('and a day already saved by its cardio keeps the ticked muscles at Finish', /draft\.muscles=Array\.from\(new Set\(\[\.\.\.existingDay\.muscles\.filter\(muscle=>muscle!=='Cardio'\),\.\.\.blankMuscles,/.test(page));

console.log('\nThe chips still do their other jobs');
check('they filter the lifts offered', /const sourceMuscles=usingSplit\?\(plannedDay\?\.muscles\?\?\[\]\):freeMuscles;/.test(page));
check('and they name the day', /const dayLabel=usingSplit\?\(plannedDay\?\.name\|\|''\):written\?\.name\|\|freeMuscles/.test(page));

console.log('\nDeleting the last set takes only the sets\' muscles with it');
check('the ticked muscles stay on the day', /const chips=!usingSplit&&!written\?freeMuscles/.test(page) && /new Set\(\[\.\.\.chips,\.\.\.remaining\.map/.test(page));
check('anything else empties, unless assigned to a split day', /muscles:muscles\.length\?muscles:savedDay\.splitPosition\?savedDay\.muscles:\[\]/.test(page));

console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
