/* FORGE WRAPPED counts the year honestly: one fixture, exact numbers. */
import { buildWrapped, compareTonnage, percentileFor, mainLiftOf, wrappedWindow, FIRST_WRAPPED_YEAR } from './src/lib/wrapped.ts';
import { readFileSync } from 'node:fs';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };

const lift = (id, date, sets) => ({ id, date, title: 'Upper', muscles: ['Chest'], hasCardio: false, topSets: sets.map(([lift, weight, reps]) => ({ muscle: 'Chest', lift, weight, reps, completed: true })) });
const run = (id, date, miles, minutes) => ({ id, date, title: 'Run', muscles: [], hasCardio: true, cardioSessions: [{ id: `${id}c`, structure: 'steady', activity: 'Run', summary: 'Run', prescription: { distance: String(miles), distanceUnit: 'miles', duration: String(minutes) } }] });

const records = [
  lift('old', '2025-12-01', [['Bench Press', 225, 1]]),           // last year: the bar to beat
  lift('a', '2026-01-05', [['Bench Press', 200, 5], ['Back Squat', 225, 5]]), // Mon
  lift('b', '2026-01-12', [['Bench Press', 210, 5], ['Back Squat', 245, 5]]), // Mon
  lift('c', '2026-03-02', [['Bench Press', 230, 3], ['Back Squat', 275, 5]]), // Mon — bench PR over 225x1
  run('d', '2026-01-07', 5, 45),                                  // Wed
  run('e', '2026-01-14', 10, 90),                                 // Wed, longest
  { ...lift('f', '2026-01-19', [['Bench Press', 0, 5]]), completed: true }, // Mon, zero weight → no tonnage, not a lift day
  run('g', '2027-01-03', 3, 27),                                  // next year — excluded
];
const w = buildWrapped(records, 2026);
check('builds', Boolean(w));
check('training days count each date once', w.trainingDays === 5, String(w.trainingDays));
check('lift days', w.liftDays === 3, String(w.liftDays));
check('run days', w.runDays === 2, String(w.runDays));
check('top sets', w.topSets === 6, String(w.topSets));
check('tonnage is weight × reps', w.tonnage === 200*5+225*5+210*5+245*5+230*3+275*5, String(w.tonnage));
check('miles', w.runMiles === 15, String(w.runMiles));
check('longest run', w.longestRun?.miles === 10 && w.longestRun.date === '2026-01-14');
check('favorite day is Monday', w.favoriteDay === 'Monday', w.favoriteDay);
check('best month is January', w.bestMonth === 'January', w.bestMonth);
check('strongest is the squat', w.strongest?.name === 'Back Squat');
check('a lift starts from its first set of the year', w.strongest?.start < w.strongest?.best);
check('PRs must beat all-time, not just this year', w.prs.some(pr => pr.lift === 'Bench Press'));
// Records are real weight: bench 230 over last year's 225; squat 245, then 275.
check('first-ever sets are not PRs; a tie is not a PR', w.prCount === 3, String(w.prCount));
check('a record shows the weight on the bar and its reps', w.prs.some(pr => pr.lift === 'Bench Press' && pr.max === 230 && pr.reps === 3));
check('calendar codes lift=1 run=2', w.calendar[4] === 1 && w.calendar[6] === 2);
check('miles land in their month', w.milesByMonth[0] === 15);
check('a zero-weight day is not a training week', w.longestWeekStreak === 2, String(w.longestWeekStreak));
check('no year, no Wrapped', buildWrapped(records, 2019) === null);
check('tonnage compare picks a readable count', compareTonnage(208000)?.thing === 'elephants' && compareTonnage(208000)?.count === 16, JSON.stringify(compareTonnage(208000)));
check('tiny tonnage has no comparison', compareTonnage(800) === null);
check('kg converts before comparing', buildWrapped(records, 2026, true).tonnageCompare.count > w.tonnageCompare.count);
check('Jan 1 2027 opens 2026, featured', JSON.stringify(wrappedWindow(new Date(2027, 0, 1))) === JSON.stringify({ year: 2026, featured: true }));
check('February keeps 2026 but stops featuring', JSON.stringify(wrappedWindow(new Date(2027, 1, 2))) === JSON.stringify({ year: 2026, featured: false }));
check('no Wrapped before the first Forge year', wrappedWindow(new Date(2026, 10, 7)).year < FIRST_WRAPPED_YEAR);

/* STANDING: stronger than X% of lifters, from the standards tables. */
check('no body weight → no standing slide', w.standing.length === 0);
const ws = buildWrapped(records, 2026, false, { sex: 'Male', bodyWeight: 200 });
check('standing for bench and squat only', ws.standing.map(s => s.lift).join() === 'Squat,Bench press', ws.standing.map(s => s.lift).join());
const bench = ws.standing.find(s => s.lift === 'Bench press');
check('bench 1.25× bw for a man sits between intermediate (50) and advanced (80)', bench.percentile > 50 && bench.percentile < 80 && Math.abs(bench.ratio - bench.best / 200) < 0.01, JSON.stringify(bench));
check('exact anchors', percentileFor('bench', 'Male', 1.0) === 50 && percentileFor('squat', 'Female', 1.5) === 80 && percentileFor('deadlift', 'Male', 3.0) === 95);
check('higher ratio, higher percentile; clamps 1..99', percentileFor('bench', 'Male', 0.6) < percentileFor('bench', 'Male', 0.9) && percentileFor('bench', 'Male', 5) === 99 && percentileFor('bench', 'Male', 0.05) === 1);
check('women vs men: same ratio ranks higher for women', percentileFor('bench', 'Female', 0.75) > percentileFor('bench', 'Male', 0.75));
check('logged body weight wins over profile', buildWrapped([...records, { ...lift('bw', '2026-06-01', [['Bench Press', 100, 5]]), bodyWeight: 250 }], 2026, false, { sex: 'Male', bodyWeight: 150 }).standing.find(s => s.lift === 'Bench press').ratio === Math.round(bench.best / 250 * 100) / 100);
check('only the barbell lifts the standards describe', ['Incline Bench Press', 'Dumbbell Bench Press', 'Romanian Deadlift', 'Goblet Squat', 'Front Squat', 'Push Press'].every(n => mainLiftOf(n) === null) && mainLiftOf('Back Squat') === 'squat' && mainLiftOf('Conventional Deadlift') === 'deadlift' && mainLiftOf('Overhead Press') === 'press' && mainLiftOf('Barbell Bench Press') === 'bench');
check('no sex given → no standing', buildWrapped(records, 2026, false, { bodyWeight: 200 }).standing.length === 0);

/* BALANCE: time lifting vs running. */
check('balance when she did both', Boolean(w.balance) && w.balance.runMinutes === 135 && w.balance.liftMinutes === 3 * 45, JSON.stringify(w.balance));
check('balance share and verdict', w.balance.liftShare === 0.5 && w.balance.verdict === 'A true hybrid', JSON.stringify(w.balance));
const liftOnly = buildWrapped(records.filter(r => !r.hasCardio), 2026);
check('no running → no balance slide', liftOnly.balance === null);
const timed = buildWrapped([...records, { ...lift('t', '2026-04-01', [['Bench Press', 100, 5]]), durationMinutes: 75 }], 2026);
check('a logged lifting length is used', timed.balance.liftMinutes === 3 * 45 + 75, String(timed.balance.liftMinutes));
const page2 = readFileSync('src/pages/WrappedPage.tsx', 'utf8');
check('slides are wired', /Standing w=\{w\}/.test(page2) && /BalanceSlide w=\{w\}/.test(page2));

const page = readFileSync('src/pages/WrappedPage.tsx', 'utf8');
check('the story is behind Pro', /if \(!isPro\) return shell/.test(page));

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
