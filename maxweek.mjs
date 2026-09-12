/* A MAX IS AN EVENT THE BLOCK SCHEDULES.

   Preston opened week 1 of a ten-week block to "Squat 520 lb x 1" under a
   banner reading "4-REP WEEK". His tested single was 475. Two things had gone
   wrong at once: the single was allowed because the LIFT's own session count
   had wrapped to the top of the wave, and the weight was allowed because the
   attempt ceiling was a tenth over the tested single — 45 lb on that squat.

   This pins both: no week but the block's max week asks for a single, a lift
   that has not ramped inside the block does not test at all, and an attempt
   never exceeds the tested single by more than five percent. */
import { wavePrescription, WAVE_LENGTH, EXPOSURES_BEFORE_MAX } from './src/features/training/aiPlanService.ts';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };

/* Preston's squat as the app had it: a 415x8 that estimates ~526, heavy rep
   work at 455-490, and one real tested single at 475. */
const SINGLE = 475;
const BEST = 526;
const anchors = new Map([[8, 415], [6, 455], [4, 480], [2, 500], [1, SINGLE]]);
const ask = (weekIndex, extra = {}) => wavePrescription(BEST, weekIndex, {
  bestSingle: SINGLE, tests: true, anchors, sessions: 12, ...extra,
});

console.log('\nWeek one of a block is not a max week');
for (let week = 0; week < WAVE_LENGTH - 1; week += 1) {
  const got = ask(week);
  check(`week ${week + 1} does not ask for a single`, got.reps !== 1 && !got.isMax, `${got.weight} x ${got.reps}`);
}
const maxed = ask(WAVE_LENGTH - 1);
check('the block\'s max week does', maxed.reps === 1 && maxed.isMax, `${maxed.weight} x ${maxed.reps}`);

console.log('\nA lift\'s own session count cannot schedule a test');
/* This is the shape resolvePlanWeek passes: the block says which week it is,
   so a lift whose own rung has wrapped to five still takes its rep rung. */
const onItsOwnClock = wavePrescription(BEST, 4, { bestSingle: SINGLE, tests: true, anchors, sessions: 12, maxWeek: false });
check('a lift sitting on rung 4 in a build week takes reps, not a single',
  onItsOwnClock.reps !== 1 && !onItsOwnClock.isMax, `${onItsOwnClock.weight} x ${onItsOwnClock.reps}`);
check('and the reps come off the 8/6/4/2 ramp',
  [8, 6, 4, 2].includes(onItsOwnClock.reps), `${onItsOwnClock.reps}`);
const toldItIsMax = wavePrescription(BEST, 2, { bestSingle: SINGLE, tests: true, anchors, sessions: 12, maxWeek: true });
check('and the block can call a max week whatever rung the lift is on',
  toldItIsMax.reps === 1 && toldItIsMax.isMax, `${toldItIsMax.weight} x ${toldItIsMax.reps}`);

console.log('\nA cold lift does not test');
const cold = ask(WAVE_LENGTH - 1, { sessions: 1, ramped: false });
check('under the exposure floor it takes the double instead', cold.reps === 2 && !cold.isMax, `${cold.weight} x ${cold.reps}`);
const warm = ask(WAVE_LENGTH - 1, { sessions: EXPOSURES_BEFORE_MAX, ramped: true });
check('at the floor it tests', warm.reps === 1 && warm.isMax, `${warm.weight} x ${warm.reps}`);

console.log('\nThe attempt stays near the single it is trying to beat');
check('never more than five percent over the tested single',
  maxed.weight <= SINGLE * 1.05, `${maxed.weight} vs ${Math.round(SINGLE * 1.05)}`);
check('and never below it — an attempt is a PR attempt', maxed.weight > SINGLE, `${maxed.weight}`);
check('the 520 that started this is gone', maxed.weight < 520, `${maxed.weight}`);

console.log('\nNo tested single: the estimate stands in, uncapped by a number that does not exist');
const untested = wavePrescription(BEST, WAVE_LENGTH - 1, { tests: true, anchors, sessions: 12 });
check('an athlete who has never tested still gets an attempt', untested.reps === 1 && untested.weight > 0, `${untested.weight}`);

console.log(`\n${fails ? `${fails} failed` : 'All checks passed'}`);
process.exit(fails ? 1 : 0);
