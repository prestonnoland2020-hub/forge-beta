/* TICKING A MUSCLE IS NOT TRAINING IT.

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

console.log('\nA set logged on a blank day credits only what it trains');
const quickLog = (page.match(/const result=addRecord\(\{date:sessionIso,title:dayName\|\|`Top set · \$\{set\.lift\}`,muscles:[^,]*\)\)/) || [''])[0];
check('the saved muscles come from the lift', /muscles:Array\.from\(new Set\(primary\.length\?primary:\[set\.muscle\]\)\)/.test(quickLog), quickLog.slice(0, 160));
check('and not from the chips', !/freeMuscles/.test(quickLog) && !/dayMuscles/.test(quickLog));

console.log('\nThe chips still do their real jobs');
check('they filter the lifts offered', /const sourceMuscles=usingSplit\?\(plannedDay\?\.muscles\?\?\[\]\):freeMuscles;/.test(page));
check('and they name the day', /const dayLabel=usingSplit\?\(plannedDay\?\.name\|\|''\):written\?\.name\|\|freeMuscles/.test(page));

console.log('\nDeleting the last set takes its muscles with it');
check('an emptied day is left with no muscles', /muscles:muscles\.length\?muscles:savedDay\.splitPosition\?savedDay\.muscles:\[\]/.test(page));
check('unless it was assigned to a split day', /savedDay\.splitPosition\?savedDay\.muscles/.test(page));

console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
