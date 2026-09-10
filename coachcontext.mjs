/* WHAT THE COACH IS TOLD, ON PRESTON'S REAL HISTORY.

   Asked "am I on track for my goal?", Forge answered with a list of gaps and
   two complaints: that his running goals were "not verified", and that
   "body-weight progress can't be assessed without a current logged weight". He
   had weighed in that morning, and every morning before it. He had run 13.9
   miles the week before against a 14-mile target, and the coach told him he was
   averaging 9.3.

   Both complaints were true of the context object it received and false of the
   athlete. These are his real sets, weigh-ins and runs, through the builders
   that context is now made from. */
import { goalTrajectories, weeklyRunning, bodyWeightSeries } from './src/lib/goalTrajectory.ts';
import { calculateEstimatedOneRepMax } from './src/lib/strength.ts';

let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${d ? ` — ${d}` : ''}`); if (!c) fails++; };
const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

/* His squat, bench and pull-up work as top_sets holds it. */
const LIFTS = [
  ['2026-09-04', 'Squat', 460, 4], ['2026-09-03', 'Bench', 320, 4], ['2026-08-26', 'Bench', 315, 6],
  ['2026-08-16', 'Squat', 408, 8], ['2026-08-11', 'Bench', 315, 6], ['2026-08-03', 'Bench', 300, 8],
  ['2026-07-31', 'Pull Ups', 105, 5], ['2026-07-26', 'Squat', 455, 3], ['2026-07-21', 'Bench', 315, 6],
  ['2026-07-07', 'Bench', 360, 1], ['2026-06-01', 'Squat', 475, 1], ['2026-06-01', 'Bench', 320, 5],
];
/* His weigh-ins — the ones the coach said did not exist. Eight months of them,
   thinned to a couple a week, which is what the real table holds: 189.7 in
   March up to 192 now, a couple of pounds across the whole block. */
const WEIGHTS = [
  [0, 192], [1, 192], [3, 192], [4, 191], [5, 190], [6, 190], [7, 191], [8, 191],
  [11, 190.8], [13, 190], [16, 190.3], [18, 190], [22, 189.5], [25, 188.9], [28, 190],
  [32, 195], [36, 190], [39, 193], [43, 193], [50, 190], [57, 192], [64, 187], [71, 192],
  [78, 190], [85, 189.5], [92, 188], [99, 191], [106, 189.5], [113, 191], [120, 189.7],
];
/* Running, by week: 11.2, 12.3, 13.9 and then a part-finished week. */
const RUNS = [[22, 5.6], [20, 5.6], [15, 6.2], [13, 6.1], [8, 7.0], [6, 6.9], [1, 4.0]];

const byDate = new Map();
const record = date => {
  if (!byDate.has(date)) byDate.set(date, { id: date, date, title: 'Day', muscles: [], topSets: [], cardioSessions: [], hasCardio: false });
  return byDate.get(date);
};
LIFTS.forEach(([date, lift, weight, reps], index) => record(date).topSets.push({
  id: `s${index}`, muscle: 'Quads', lift, weight, reps, completed: true, calculatedMax: calculateEstimatedOneRepMax(weight, reps) }));
WEIGHTS.forEach(([ago, weight]) => { record(day(ago)).bodyWeight = weight; });
RUNS.forEach(([ago, miles], index) => {
  const target = record(day(ago));
  target.hasCardio = true;
  target.cardioSessions.push({ id: `c${index}`, activity: 'Run', structure: 'Steady',
    summary: `Run · ${miles} miles · ${Math.round(miles * 9)}:00`,
    prescription: { legacyIntervals: [{ distance: miles, unit: 'miles', time: miles * 9 }] } });
});
const records = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));

const GOALS = [
  { title: 'Squat 500', type: 'Strength', exercise: 'Squat', metric: 'Real 1RM', target: '500', unit: 'lb', date: '2026-12-30' },
  { title: 'Bench 400', type: 'Strength', exercise: 'Bench', metric: 'Real 1RM', target: '400', unit: 'lb', date: '2026-12-30' },
  { title: 'Pull Ups 200', type: 'Strength', exercise: 'Pull Ups', metric: 'Real 1RM', target: '200', unit: 'lb', date: '2026-12-31' },
  { title: 'Mile', type: 'Endurance', exercise: 'Mile', target: '4:59', unit: '', date: '2026-12-31' },
  /* HE DOES HAVE ONE. It lives in athlete_settings rather than the goals
     table, which is why it is invisible to everything server-side and why the
     first read of this said he had no body-composition goal at all. */
  { title: '200 lb body-weight goal', type: 'Body Composition', metric: 'Body weight', exercise: '', target: '200 lb', unit: 'lb', date: '2026-12-31' },
];

console.log('\n  body weight — the thing it said could not be assessed');
const weights = bodyWeightSeries(records);
check('the coach is given his weigh-ins', weights.length >= 20, `${weights.length} entries`);
check('the most recent one is the most recent one', weights[0].weight === 192, `${weights[0].weight} lb on ${weights[0].date}`);
check('and they are ordered newest first', weights[0].date > weights[1].date);

console.log('\n  running — the 9.3 that should have been 13.9');
const miles = weeklyRunning(records);
check('eight weeks are given, not one average', miles.length === 8, `${miles.length} weeks`);
const partial = miles.at(-1);
check('the unfinished week is marked as unfinished', partial.partial === true);
const complete = miles.filter(week => !week.partial);
const lastComplete = complete.at(-1);
check('his last complete week is the real figure', lastComplete.miles === 13.9, `${lastComplete.miles} mi week of ${lastComplete.weekOf}`);
check('and the three before it climb', complete.slice(-3).map(week => week.miles).join(' → ') === '11.2 → 12.3 → 13.9',
  complete.slice(-3).map(week => week.miles).join(' → '));
check('no average is offered anywhere for something to misread', miles.every(week => 'partial' in week));

console.log('\n  goals — a rate and a landing point, not a list of gaps');
const paths = goalTrajectories(GOALS, records);
const squat = paths.find(path => path.goal === 'Squat 500');
check('his squat single is what it demonstrates', squat.demonstrated === '475 lb', String(squat.demonstrated));
check('it carries a weekly rate', Boolean(squat.weeklyRate), String(squat.weeklyRate));
check('and where that rate lands him by December', /by 2026-12-30$/.test(squat.projected || ''), String(squat.projected));
check('and the rate that would be required instead', /lb\/week$/.test(squat.requiredRate || ''), String(squat.requiredRate));
check('with a verdict, not a gap', ['On track', 'Behind the rate', 'No trend yet', 'Reached'].includes(squat.verdict), squat.verdict);

const pullups = paths.find(path => path.goal === 'Pull Ups 200');
check('one lonely pull-up set is honestly no trend', pullups.verdict === 'No trend yet', pullups.verdict);
check('and it names what would make one', /top sets inside 120 days/.test(pullups.missing || ''), String(pullups.missing));

const mile = paths.find(path => path.goal === 'Mile');
check('the mile names the session that would measure it', /hard continuous mile effort/i.test(mile.missing || '') || Boolean(mile.demonstrated),
  String(mile.missing || mile.demonstrated));
check('and never says an assessment is simply unavailable',
  !/not verified|unavailable|no assessment/i.test(`${mile.missing || ''}${mile.demonstrated || ''}`));

console.log('\n  every goal he has, and only those');
check('five goals in, five trajectories out', paths.length === 5, `${paths.length}`);

console.log('\n  the body-weight goal, which has more evidence than any of them');
const body = paths.find(path => /body-weight/i.test(path.goal));
check('it reads his weigh-ins, not his top sets', body.demonstrated === '192 lb', String(body.demonstrated));
check('and never claims nothing is recorded', !/nothing has been recorded/i.test(body.missing || ''), String(body.missing));
check('gaining toward 200 from 192 is a rate, not a gap', Boolean(body.weeklyRate), String(body.weeklyRate));
/* Eight days of morning weigh-ins fitted 1.6 lb/week and put him at 217 by
   December. Weekly medians see the two pounds he has actually moved. */
check('the rate is weeks of evidence, not a fortnight of water',
  Math.abs(Number(String(body.weeklyRate).replace(/[^0-9.-]/g, ''))) < 0.5, String(body.weeklyRate));
check('so the projection stays in the realm of the possible',
  Math.abs(Number(String(body.projected).replace(/[^0-9.-]/g, '').slice(0, 5)) - 192) < 12, String(body.projected));
check('and a verdict', ['On track', 'Behind the rate', 'No trend yet', 'Reached'].includes(body.verdict), body.verdict);

console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
