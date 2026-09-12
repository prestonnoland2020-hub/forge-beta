/* "WHY DOES IT ALWAYS SAY WEEK 1?"

   Because startDate was stamped with today on every generation, and the week
   you are in is counted from it. A block also rebuilds itself silently when it
   reads as stale — so Preston opened Plan to "Week 1 of 10" indefinitely. Ten
   weeks of programming that could only ever execute its first week: the wave
   restarted at 8 reps and never reached a max week, the mileage ramp restarted
   at the bottom and never climbed, and the taper could never arrive before the
   race.

   Two things kept it there, and this pins both. */
import { currentWeekIndex, weeksRemaining, provenMax } from './src/features/training/aiPlanService.ts';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };

const back = days => { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); };
const block = (startedDaysAgo, weeks = 10) => ({
  startDate: back(startedDaysAgo),
  plan: { weeks: Array.from({ length: weeks }, (_, i) => ({ week: i + 1, topSets: [] })) },
});

console.log('\nThe week you are in is the week the calendar says');
check('the day it is built, week 1', currentWeekIndex(block(0)) === 0, `${currentWeekIndex(block(0)) + 1}`);
check('six days in, still week 1', currentWeekIndex(block(6)) === 0, `${currentWeekIndex(block(6)) + 1}`);
check('a week in, week 2', currentWeekIndex(block(7)) === 1, `${currentWeekIndex(block(7)) + 1}`);
check('five weeks in, week 6 — the max week', currentWeekIndex(block(35)) === 5, `${currentWeekIndex(block(35)) + 1}`);
check('and it never runs past the end', currentWeekIndex(block(400)) === 9, `${currentWeekIndex(block(400)) + 1}`);

console.log('\nWhich is only true if a rebuild keeps the block\'s start date');
/* The rule the component applies: a reshape carries startDate, a genuinely
   new block starts today. Four weeks is the line, and it is the same number
   that decides a block is stale, or a block with three weeks left would be
   rebuilt forever without ever being allowed to end. */
const BLOCK_ENDS_WITH = 4;
const startDateAfterRebuild = (stored) =>
  stored && weeksRemaining(stored) >= BLOCK_ENDS_WITH ? stored.startDate : back(0);

const midBlock = block(35);
check('rebuilt in week 6, the block keeps its calendar',
  startDateAfterRebuild(midBlock) === midBlock.startDate, startDateAfterRebuild(midBlock));
check('so the athlete is still in week 6, not back at week 1',
  currentWeekIndex({ ...midBlock, startDate: startDateAfterRebuild(midBlock) }) === 5,
  `week ${currentWeekIndex({ ...midBlock, startDate: startDateAfterRebuild(midBlock) }) + 1}`);

const nearlyDone = block(56);
check('with three weeks left the block has run its course', weeksRemaining(nearlyDone) < BLOCK_ENDS_WITH, `${weeksRemaining(nearlyDone)} left`);
check('and the next one starts today', startDateAfterRebuild(nearlyDone) === back(0));
check('which is a truthful week 1', currentWeekIndex({ ...nearlyDone, startDate: back(0) }) === 0);
check('nothing stored at all also starts today', startDateAfterRebuild(null) === back(0));

console.log('\nA rebuild cannot be triggered by an inference running ahead of a test');
/* `bests` is a CALCULATED max — an Epley inference from rep work. The block's
   own ceiling is capped at five percent over the athlete's TESTED single,
   precisely because that inference runs ahead of what they can take for one.
   Comparing the two reported "outgrown" for every athlete whose rep work
   outruns their last test, which was all of Preston's lifts. */
const outgrown = (calculated, tested, blockCeiling) => {
  const proven = provenMax(calculated, tested);
  return Boolean(proven && blockCeiling && proven > blockCeiling * 1.05);
};
const CALCULATED = 526;   // from an all-out 415 x 8
const TESTED = 475;       // the bar he has actually taken for one
const CEILING = 495;      // what the block's max week now asks

check('the old test fired on his own squat, every visit', CALCULATED > CEILING * 1.05, `${CALCULATED} vs ${Math.round(CEILING * 1.05)}`);
check('an inference running ahead of a test no longer does',
  !outgrown(CALCULATED, TESTED, CEILING), `${provenMax(CALCULATED, TESTED)} vs ${Math.round(CEILING * 1.05)}`);
check('but a completed 500 x 2 is a real overrun and is caught',
  outgrown(533, 0, CEILING), `533 vs ${Math.round(CEILING * 1.05)}`);
check('and so is a tested single past the block',
  outgrown(560, 540, CEILING), `${provenMax(560, 540)} vs ${Math.round(CEILING * 1.05)}`);
check('nothing logged, nothing to outgrow', !outgrown(0, 0, CEILING));

console.log('\nprovenMax holds an inference to a fact, and leaves it alone without one');
check('with a tested single it is capped', provenMax(526, 475) === 475 * 1.05, `${provenMax(526, 475)}`);
check('a modest calculation under the cap is untouched', provenMax(480, 475) === 480, `${provenMax(480, 475)}`);
check('with no single the calculation stands', provenMax(533, 0) === 533, `${provenMax(533, 0)}`);

console.log(`\n${fails ? `${fails} failed` : 'All checks passed'}`);
process.exit(fails ? 1 : 0);
