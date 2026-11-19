/* SWITCHING A SPLIT SURVIVES LEAVING THE PAGE (Nov 19). The split page saves
   on a short delay; leaving it cancelled the delay, so Today kept the old split.
   The page must send any waiting save when it closes. */
import { readFileSync } from 'node:fs';
const source = readFileSync('src/pages/TrainingPlanPage.tsx', 'utf8');
let fails = 0;
const check = (label, ok) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) fails += 1; };
check('a waiting server save is remembered', /pendingServer\.current=\{name:splitName,days\}/.test(source));
check('a waiting settings save is remembered', /pendingSettings\.current=savedPlanState/.test(source));
check('closing the page sends what is waiting', /useEffect\(\(\)=>\(\)=>\{[\s\S]{0,200}pendingServer\.current[\s\S]{0,200}writeSplitToServer[\s\S]{0,200}saveAthleteSettings/.test(source));
if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall passed');
