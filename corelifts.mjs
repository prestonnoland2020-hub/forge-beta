/* THIRTY-SEVEN MOVEMENTS, ALPHABETICALLY, TO SOMEBODY NINETY SECONDS IN.

   The goal picker offered the whole exercise library sorted by name, which
   puts "Assault Bike" and "Burpee Broad Jumps" above "Deadlift". A first goal
   is not a menu problem — it is four lifts, and everything else at that moment
   is noise. Preston: "it should be a simplified list like Bench, Deadlift,
   Squat, Pull Ups (added weight or bodyweight), everything else at the time is
   noise, also prioritize those in goals as well."

   Two different rules, and this pins both: ONLY the four on a first goal,
   the four FIRST everywhere else. */
import { CORE_LIFTS, CORE_LIFT_LABELS, coreFirst, coreOnly, isCoreLift, isWeightedBodyweight } from './src/lib/coreLifts.ts';
import { starterExercises, isProgrammableStrength } from './src/features/training/TrainingLibraryProvider.tsx';

let fails = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`);
  if (!ok) fails += 1;
};
/* The real library, filtered the way the goal picker filters it. */
const LIBRARY = starterExercises.filter(item => item.enabled && isProgrammableStrength(item)).map(item => item.name).sort((a, b) => a.localeCompare(b));

console.log('\nThe four are the four, and they are in the library');
check('bench, deadlift, squat, pull ups', CORE_LIFTS.length === 4, CORE_LIFTS.join(', '));
/* THE BUG THIS FOUND. Pull Ups carried detail "CrossFit · repetitions" and no
   categories, so isProgrammableStrength refused it — one of the four lifts a
   strength program is measured by could not be chosen as a goal at all. */
for (const lift of CORE_LIFTS) check(`${lift} is offerable as a goal`, LIBRARY.includes(lift), 'not in the programmable library');
check('and they are named the way people say them',
  CORE_LIFT_LABELS['Back Squat'] === 'Squat' && CORE_LIFT_LABELS['Bench Press'] === 'Bench');

console.log('\nA first goal is offered the four and nothing else');
const first = coreOnly(LIBRARY);
check('four options, not thirty-seven', first.length === 4, `${first.length} of ${LIBRARY.length}`);
check('in the order people say them', first.join(' / ') === 'Bench Press / Deadlift / Back Squat / Pull Ups', first.join(' / '));
check('and every one of them is real — matched against the library, never hardcoded',
  first.every(name => LIBRARY.includes(name)));
/* A name that is not in the athlete's library must not be offered: a goal on a
   lift they never log is a goal no set will ever match. */
check('a library missing one simply offers three', coreOnly(LIBRARY.filter(name => name !== 'Deadlift')).length === 3);

console.log('\nEverywhere else they come first rather than instead');
const ordered = coreFirst(LIBRARY);
check('nothing is lost', ordered.length === LIBRARY.length, `${ordered.length} vs ${LIBRARY.length}`);
check('no duplicates', new Set(ordered).size === ordered.length);
check('the four lead', ordered.slice(0, 4).join(' / ') === first.join(' / '), ordered.slice(0, 4).join(' / '));
check('and the rest keep the order they arrived in',
  ordered.slice(4).join('|') === LIBRARY.filter(name => !isCoreLift(name)).join('|'));
/* An athlete six months in who wants a goal on their overhead press still has
   the whole library — one line further down. */
check('the long tail is still there', ordered.includes('Overhead Press') && ordered.includes('Barbell Curl'));

console.log('\nAnd it knows the lift by what people call it, not by the row name');
check('"Squat" is the back squat', isCoreLift('Squat') && isCoreLift('Back Squat'));
check('"Bench" is the bench press', isCoreLift('Bench') && isCoreLift('Bench Press'));
/* Same family, different lift. A Smith machine squat is not a squat, and a
   goal set on one must not be measured by the other. */
check('a Smith machine squat is not', !isCoreLift('Smith Machine Squat'));
check('nor is an incline bench', !isCoreLift('Smith Machine Incline Bench'));
check('nor is a hack squat', !isCoreLift('Hack Squat'));
check('nothing at all is not a core lift', !isCoreLift('') && !isCoreLift(undefined) && !isCoreLift(null));

console.log('\nA pull-up goal is two different goals');
/* Most people mean a rep count at their own body weight; a strong lifter means
   a plate hanging off a belt. Assuming either is wrong for half of them. */
check('pull ups are measured two ways', isWeightedBodyweight('Pull Ups'));
check('however they are spelled', isWeightedBodyweight('pull-ups') && isWeightedBodyweight('Pullups'));
check('and dips and push ups are the same question', isWeightedBodyweight('Dips') && isWeightedBodyweight('Push Ups'));
check('a barbell lift is not', !isWeightedBodyweight('Deadlift') && !isWeightedBodyweight('Bench Press'));

console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
