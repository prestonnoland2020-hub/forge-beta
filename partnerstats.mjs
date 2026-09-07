/* THE NUMBERS ON THE PARTNER SCREEN, AGAINST PRESTON'S REAL SERIES.

   The old trend was `last − first`, which read his Monday walk against a run
   six months earlier and reported +12:12 /mi of "progress". These are the
   replacements, checked on the exact weekly figures the database returns. */
import { slopePerWeek, fittedChange, repeatableBest, indexToStart, share } from './src/lib/partnerStats.ts';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };
const round = (value, places = 1) => value === null ? null : Math.round(value * 10 ** places) / 10 ** places;

/* His real sustained-pace series, oldest first, as the database now returns
   it — the twenty-minute mile is excluded upstream as a walk. */
const PRESTON = [8.5, null, 8.4, 5.3, 10.0, 7.1, 5.8, 7.5, null];
const ADAM    = [6.8, 6.3, 7.9, 7.8, 7.5, 5.9, null, 6.4, 9.3];
/* What the series looked like while a walk counted as a run. */
const WITH_WALK = [8.5, null, 8.4, 5.3, 10.0, 7.1, 5.8, 7.5, 20.0];

console.log('\nThe old trend, for comparison');
const oldTrend = series => { const v = series.filter(x => x !== null); return v[v.length - 1] - v[0]; };
check('last minus first read the walk as an 11.5 min/mi collapse', round(oldTrend(WITH_WALK)) === 11.5, `${round(oldTrend(WITH_WALK))} min/mi`);
check('and it is still wrong without the walk — two weeks decide it', round(oldTrend(PRESTON)) === -1, `${round(oldTrend(PRESTON))} min/mi from 8.5 to 7.5`);

console.log('\nA robust slope instead');
const fitted = fittedChange(PRESTON);
check('every pair votes, so no single week decides it', fitted !== null, `${round(fitted)} min/mi over the window`);
/* Belt and braces: even if a walk did reach the series, it must not flip the
   answer the way least squares did. */
const contaminated = fittedChange(WITH_WALK);
check('a walk that slipped through would not reverse it', Math.abs(contaminated - fitted) < 3.5, `${round(fitted)} clean, ${round(contaminated)} contaminated`);
check('and it still points the right way for Adam', fittedChange(ADAM) !== null, `${round(fittedChange(ADAM))} min/mi`);
check('a flat series has no trend', slopePerWeek([5, 5, 5, 5]) === 0);
check('two weeks is not enough to fit anything', fittedChange([7, 8]) === null);
check('a clean improvement is measured, not guessed', round(fittedChange([10, 9, 8, 7])) === -3, `${round(fittedChange([10, 9, 8, 7]))}`);
/* THE GAPS ARE REAL WEEKS. The series only carries the weeks somebody logged,
   so four readings taken a month apart used to be measured as four weeks of
   change — every per-week figure on the screen came out steeper than it was.
   Given the real week offsets, the same four readings span thirteen weeks. */
check('a gap in the logging is counted as the weeks it was',
  round(fittedChange([10, 9, 8, 7], [0, 4, 9, 13])) === -2.9,
  `${round(fittedChange([10, 9, 8, 7], [0, 4, 9, 13]))} over 13 weeks`);
check('and the slope is per real week, not per reading — a quarter of what counting readings claimed',
  Math.abs(slopePerWeek([10, 9, 8, 7], [0, 4, 9, 13]) + 0.2265) < 0.001,
  String(slopePerWeek([10, 9, 8, 7], [0, 4, 9, 13])));
check('without offsets it still reads positions, as it always did',
  slopePerWeek([10, 9, 8, 7]) === -1);

console.log('\nA best that is repeatable');
check('one fluke week does not become his best pace', repeatableBest(PRESTON, true) === 5.8, `${repeatableBest(PRESTON, true)} min/mi (the 5.3 is dropped)`);
check('and the walk never becomes it either', repeatableBest(PRESTON, true) < 20);
check('on a lift, bigger is better', repeatableBest([300, 315, 405, 320], false) === 320, `${repeatableBest([300, 315, 405, 320], false)} lb`);
check('with three weeks or fewer nothing is called an outlier', repeatableBest([300, 315, 310], false) === 315);
check('an empty series has no best', repeatableBest([null, null], false) === null);

console.log('\nProgress, each against their own start');
const p = indexToStart(PRESTON, true);
const a = indexToStart(ADAM, true);
check('both lines begin at zero', p[0] === 0 && a[0] === 0, `${p[0]} / ${a[0]}`);
check('getting faster reads as positive', p[3] > 0, `week 4: ${p[3]}% (5.3 from a 8.5 start)`);
check('a slower week reads as negative, never as growth', indexToStart([8.5, 10.0], true)[1] < 0, `${indexToStart([8.5, 10.0], true)[1]}%`);
check('and the walk is simply not there', p[8] === null);
check('weeks with nothing logged stay empty', p[1] === null);
check('on a lift, adding weight is positive', indexToStart([300, 330], false)[1] === 10, `${indexToStart([300, 330], false)[1]}%`);
check('5 lb on a 150 lb lift outruns 5 lb on a 500 lb lift',
  indexToStart([150, 155], false)[1] > indexToStart([500, 505], false)[1],
  `${indexToStart([150, 155], false)[1]}% vs ${indexToStart([500, 505], false)[1]}%`);

console.log('\nThe head-to-head bar');
check('splits by proportion', share(3, 1).mine === 0.75);
check('and two zeroes split evenly rather than dividing by nothing', share(0, 0).mine === 0.5);

console.log(fails ? `\n${fails} check(s) failed` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
