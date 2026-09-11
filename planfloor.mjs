/* A PLAN UNDER THE ATHLETE'S OWN TRAINING IS A TAPER WITH A BLOCK'S NAME ON IT.

   Preston's week asked for 1.5-mile easy runs and a 4.2-mile long run while he
   was running five-mile long runs every week. The block was built from the
   mileage he typed into setup months ago, and nothing ever compared it against
   what he was actually doing. */
import { resolveWeekRunning, LONG_RUN_MAX_SHARE } from './src/features/training/aiPlanService.ts';
import { medianWeeklyMiles, longestContinuousRun } from './src/lib/goalTrajectory.ts';

let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${d ? ` — ${d}` : ''}`); if (!c) fails++; };
const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const run = (ago, miles, minutes, lines = 1) => ({ id: `r${ago}-${miles}`, date: day(ago), title: 'Run', muscles: ['Cardio'], hasCardio: true, topSets: [],
  cardioSessions: [{ id: `c${ago}-${miles}`, activity: 'Run', structure: 'steady', summary: `Run · ${miles} mi`,
    prescription: { legacyIntervals: Array.from({ length: lines }, () => ({ distance: miles / lines, unit: 'miles', time: minutes / lines, cardioType: 'Run' })) } }] });

const SPLIT = [
  { name: 'Legs', dayType: 'strength' }, { name: 'Long Run', dayType: 'cardio' },
  { name: 'Push', dayType: 'strength' }, { name: 'Easy', dayType: 'cardio' },
  { name: 'Pull', dayType: 'strength' }, { name: 'Easy 2', dayType: 'cardio' },
  { name: 'Rest', dayType: 'rest' },
];
const WEEK = { week: 1, phase: 'Build', mileage: 14, longRunMiles: 4.2, longRunPace: '9:30', longRunDay: 'Long Run',
  quality: '', qualityPace: '', qualityDay: '', easyDays: ['Easy', 'Easy 2'], easyMinutes: 20, easyPace: '9:30', topSets: [], note: '' };

/* Nine weeks of real running: five-mile long runs, ~18 a week. */
const RUNNING = [];
for (let week = 0; week < 9; week += 1) {
  RUNNING.push(run(week * 7 + 1, 5.2, 42), run(week * 7 + 3, 3, 28), run(week * 7 + 5, 3, 28), run(week * 7 + 6, 6.5, 55));
}

console.log('\n  what he is actually running is read from the log');
const actualWeekly = medianWeeklyMiles(RUNNING);
const actualLongest = longestContinuousRun(RUNNING);
check('about 17-18 miles a week', actualWeekly >= 16 && actualWeekly <= 19, String(actualWeekly));
check('and a 6.5-mile longest run', actualLongest === 6.5, String(actualLongest));
check('an interval session is not a long run', longestContinuousRun([run(1, 8, 60, 8)]) === 0);

console.log('\n  the stated number no longer prescribes under it');
/* Setup says 10 a week and a 4-mile longest; the log says otherwise. */
const stated = { runningDays: 5, minWeeklyMileage: 0, maxWeeklyMileage: 30, weeklyMileage: 10, longestRunMiles: 4 };
const blind = resolveWeekRunning(WEEK, SPLIT, stated, { weekIndex: 0, blockWeeks: 10 });
const seeing = resolveWeekRunning(WEEK, SPLIT, { ...stated, recentWeeklyMileage: actualWeekly, recentLongestRun: actualLongest }, { weekIndex: 0, blockWeeks: 10 });
check('the old plan sat at or under his actual volume', blind.mileage <= actualWeekly, `${blind.mileage} vs ${actualWeekly} run`);
check('the new one is at least what he runs', seeing.mileage >= actualWeekly - 0.1, `${seeing.mileage} vs ${actualWeekly} run`);
check('and the long run is no shorter than his own', seeing.longRunMiles >= Math.min(actualLongest, seeing.mileage * LONG_RUN_MAX_SHARE) - 0.1,
  `${seeing.longRunMiles} vs ${actualLongest} run`);
check('which is a longer long run than before', seeing.longRunMiles > blind.longRunMiles, `${blind.longRunMiles} → ${seeing.longRunMiles}`);

console.log('\n  the athlete’s own ceiling still holds');
const capped = resolveWeekRunning(WEEK, SPLIT, { ...stated, maxWeeklyMileage: 15, recentWeeklyMileage: 40, recentLongestRun: 20 }, { weekIndex: 0, blockWeeks: 10 });
check('a 15-mile cap is not overridden by a big month', capped.mileage <= 15, String(capped.mileage));
check('and the long run stays a share of the week', capped.longRunMiles <= 15 * LONG_RUN_MAX_SHARE + 0.1, String(capped.longRunMiles));

console.log('\n  a deload is still allowed to be a deload');
const deload = resolveWeekRunning(WEEK, SPLIT, { ...stated, recentWeeklyMileage: actualWeekly, recentLongestRun: actualLongest }, { weekIndex: 3, blockWeeks: 10, waveIndex: 3 });
/* The share cap is what stops it, and a tenth either way is rounding. */
check('the long run does not eat a light week', deload.longRunMiles <= deload.mileage * 0.4,
  `${deload.longRunMiles} of ${deload.mileage}`);
check('and the week really is lighter than the build week', deload.mileage < seeing.mileage,
  `${deload.mileage} vs ${seeing.mileage}`);

console.log('\n  and an athlete with no running logged is unchanged');
const fresh = resolveWeekRunning(WEEK, SPLIT, stated, { weekIndex: 0, blockWeeks: 10 });
check('nothing invented from an empty log', fresh.mileage === blind.mileage && fresh.longRunMiles === blind.longRunMiles);

console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
