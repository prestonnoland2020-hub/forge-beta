/* THE NUMBERS THE COACH QUOTES, pinned. One fixture, thirty days of mixed
   logging — steady runs, a structured interval day, a fartlek as legacy
   lines, a walk, a bike, a HYROX day, an untimed run, and a Strava duplicate
   — and the exact totals every surface must agree on. */
import { runLines, runMilesOfRecord, milesBetween, last7DayMiles, last7DayRuns, longestRun, isLongestRunInWindow, receiptLine } from './src/lib/stats.ts';
import { medianWeeklyMiles, longestContinuousRun, weeklyRunning } from './src/lib/goalTrajectory.ts';
import { runVolumeEntries } from './src/lib/cardioPrediction.ts';
import { bigDayReason, dueCheckIn } from './src/lib/checkInSchedule.ts';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };
const near = (a, b, eps = 0.05) => Math.abs(a - b) <= eps;

const steady = (id, date, miles, minutes, summary = 'Run') => ({ id, date, title: 'Training day', muscles: [], hasCardio: true, cardioSessions: [{ id: `${id}c`, structure: 'steady', activity: 'Run', summary, prescription: { distance: String(miles), distanceUnit: 'miles', duration: String(minutes) } }] });
const legacy = (id, date, lines, activity = 'Run', summary = 'Run') => ({ id, date, title: 'Training day', muscles: [], hasCardio: true, cardioSessions: [{ id: `${id}c`, structure: 'custom', activity, summary, prescription: { legacyIntervals: lines } }] });

const TODAY = '2026-09-22';
const records = [
  steady('r1', '2026-08-25', 4, 36, 'Easy run · 4 mi'),
  steady('r2', '2026-08-28', 8, 70, 'Long run · 8 mi'),              // longest all time
  steady('r3', '2026-09-02', 5, 44),
  legacy('r4', '2026-09-05', [{ cardioType: 'Run', distance: 1, unit: 'miles', time: 9 }, { cardioType: 'Run', distance: 0.5, unit: 'miles', time: 3 }, { cardioType: 'Run', distance: 0.5, unit: 'miles', time: 3 }, { cardioType: 'Run', distance: 1, unit: 'miles', time: 9 }], 'Run', 'Fartlek'), // 3 mi, not continuous
  steady('r5', '2026-09-08', 6, 54),
  { id: 'r6', date: '2026-09-10', title: 'Training day', muscles: [], hasCardio: true, cardioSessions: [{ id: 'r6c', structure: 'steady', activity: 'Bike', summary: 'Bike · 15 mi', prescription: { distance: '15', distanceUnit: 'miles', duration: '50' } }] },
  { id: 'r7', date: '2026-09-12', title: 'Training day', muscles: [], hasCardio: true, cardioSessions: [{ id: 'r7c', structure: 'steady', activity: 'Walk', summary: 'Walk · 3 mi', prescription: { distance: '3', distanceUnit: 'miles', duration: '55' } }] },
  legacy('r8', '2026-09-14', [{ cardioType: 'HYROX', distance: 4.97, unit: 'miles', time: 78 }], 'HYROX', 'HYROX stations · front half'), // counts to volume, never continuous
  { id: 'r9', date: '2026-09-16', title: 'Training day', muscles: [], hasCardio: true, cardioSessions: [{ id: 'r9c', structure: 'intervals', activity: 'Run', summary: '6 × 800 m', prescription: {}, intervalActuals: [1, 2, 3, 4, 5, 6].map(i => ({ id: i, repeatIndex: i, distance: '0.5', time: '3:10', completed: i < 6, source: 'manual', recovery: { kind: 'Passive rest', duration: '', distance: '', activity: '' } })) }] }, // 2.5 mi (5 completed)
  steady('r10', '2026-09-17', 3.1, 0, 'Run · 3.1 mi'),               // untimed still counts
  steady('r11', '2026-09-19', 7, 60, 'Long run · 7 mi'),
  steady('r12', '2026-09-21', 4, 8, 'Run · 4 mi'),                    // 2:00/mi — implausible, dropped
  steady('r13', '2026-09-22', 5, 45),                                  // today
  { id: 'r14', date: '2026-09-20', title: 'Lower Body', muscles: ['Quads'], hasCardio: false, topSets: [{ lift: 'Back Squat', weight: 315, reps: 5 }] },
];

console.log('\nWhat counts as a run');
const lines = runLines(records);
check('bike and walk are not runs', !lines.some(l => /bike|walk/i.test(l.label)));
check('an implausible pace is dropped', !lines.some(l => l.recordId === 'r12'));
check('an untimed run counts', lines.some(l => l.recordId === 'r10' && l.miles === 3.1 && l.minutes === 0));
check('a structured interval day counts its completed reps', near(runMilesOfRecord(records.find(r => r.id === 'r9')), 2.5), runMilesOfRecord(records.find(r => r.id === 'r9')));
check('a fartlek logged as lines adds up', runMilesOfRecord(records.find(r => r.id === 'r4')) === 3);
check('HYROX run legs count toward volume', near(runMilesOfRecord(records.find(r => r.id === 'r8')), 5.0), runMilesOfRecord(records.find(r => r.id === 'r8')));
check('a lifting day is zero', runMilesOfRecord(records.find(r => r.id === 'r14')) === 0);

console.log('\nThe last 7 days');
// Sep 16..22: r9 2.5 + r10 3.1 + r11 7 + r13 5 = 17.6  (r12 dropped)
check('7-day miles are 17.6', last7DayMiles(records, TODAY) === 17.6, last7DayMiles(records, TODAY));
const receipt = last7DayRuns(records, TODAY);
check('the receipt lists the runs behind it, oldest first', receipt.length === 8 && receipt[0].date === '2026-09-16' && receipt.at(-1).date === '2026-09-22', receipt.map(r => r.date).join(','));
check('a receipt line reads like a log line', /Sat, Sep 19 · 7 mi · Long run · 7 mi/.test(receiptLine(receipt.find(r => r.recordId === 'r11'))), receiptLine(receipt.find(r => r.recordId === 'r11')));
check('metric receipt is in km', /11.3 km/.test(receiptLine(receipt.find(r => r.recordId === 'r11'), true)), receiptLine(receipt.find(r => r.recordId === 'r11'), true));
check('milesBetween on an empty window is 0', milesBetween(records, '2026-07-01', '2026-07-31') === 0);

console.log('\nLongest run');
check('longest run all time is the 8-miler', longestRun(records)?.recordId === 'r2');
check('longest in the last 14 days is the 7-miler, not the HYROX legs or the reps', longestRun(records, TODAY, 14)?.recordId === 'r11', longestRun(records, TODAY, 14)?.recordId);
check("the 7-miler on the 19th was NOT the longest in a month — the 8 on Aug 28 was", !isLongestRunInWindow(records.find(r => r.id === 'r11'), records));
check('the 8-miler on Aug 28 was the longest in a month', isLongestRunInWindow(records.find(r => r.id === 'r2'), records));
check('longestContinuousRun agrees', longestContinuousRun(records) === 8);

console.log('\nEvery surface reads the same log');
const fromTrajectory = weeklyRunning(records, 8).reduce((s, w) => s + w.miles, 0);
const fromPrediction = runVolumeEntries(records).reduce((s, e) => s + e.miles, 0);
const fromStats = lines.reduce((s, l) => s + l.miles, 0);
check('weeklyRunning total = predictor total = stats total', near(fromTrajectory, fromStats, 0.11) && near(fromPrediction, fromStats), `${fromTrajectory} ${fromPrediction} ${fromStats}`);
check('medianWeeklyMiles is a number off the same lines', medianWeeklyMiles(records) > 0);

console.log('\nThe check-in tells the truth');
const askedAbout = records.find(r => r.id === 'r11');
check('a 7-miler against a ~4-mile normal is a big run day', bigDayReason(askedAbout, records) === 'run', bigDayReason(askedAbout, records));
const due = dueCheckIn(records.filter(r => r.date <= '2026-09-19'), [], '2026-09-20');
check('and the question says "bigger than usual", not "longest"', /bigger run than usual/.test(due?.prompt || ''), due?.prompt);
const due2 = dueCheckIn(records.filter(r => r.date <= '2026-08-28'), [], '2026-08-29');
check('the Aug 28 8-miler earns "longest run in a month" — or nothing, with only one prior run', !due2 || /longest run in a month|bigger run than usual/.test(due2.prompt), due2?.prompt);

console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
