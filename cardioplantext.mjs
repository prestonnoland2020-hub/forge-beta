/* THE AI BOX ON THE PLAN BUILDER. Describe a session, get a prescription.

   The logger's sentence reader already exists; what is new is the mapping onto
   a plan, and the whole risk lives there: a plan is what the wave and the pace
   model read, so a structure guessed out of a sentence puts numbers in front
   of the athlete that nobody said. Three shapes are recognised and everything
   else keeps their own words. These checks are that boundary. */
import { planFromParsedRows, toMiles, isTimeUnit } from './src/lib/cardioPlanFromText.ts';

let fails = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`);
  if (!ok) fails += 1;
};
const row = (cardioType, distance, unit, timeMinutes) => ({ cardioType, distance, unit, timeMinutes });

console.log('\nOne piece is a steady session');
let plan = planFromParsedRows([row('Run', 4, 'miles', 32.1667)], '4 mile run in 32:10');
check('it is steady', plan.structure === 'Steady');
check('the distance is the distance', plan.distance === '4' && plan.distanceUnit === 'miles');
check('the duration is the duration', plan.duration === '32.2', plan.duration);
/* 32:10 over four miles is 8:02.5 a mile; a pace is printed to the second. */
check('and the pace is computed from both', plan.pace === '8:03/mi', plan.pace);

plan = planFromParsedRows([row('Bike', 0, 'minutes', 45)], '45 minutes on the bike');
check('a time-only session keeps its duration', plan.duration === '45');
check('and claims no distance', plan.distance === undefined);
check('and claims no pace, because none was stated', plan.pace === undefined);

console.log('\nThe same piece repeated is an interval set');
plan = planFromParsedRows(Array.from({ length: 6 }, () => row('Run', 400, 'meters', 1.5)), '6x400m');
check('it is intervals', plan.structure === 'Intervals');
check('the repeat count is the number of pieces', plan.repeats === '6');
check('measured by distance', plan.intervalBasis === 'Distance' && plan.workDistance === '400' && plan.workUnit === 'meters');
check('with no warm-up invented', plan.warmup === undefined && plan.cooldown === undefined);

plan = planFromParsedRows(Array.from({ length: 5 }, () => row('Run', 0, 'minutes', 1)), '5 x 1 minute hard');
check('a time-based set is measured in seconds', plan.intervalBasis === 'Time' && plan.workDistance === '60' && plan.workUnit === 'seconds');

console.log('\nA warm-up and cooldown around a set are read as that');
plan = planFromParsedRows([
  row('Run', 1, 'miles', 9),
  ...Array.from({ length: 6 }, () => row('Run', 400, 'meters', 1.5)),
  row('Run', 1, 'miles', 9),
], '1 mile warmup, 6x400m, 1 mile cooldown');
check('the middle block is the work set', plan.structure === 'Intervals' && plan.repeats === '6');
check('the leading leg is the warm-up', plan.warmup === '1 mile', plan.warmup);
check('the trailing leg is the cooldown', plan.cooldown === '1 mile', plan.cooldown);
plan = planFromParsedRows([
  row('Run', 2, 'miles', 17),
  ...Array.from({ length: 4 }, () => row('Run', 800, 'meters', 3)),
], '2 mile warmup then 4x800');
check('and a plural leg stays plural', plan.warmup === '2 miles', plan.warmup);

console.log('\nAnything else keeps the athlete’s own words');
const mixed = 'easy 2 miles, then 3 miles at tempo, then 400m, then 800m, then a mile';
plan = planFromParsedRows([
  row('Run', 2, 'miles', 18), row('Run', 3, 'miles', 21),
  row('Run', 400, 'meters', 1.4), row('Run', 800, 'meters', 3), row('Run', 1, 'miles', 6),
], mixed);
check('no structure is guessed', plan.structure === 'Custom');
check('the sentence survives verbatim', plan.customTarget === mixed);

plan = planFromParsedRows([
  row('Run', 1, 'miles', 9), row('Run', 1, 'miles', 9),
  ...Array.from({ length: 4 }, () => row('Run', 800, 'meters', 3)),
], 'two mile warmup then 4x800');
check('two legs on one side is more than the builder can hold', plan.structure === 'Custom');

console.log('\nNothing readable produces nothing, not an empty plan');
check('no rows at all', planFromParsedRows([], 'went outside') === null);
check('rows with no numbers on them', planFromParsedRows([row('Run', 0, 'miles', 0)], 'a run') === null);
check('a row with no activity is not a piece', planFromParsedRows([row('', 3, 'miles', 24)], '3 miles') === null);

console.log('\nThe unit helpers the mapping leans on');
check('miles are miles', toMiles(3, 'miles') === 3);
check('metres convert', Math.abs(toMiles(1609.344, 'meters') - 1) < 1e-9);
check('a time unit carries no distance', toMiles(30, 'minutes') === 0);
check('and is recognised as one', isTimeUnit('minutes') && isTimeUnit('seconds') && !isTimeUnit('miles'));

console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
