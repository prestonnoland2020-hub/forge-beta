/* SETUP NEVER SHOWED WHAT IT BUILT, AND NEVER ASKED FOR WHAT IT BUILT IT FROM.

   Four steps of questions and then a home screen. Everything the athlete had
   just entered became a block somewhere out of sight, so the first plan they
   ever saw was one they had no part in — and two of the things it is built
   from were never asked at all: weeklyMileage sat at 0, so the first block was
   written for somebody who runs nothing, and no lift had any evidence behind
   it.

   The preview is the argument for filling both in, which only works if it is
   the REAL derivation. A flattering mock-up would be worse than nothing —
   they would meet the honest numbers on Monday and wonder which was lying. */
import { firstWeekPreview, LONG_RUN_SHARE } from './src/lib/firstWeekPreview.ts';
import { calculateEstimatedOneRepMax } from './src/lib/strength.ts';
import { wavePrescription } from './src/features/training/aiPlanService.ts';

let fails = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`);
  if (!ok) fails += 1;
};
const DAYS = [
  { name: 'Chest & Back', type: 'Strength', muscles: ['Chest', 'Back'], exercises: ['Bench Press'] },
  { name: 'Quality Cardio', type: 'Cardio', muscles: [], exercises: [] },
  { name: 'Lower Body', type: 'Strength', muscles: ['Quads'], exercises: ['Back Squat'] },
  { name: 'Easy Cardio', type: 'Cardio', muscles: [], exercises: [] },
  { name: 'Rest', type: 'Rest', muscles: [], exercises: [] },
];
const ask = (over = {}) => firstWeekPreview({ days: DAYS, baseline: {}, weeklyMiles: 0, unit: 'lb', ...over });

console.log('\nEvery day the athlete set up is on it, including the rest day');
const blank = ask();
check('one row per day', blank.length === DAYS.length, String(blank.length));
check('and the rest day says rest rather than vanishing',
  blank[4].kind === 'rest', blank[4].kind);

console.log('\nWith no bests entered it says so rather than inventing a load');
/* This is the honest version of an empty state and it is also the pitch: the
   preview fills in as they type, which is the only reason anybody would. */
check('no weight is printed', blank.every(day => !day.lift));
check('but the lift is still named', blank[0].unknownLift === 'Bench Press', blank[0].unknownLift);
check('and a cardio day is still a cardio day', blank[1].kind === 'run');

console.log('\nEnter a best and the real derivation fills it in');
/* THE SAME wavePrescription THE BLOCK USES, at week zero — eight reps, the
   lightest loads of the wave. Not a percentage written for the preview. */
const withBests = ask({ baseline: { 'Bench Press': { weight: 225, reps: 5 }, 'Back Squat': { weight: 315, reps: 5 } } });
const bench = withBests[0].lift;
check('the bench day carries a load', Boolean(bench), JSON.stringify(withBests[0]));
check('and it is the real prescription, not an invented one',
  bench.weight === wavePrescription(calculateEstimatedOneRepMax(225, 5), 0).weight, `${bench.weight}`);
check('week one is eight reps — the lightest week of the wave', bench.reps === 8, String(bench.reps));
/* A first week that asks for more than the athlete just told you they can do
   would end the preview's usefulness in one line. */
check('it asks for less than the set they entered', bench.weight < 225, `${bench.weight} against 225 × 5`);
check('the squat day gets its own number', withBests[2].lift.weight > bench.weight,
  `${withBests[2].lift.weight} vs ${bench.weight}`);
check('and a lift with no best entered still says so',
  ask({ baseline: { 'Bench Press': { weight: 225, reps: 5 } } })[2].unknownLift === 'Back Squat');

console.log('\nThe miles they entered are spread across the days that run');
const running = ask({ weeklyMiles: 20 });
const runs = running.filter(day => day.run);
check('both cardio days get a run', runs.length === 2, String(runs.length));
check('one of them is the long run', /Long run/.test(runs[0].run), runs[0].run);
check('and the other is easy', /Easy run/.test(runs[1].run), runs[1].run);
/* A third of the week is the shape the block itself uses. */
check(`the long run is about ${Math.round(LONG_RUN_SHARE * 100)}% of the week`,
  Number(runs[0].run.match(/(\d+)/)[1]) === Math.round(20 * LONG_RUN_SHARE), runs[0].run);
const total = runs.reduce((sum, day) => sum + Number(day.run.match(/(\d+)/)[1]), 0);
check('and the week adds up to roughly what they said', Math.abs(total - 20) <= 2, `${total} of 20`);
check('a lifting day is not given a run', !running[0].run && !running[2].run);

console.log('\nNothing entered is answered with nothing, not with zeroes');
/* A cardio day with no mileage behind it still says what it is — a blank row
   under "Quality Cardio" reads as a bug. It just carries no distance, because
   there is no distance to carry. */
check('a run day with no mileage still says run', ask()[1].run === 'Easy run', String(ask()[1].run));
check('with no number attached to it', !/\d/.test(String(ask()[1].run)));
check('and no lifting day is given one', !ask()[0].run && !ask()[2].run);
check('and a rest day never gets one', ask({ weeklyMiles: 30 })[4].run === undefined);
/* A split with no cardio day at all must not silently drop the miles into a
   lifting day. */
const liftingOnly = firstWeekPreview({ days: DAYS.filter(day => day.type === 'Strength'), baseline: {}, weeklyMiles: 25, unit: 'lb' });
check('miles with nowhere to go are simply not shown', liftingOnly.every(day => !day.run));

console.log('\nAnd metric is metric all the way through');
const metric = firstWeekPreview({ days: DAYS, baseline: { 'Bench Press': { weight: 100, reps: 5 } }, weeklyMiles: 0, unit: 'kg' });
check('the load is rounded to a metric plate step',
  metric[0].lift.weight === wavePrescription(calculateEstimatedOneRepMax(100, 5), 0, { metric: true }).weight,
  String(metric[0].lift.weight));

console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
