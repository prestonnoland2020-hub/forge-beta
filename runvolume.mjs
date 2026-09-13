/* FOUR ANSWERS TO "HOW MUCH DO YOU RUN A WEEK", ON ONE SCREEN.

   The race predictor took 28 days over four. The goal card took the median of
   eight complete weeks. The planner took the last SEVEN DAYS. The cardio
   engine took 28 days over four, anchored on the athlete's most recent RUN
   rather than on today. Preston read "you are running 0 miles a week" on a
   goal card sitting above a plan budgeting from eight.

   One definition now, and this pins what it says — including the two cases
   that made the old ones wrong. */
import { weeklyMilesFrom, VOLUME_WEEKS } from './src/lib/runVolume.ts';

let fails = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`);
  if (!ok) fails += 1;
};
/* A Wednesday, so "this week" is deliberately half finished. */
const TODAY = '2026-09-09';
const ago = n => { const d = new Date(`${TODAY}T12:00:00`); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
/* Runs placed inside a named week rather than a rough number of days back, so
   the fixture cannot straddle a week boundary and test the helper instead of
   the rule. Week 1 is the one that finished on Sunday. */
const monday = iso => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
const week = (weeksBack, miles, perWeek = 5) => Array.from({ length: perWeek }, (_, i) => {
  const d = monday(TODAY);
  d.setDate(d.getDate() - weeksBack * 7 + i);
  return { date: d.toISOString().slice(0, 10), miles: miles / perWeek };
});

console.log('\nIt is the mean of the complete weeks behind you');
const steady = [1, 2, 3, 4].flatMap(back => week(back, 20));
check('four twenty-mile weeks read as twenty', Math.round(weeklyMilesFrom(steady, TODAY)) === 20,
  String(weeklyMilesFrom(steady, TODAY)));
check('and the window is four weeks, not eight', VOLUME_WEEKS === 4, String(VOLUME_WEEKS));

console.log('\nA part-finished week never drags the number down');
/* THE BUG THIS PINS. Measured on a Wednesday, a seven-day window holds two
   days of this week and nothing else — so an athlete running twenty a week
   read as running six, and the planner built the next block to match. */
const midWeek = [...steady, { date: ago(1), miles: 3 }, { date: TODAY, miles: 3 }];
check('a Wednesday still reports the weekly average', Math.round(weeklyMilesFrom(midWeek, TODAY)) === 20,
  String(weeklyMilesFrom(midWeek, TODAY)));

console.log('\nAnd stopping shows up, which is the point');
/* THE OTHER BUG. The cardio engine anchored its 28 days on the most recent
   RUN, so an athlete who stopped a month ago kept their old mileage forever —
   the one case where the number most needs to fall. */
const lapsed = [5, 6, 7, 8].flatMap(back => week(back, 25));
check('a month off reads as nothing, not as last month', weeklyMilesFrom(lapsed, TODAY) === 0,
  String(weeklyMilesFrom(lapsed, TODAY)));
const returning = [...lapsed, { date: ago(1), miles: 4 }];
check('and coming back counts what is on the board, not a projected week',
  weeklyMilesFrom(returning, TODAY) === 4, String(weeklyMilesFrom(returning, TODAY)));

console.log('\nA big week counts, and a missed one counts against');
const uneven = [...week(1, 40), ...week(2, 0), ...week(3, 20), ...week(4, 20)];
check('one forty against two twenties and a week off averages twenty',
  Math.round(weeklyMilesFrom(uneven, TODAY)) === 20, String(weeklyMilesFrom(uneven, TODAY)));
/* A median of the same four weeks says 20 as well, but a median of 40/20/20/0
   and a median of 40/20/20/19 are both 20 — it cannot see the difference
   between a missed week and an ordinary one, which is the thing a plan most
   needs to know. */
const almost = [...week(1, 40), ...week(2, 19), ...week(3, 20), ...week(4, 20)];
check('and a missed week is visible where a median would hide it',
  weeklyMilesFrom(uneven, TODAY) < weeklyMilesFrom(almost, TODAY),
  `${weeklyMilesFrom(uneven, TODAY)} vs ${weeklyMilesFrom(almost, TODAY)}`);

console.log('\nAnd the weeks before somebody started are not weeks they ran nothing');
/* An athlete two weeks into using Forge has two empty buckets in a four-week
   window; averaging those in halves their mileage, and the floor that is meant
   to stop the plan prescribing under them does the least for exactly the
   athletes who are new. */
const newcomer = [...week(1, 22), ...week(2, 18)];
check('two weeks of training read as what those two weeks were',
  Math.round(weeklyMilesFrom(newcomer, TODAY)) === 20, String(weeklyMilesFrom(newcomer, TODAY)));
check('and an off week inside training still counts against them',
  weeklyMilesFrom([...week(1, 22), ...week(2, 0), ...week(3, 18)], TODAY) < 20,
  String(weeklyMilesFrom([...week(1, 22), ...week(2, 0), ...week(3, 18)], TODAY)));

console.log('\nNothing logged is nothing claimed');
check('an empty log is zero', weeklyMilesFrom([], TODAY) === 0);
check('and a run with no distance is not a run', weeklyMilesFrom([{ date: ago(9), miles: 0 }], TODAY) === 0);
check('a run dated in the future is not counted yet',
  weeklyMilesFrom([{ date: '2027-01-01', miles: 10 }], TODAY) === 0);

console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
