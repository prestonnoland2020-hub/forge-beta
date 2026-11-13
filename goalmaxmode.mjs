import { calculateEstimatedOneRepMax } from './src/lib/strength.ts';
/* CALCULATED OR TESTED, AND THE GOALS PAGE SAYS WHICH.

   Every strength goal on the page read its calculated max — the estimate
   from any set — with no way to see the number actually lifted for one.
   The page now switches between the two, and the switch moves every
   strength number on it: the cards, the bars and the ring. */
import { goalProgress } from './src/lib/goalProgress.ts';
import { testedRaceSeconds } from './src/lib/cardioPrediction.ts';
import { readFileSync } from 'node:fs';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };
const goal = { type: 'Strength', title: '225 lb Bench', exercise: 'Bench Press', target: '225 lb', unit: 'lb', date: '2027-01-17', current: '' };
const records = [{ date: '2026-10-20', topSets: [{ lift: 'Bench Press', weight: 185, reps: 5 }, { lift: 'Bench Press', weight: 195, reps: 1 }] }];
const verdict = { verdict: 'needs-more' };

console.log('\nThe two maxes');
check('calculated is the best estimate from any set', goalProgress(goal, records, verdict, null, 'calculated').current === calculateEstimatedOneRepMax(185, 5));
check('tested is the heaviest completed single', goalProgress(goal, records, verdict, null, 'tested').current === 195);
check('a failed single does not count', goalProgress(goal, [{ date: '2026-10-21', topSets: [{ lift: 'Bench Press', weight: 225, reps: 1, completed: false }] }], verdict, null, 'tested').current === null);
check('a starting 1RM entered on the goal counts as tested', goalProgress({ ...goal, current: '200' }, [], verdict, null, 'tested').current === 200);
const none = goalProgress(goal, [{ date: '2026-10-20', topSets: [{ lift: 'Bench Press', weight: 185, reps: 5 }] }], verdict, null, 'tested');
check('with no single there is no bar, and it says why', none.share === null && none.label === 'No tested max yet', JSON.stringify(none));
const reps = { ...goal, title: '12 Pull Ups', exercise: 'Pull Ups', target: '12 reps', unit: 'reps' };
check('a rep goal is reps in either mode', goalProgress(reps, [{ date: '2026-10-20', topSets: [{ lift: 'Pull Ups', weight: 0, reps: 9 }] }], verdict, null, 'tested').current === 9);

console.log('\nRunning goals');
const run = (date, miles, minutes) => ({ id: date, date, title: 'Run', muscles: ['Cardio'], topSets: [], hasCardio: true, cardioSessions: [{ id: date, activity: 'Run', structure: 'custom', summary: 'Run', prescription: { legacyIntervals: [{ distance: miles, unit: 'miles', time: minutes, cardioType: 'Run' }] } }] });
const fiveK = { type: 'Endurance', title: 'Sub-20 5K', exercise: '5K Run', target: '20:00 mm:ss', unit: 'mm:ss', date: '2027-03-01', current: '' };
const ran = [run('2026-10-20', 3.11, 21), run('2026-10-22', 1, 6.5)];
const testedNow = testedRaceSeconds(ran, 3.10686);
check('tested is a time actually run at the distance', testedNow !== null && Math.abs(testedNow - 21 * 60 * 3.10686 / 3.11) < 1, String(testedNow));
check('a shorter run is not a tested 5K', testedRaceSeconds([run('2026-10-22', 1, 6.5)], 3.10686) === null);
check('a longer run counts at its own pace', Math.round(testedRaceSeconds([run('2026-10-20', 6.2, 48)], 3.10686)) === Math.round(48 * 60 * 3.10686 / 6.2));
const noTime = goalProgress(fiveK, [], verdict, null, 'tested', null);
check('with no run that long there is no bar, and it says why', noTime.share === null && noTime.label === 'No tested time yet', JSON.stringify(noTime));

check('a run from years ago is not a tested time', testedRaceSeconds([run('2020-01-06', 3.27, 15.9)], 3.10686) === null);
check('a time far faster than the estimate is not a tested time', testedRaceSeconds([run('2026-10-20', 5.47, 30)], 3.10686, [], 19 * 60 + 50) === null);
check('a real recent time within reach of the estimate counts', testedRaceSeconds([run('2026-10-20', 4, 30)], 3.10686, [], 19 * 60 + 50) !== null);

console.log('\nThe page');
const page = readFileSync('./src/pages/GoalsPage.tsx', 'utf8');
check('every goal is measured in the chosen mode', /goalProgress\(goal, records, verdicts\[index\], setup, maxMode[,)]/.test(page));
check('the choice is remembered on the device', /localStorage\.setItem\('forge-goals-max-mode', mode\)/.test(page));
check('the switch shows when a strength or running goal can use it, once something is logged', /\{\(hasStrength \|\| hasRunTime\) && records\.length > 0 && <div className="gx-mode"/.test(page));
check('running goals read the same switch', /maxMode === 'tested' \? testedRaceSeconds/.test(page));

console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
