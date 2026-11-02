/* WHEN THE BLOCK ENDS, EVERY SCREEN KNOWS IT — AND EVERY SCREEN READS A WEEK
   THE SAME WAY WHILE IT RUNS.

   currentWeekIndex clamps into the block, so the day after week 10 it still
   answers "week 10". The Plan tab said "Block complete" while Today repeated
   the last week's max single and taper runs and the coach quoted "week 10 of
   10" as this week. And only the Plan tab told the resolver how far away the
   race and the lift goal were, so Today and the coach resolved a different
   taper and a different max attempt from the same stored week. */
import { blockEndIso, blockIsOver, goalHorizons, planBlockFor, currentWeekIndex, resolveWeekRunning } from './src/features/training/aiPlanService.ts';
import { sessionVerdicts } from './src/features/training/sessionVerdicts.ts';
import { localDayIso } from './src/lib/time.ts';
import { openGoals } from './src/lib/goalFeasibility.ts';
import { runningBehind } from './src/lib/runningBehind.ts';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };
const shift = (iso, days) => { const date = new Date(`${iso}T12:00:00`); date.setDate(date.getDate() + days); return localDayIso(date); };
const week = (i) => ({ week: i + 1, phase: 'Base', mileage: 24, longRunMiles: 7, longRunPace: '9:35', longRunDay: 'Cardio',
  quality: 'x', qualityPace: '', qualityDay: 'Cardio', easyDays: [], easyMinutes: 60, easyPace: '9:25', topSets: [], note: '' });
const block = (startDate, weeks = 6) => ({ startDate, plan: { summary: '', easyPace: '9:25', weeks: Array.from({ length: weeks }, (_, i) => week(i)) },
  generatedAt: '', fingerprint: '', blockWeeks: weeks });

console.log('\nThe block has a last day');
const sixWeeks = block('2026-09-01');
check('a six-week block from Sep 1 stops covering Oct 13', blockEndIso(sixWeeks) === '2026-10-13', blockEndIso(sixWeeks));
check('Oct 12 — its last day — is inside it', !blockIsOver(sixWeeks, '2026-10-12'));
check('Oct 13 is past it', blockIsOver(sixWeeks, '2026-10-13'));
check('and so is any day after', blockIsOver(sixWeeks, '2026-11-30'));
const today = localDayIso();
check('a block that started today is running', !blockIsOver(block(today), today));
check('one that ended yesterday is over, though its clamped week still reads as the last',
  blockIsOver(block(shift(today, -43)), today) && currentWeekIndex(block(shift(today, -43))) === 5);

console.log('\nThe race and the lift goal are counted in weeks of the block');
const start = shift(today, -14);
const race = { type: 'Endurance', exercise: 'Half Marathon', title: 'Half', target: '1:35:00', date: shift(today, 21) };
const lift = { type: 'Strength', exercise: 'Squat', title: 'Squat 405', target: '405', date: shift(today, 7) };
const pastRace = { ...race, date: shift(today, -40) };
const h = goalHorizons([race, lift], start);
check('a race three weeks out in a block two weeks old is block week 5', h.weeksToRace === 5, String(h.weeksToRace));
check('a lift goal next week is block week 3', h.weeksToLiftGoal === 3, String(h.weeksToLiftGoal));
check('a race that is long over steers nothing', goalHorizons([pastRace], start).weeksToRace === Infinity);
check('a lift goal already due steers nothing', goalHorizons([{ ...lift, date: shift(today, -1) }], start).weeksToLiftGoal === Infinity);
const tenWeeks = block(start, 10);
const b = planBlockFor(tenWeeks, [race, lift]);
check('the block every screen passes carries both horizons', b.weeksToRace === 5 && b.weeksToLiftGoal === 3);
check('and where this week sits', b.weekIndex === 2 && b.currentWeekIndex === 2 && b.blockWeeks === 10);

console.log('\nOne stored week, one resolved week — with or without the race');
const athlete = { runningDays: 4, minWeeklyMileage: 10, maxWeeklyMileage: 40, weeklyMileage: 30,
  recentWeeklyMileage: 30, recentLongestRun: 10, longestRunMiles: 10, goalPaceSecondsPerMile: 435, goalMiles: 13.1 };
const split = ['Cardio', 'Legs', 'Push', 'Rest'].map(name => ({ name, dayType: name }));
const raceWeek = planBlockFor(tenWeeks, [race], 5);
const told = resolveWeekRunning(tenWeeks.plan.weeks[5], split, athlete, raceWeek);
const untold = resolveWeekRunning(tenWeeks.plan.weeks[5], split, athlete, { weekIndex: 5, blockWeeks: 10, waveIndex: 5 });
check('told the race, its week is race week', told.phase === 'Race', told.phase);
check('a screen not told the race resolves a different week — which is why every screen is told', untold.phase !== told.phase, untold.phase);

console.log('\nA block with no race still resolves its last weeks');
/* No race came through as Infinity, the taper started at week Infinity, and
   walking the mileage series up to it never finished — the Plan tab hung. */
const noRace = resolveWeekRunning(sixWeeks.plan.weeks[5], split, athlete, planBlockFor(sixWeeks, [], 5));
check('the last week of a block with no race resolves, as a taper', noRace.phase === 'Taper', noRace.phase);

console.log('\nA run after the block is not judged against its last week');
const paces = { easyFast: 550, easySlow: 620, marathon: 480, threshold: 443, interval: 378, repetition: 338, source: 'recent-run', supported: true, from: null };
const runner = { runningDays: 4, minWeeklyMileage: 2, maxWeeklyMileage: 40, weeklyMileage: 24, recentWeeklyMileage: 24,
  recentLongestRun: 8, longestRunMiles: 8, goalPaceSecondsPerMile: 367, goalMiles: 3.107, paces };
const twoSplit = ['Cardio', 'Rest'].map(name => ({ name, dayType: name }));
const log = (date, lines) => ({ id: date, date, cardioSessions: [{ activity: 'Run', structure: 'intervals', prescription: { legacyIntervals: lines } }] });
const rep = (miles, minutes) => ({ distance: miles, time: minutes, unit: 'miles', segment: 'work', cardioType: 'Run' });
/* A race far beyond the block, so its last week is a threshold week —
   20 min @ 7:23/mi — and not a taper with nothing to judge. */
const farRace = [{ type: 'Endurance', exercise: '5K', title: '5K', target: '19:00', date: '2030-06-01' }];
const tempo = [rep(2.71, 20)];
const judge = date => sessionVerdicts([log(date, tempo)], sixWeeks, twoSplit, runner, '2026-10-20', 8, farRace);
check('the last week\'s tempo, run in the last week, is judged', judge('2026-10-08').length === 1);
check('the same run two days after the block ended is not', judge('2026-10-15').length === 0);

console.log('\nA goal whose day has gone is not a target');
const goalsNow = [{ title: 'Old squat', date: shift(today, -2) }, { title: 'Today', date: today }, { title: 'Later', date: shift(today, 30) }, { title: 'Undated' }];
const open = openGoals(goalsNow, today).map(goal => goal.title);
check('a goal two days past is left out of what the athlete is working toward', !open.includes('Old squat'));
check('one due today, one later and one undated are all still open', ['Today', 'Later', 'Undated'].every(title => open.includes(title)), open.join(', '));

console.log('\nNo one is behind a plan that has ended');
const planned = Array.from({ length: 6 }, () => 20);
check('two empty weeks inside the block are behind it', Boolean(runningBehind('2026-09-01', planned, [], '2026-09-29')));
check('the last two weeks of the block still count, the day after it ends', Boolean(runningBehind('2026-09-01', planned, [], '2026-10-13')));
check('a week later, judged against a week the block never planned, they do not', runningBehind('2026-09-01', planned, [], '2026-10-20') === null);

console.log(fails ? `\n${fails} failing` : '\nall passing');
process.exit(fails ? 1 : 0);
