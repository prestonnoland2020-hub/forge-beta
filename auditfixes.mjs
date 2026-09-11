/* THE AUDIT'S FINDINGS, HELD DOWN.

   Each of these was a wrong number or a lost day found by reading the app end
   to end. They are here so the next rewrite of any of it has to argue with a
   test rather than with a comment. */
import { niceAxis } from './src/lib/strength.ts';
import { weeklyRunning } from './src/lib/goalTrajectory.ts';
import { buildLongRangePlan } from './src/lib/longRangePlanEngine.ts';
import { buildTrainingIntelligence } from './src/lib/trainingIntelligence.ts';
import { calculateEstimatedOneRepMax } from './src/lib/strength.ts';

let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${d ? ` — ${d}` : ''}`); if (!c) fails++; };
const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

console.log('\n  a chart axis that reaches the athlete’s best set');
/* niceAxis(405, 505) topped out at 500, so a 505 lb PR was drawn above the
   last gridline and clipped off the chart. */
for (const [min, max] of [[405, 505], [99, 199], [130, 137], [0, 1], [225, 1000]]) {
  const axis = niceAxis(min, max);
  check(`${min}–${max} fits inside its own axis`, axis.max >= max && axis.min <= min,
    `axis ${axis.min}–${axis.max} step ${axis.step}`);
}

console.log('\n  weekly running, wherever the athlete lives');
const runRecord = (ago, miles) => ({ id: `r${ago}`, date: day(ago), title: 'Run', muscles: ['Cardio'], hasCardio: true,
  topSets: [], cardioSessions: [{ id: `c${ago}`, activity: 'Run', structure: 'steady', summary: `Run · ${miles} mi`,
    prescription: { legacyIntervals: [{ distance: miles, unit: 'miles', time: miles * 9, cardioType: 'Run' }] } }] });
const runs = [runRecord(2, 6), runRecord(9, 5), runRecord(16, 8), runRecord(23, 10)];
const totalMiles = series => series.reduce((sum, week) => sum + week.miles, 0);
const newYork = (() => { process.env.TZ = 'America/New_York'; return weeklyRunning(runs); })();
check('New York sees his miles', totalMiles(newYork) > 25, `${totalMiles(newYork)} mi`);
/* Local noon serialised as UTC put +13 and +14 a day out, twice, so no bucket
   key ever matched its label and every week read zero. */
const kiritimati = (() => { process.env.TZ = 'Pacific/Kiritimati'; return weeklyRunning(runs); })();
process.env.TZ = 'America/New_York';
check('and so does Kiritimati, at UTC+14', totalMiles(kiritimati) > 25, `${totalMiles(kiritimati)} mi`);
check('with the current week marked unfinished', kiritimati.at(-1).partial === true);

console.log('\n  a roadmap that stops at the race');
const race = (() => { const d = new Date(); d.setDate(d.getDate() + 21); return d.toISOString().slice(0, 10); })();
const roadmap = buildLongRangePlan(
  [{ type: 'Endurance', title: 'Half marathon', exercise: 'Half Marathon', target: '1:35:00', unit: 'hh:mm:ss', date: race, metric: 'Finish time', connection: '' }],
  { weeklyMileage: 30, runningDays: 5, readiness: 100, strengthFatigue: 'Low', experience: 'advanced', longestRunMiles: 10 }, 16, []);
check('three weeks out is a three-week roadmap, not eight', roadmap.length <= 3, `${roadmap.length} weeks`);
const lastWeek = roadmap.at(-1);
check('and the last week of it is the race week', lastWeek.phase === 'Taper' || lastWeek.phase === 'Test', lastWeek.phase);
check('mileage never climbs past the start into race week',
  roadmap.every(week => week.mileage <= 30 * 1.2), roadmap.map(w => w.mileage).join(' → '));

console.log('\n  and the week-on-week change is against what was actually run');
const long = buildLongRangePlan(
  [{ type: 'Endurance', title: 'Marathon', exercise: 'Marathon', target: '3:30:00', unit: 'hh:mm:ss', date: (() => { const d = new Date(); d.setDate(d.getDate() + 16 * 7); return d.toISOString().slice(0, 10); })(), metric: 'Finish time', connection: '' }],
  { weeklyMileage: 30, runningDays: 5, readiness: 100, strengthFatigue: 'Low', experience: 'advanced', longestRunMiles: 10 }, 16, []);
const wrong = long.filter((week, index) => index > 0 && week.mileage && long[index - 1].mileage
  && Math.abs(Math.round((week.mileage - long[index - 1].mileage) / long[index - 1].mileage * 100) - week.change) > 1);
check('every week’s change matches the week before it', wrong.length === 0,
  wrong.map(w => `wk${w.week} says ${w.change}%`).join(', '));

console.log('\n  the logger and the plan agree about a goal lift');
const bench = weight => ({ id: `b${weight}`, date: day(weight % 30), title: 'Push', muscles: ['Chest'],
  topSets: [{ id: `s${weight}`, muscle: 'Chest', lift: 'Bench', weight, reps: 5, completed: true, calculatedMax: calculateEstimatedOneRepMax(weight, 5) }],
  hasCardio: false, cardioSessions: [] });
const recovery = { readiness: 100, confidence: 'Low', strengthFatigue: 'Low', hardTrainingAllowed: true };
const maxWeek = buildTrainingIntelligence({ records: [bench(300), bench(305), bench(310)], recovery,
  templates: [{ exercise: 'Bench', calculatedMax: 0, exposureIndex: 4 }], goalMaxByLift: { bench: 400 }, loadBiasPercent: 0 }).topSets[0];
check('max week on a goal lift is a tested single', maxWeek.reps === 1 && maxWeek.stage === 'MAX', `${maxWeek.weight} × ${maxWeek.reps} (${maxWeek.stage})`);
check('and it no longer denies the goal exists', !/no Real 1RM goal/.test(maxWeek.rationale), maxWeek.rationale.slice(0, 80));

console.log('\n  and it does not say "holding" over a load it just raised');
const oneSession = buildTrainingIntelligence({ records: [bench(225)], recovery,
  templates: [{ exercise: 'Bench', calculatedMax: 0, exposureIndex: 0 }], goalMaxByLift: {}, loadBiasPercent: 0 }).topSets[0];
const holding = /holding the demonstrated level/.test(oneSession.rationale);
/* "Holding" is a claim about the MAX, not about the literal bar weight: the
   wave asks for 8s off a 5, so the load moves down while the max stays put.
   The lie worth catching is a rationale that says holding over a load that is
   in fact a raise. */
const askedMax = calculateEstimatedOneRepMax(oneSession.weight, oneSession.reps);
const shownMax = calculateEstimatedOneRepMax(225, 5);
check('one logged session holds the max it was shown', !holding || askedMax <= shownMax * 1.02,
  `${oneSession.weight} × ${oneSession.reps} → ${Math.round(askedMax)} vs ${Math.round(shownMax)} — ${holding ? 'says holding' : 'says progressing'}`);

console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
