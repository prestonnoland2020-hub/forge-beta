/* "WHY IS MY ASSIGNED LEG DAY 2 CALLED AFTERNOON WEIGHT TRAINING?"

   A Strava import arrives titled whatever Strava called it. Preston opened one,
   assigned it to Legs 2 in the split-day picker, saved, and the day was still
   called "Afternoon Weight Training" — on the Plan tab, in history, everywhere.
   "This should never be the case if I'm choosing my split day."

   The title is deliberately sticky, and for a good reason that is written down
   in the save path: logging cardio creates the day up front, which advances the
   split cursor, so recomputing the title at save time would stamp the NEXT
   split day's name onto the session just logged. That reasoning covers the
   cursor moving underneath a finished day. It does not cover the athlete
   explicitly overruling the name — choosing the day names the day.

   Read off the source, because the alternative is driving the whole logger in a
   browser to assert one string. */
import { readFileSync } from 'node:fs';

let fails = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`);
  if (!ok) fails += 1;
};
const src = readFileSync('./src/pages/ProductPages.tsx', 'utf8');
const titleLine = (src.match(/const title=[^\n]*/) || [''])[0];

console.log('\nAn explicitly chosen split day names the day');
check('the assigned day\'s name is read', /const assignedName=dayOverride\?savedDays\[selectedPlanDay\]\?\.name:''/.test(src), 'assignedName is not derived');
check('and it comes FIRST, ahead of the imported title',
  /^const title=assignedName\|\|/.test(titleLine), titleLine.slice(0, 80));
check('only when the athlete actually chose one', /assignedName=dayOverride\?/.test(src));

console.log('\nAnd everything the stickiness was protecting still holds');
/* Each of these was a real bug once. The order of the fallbacks IS the
   behaviour, so it is asserted as an order rather than as a set. */
/* Asserted as a single ordered pattern rather than by splitting on `||` — the
   last fallback contains a nested `||` of its own, so splitting reports five
   links in a chain of four. */
const CHAIN = /^const title=assignedName\|\|editingRecord\?\.title\|\|existingDay\?\.title\|\|\(usingSplit\?\(plannedDay\?\.name\|\|'Planned Workout'\):'Custom Workout'\);$/;
check('the fallback chain is exactly: chosen day, the edit, the saved day, the plan',
  CHAIN.test(titleLine.trim()), titleLine.trim());
/* The note explaining WHY it is sticky has to survive, or the next person to
   read this line removes the protection along with the bug. */
check('the reason the title is sticky is still written down',
  /Once the day exists its title stands/.test(src) && /advances the split cursor/.test(src));

console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
