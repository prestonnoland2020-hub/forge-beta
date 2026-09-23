/* THE WEEK REVIEWED — four lines, one change at most, only when the numbers
   say so. */
import { weekReview } from './src/lib/weekReview.ts';
import { parseActions } from './src/lib/coachActions.ts';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };
const ctx = { splitDays: [{ position: 1, name: 'Lower Body' }], goals: [], activeNoteAreas: [], exercises: [], weeklyMileage: 20, runningDays: 3, loadBiasPercent: 0 };
const base = { todayIso: '2026-09-21', weekStartIso: '2026-09-14', trainedDays: 4, plannedDays: 4, ranMiles: 18, plannedMiles: 20, priorRanMiles: 19, priorPlannedMiles: 20, verdicts: [], liftMisses: [], prs: [], readinessAvg: null, loadBiasPercent: 0, nextText: '3 × 1 mi at threshold on Quality Cardio' };

console.log('\nA clean week');
let r = weekReview(base);
check('four lines: happened, matters, changes, next', r.lines.length === 4, JSON.stringify(r.lines));
check('line one carries the counts', r.lines[0] === 'Last week: 4 sessions, 18 mi.', r.lines[0]);
check('nothing changes, and no action is offered', /Nothing changes/.test(r.lines[2]) && !r.actions);
check('keyed to the week it covers', r.key === 'week-review:2026-09-14');
check('and it outranks every other note', r.priority === 90);

console.log('\nA PR');
r = weekReview({ ...base, prs: [{ lift: 'Back Squat', weight: 285, reps: 4 }] });
check('the PR is in line one', /a PR \(Back Squat 285 × 4\)/.test(r.lines[0]), r.lines[0]);

console.log('\nA lift that keeps missing');
r = weekReview({ ...base, liftMisses: [{ lift: 'Bench Press', misses: 2, askedReps: 6 }] });
check('the miss is the one thing that matters', /Bench Press came in under the ask twice running at 6 reps/.test(r.lines[1]), r.lines[1]);
check('and the change is a 2.5% load bias, as an action', r.actions?.length === 1 && r.actions[0].type === 'set_load_bias' && r.actions[0].percent === -2.5, JSON.stringify(r.actions));
check('the action parses into a labelled change', parseActions(r.actions, ctx)[0]?.label === 'Strength loads: 0% → -2.5%', parseActions(r.actions, ctx)[0]?.label);
r = weekReview({ ...base, liftMisses: [{ lift: 'Bench Press', misses: 2 }], loadBiasPercent: -10 });
check('the bias never goes under −10', r.actions[0].percent === -10);

console.log('\nRunning short');
r = weekReview({ ...base, ranMiles: 10, plannedMiles: 20 });
check('one short week is noted, not acted on', /10 mi of the 20 mi/.test(r.lines[1]) && !r.actions, r.lines[1]);
r = weekReview({ ...base, ranMiles: 10, plannedMiles: 20, priorRanMiles: 9, priorPlannedMiles: 20 });
check('two short weeks bring the plan down to what is run', /Two weeks running under the plan/.test(r.lines[1]) && r.actions?.[0].type === 'set_weekly_mileage' && r.actions[0].miles === 11, JSON.stringify(r.actions));
check('metric athletes read km', /16.1 km of the 32.2 km/.test(weekReview({ ...base, ranMiles: 10, plannedMiles: 20, metric: true }).lines[1]), weekReview({ ...base, ranMiles: 10, plannedMiles: 20, metric: true }).lines[1]);

console.log('\nHard sessions');
r = weekReview({ ...base, verdicts: [{ date: '2026-09-15', outcome: 'slower', text: 'x' }, { date: '2026-09-18', outcome: 'faded', text: 'y' }, { date: '2026-09-19', outcome: 'on', text: 'z' }] });
check('two slow sessions: paces hold, no action yet', /2 of 3 hard sessions came in under/.test(r.lines[1]) && !r.actions, r.lines[1]);
r = weekReview({ ...base, verdicts: [{ date: '2026-09-15', outcome: 'faster', text: 'x' }, { date: '2026-09-18', outcome: 'faster', text: 'y' }] });
check('two fast sessions: the model moves up', /faster than asked/.test(r.lines[1]) && /asks for more/.test(r.lines[2]));

console.log('\nReadiness and attendance');
r = weekReview({ ...base, readinessAvg: 50 });
check('a low-readiness week proposes rest today', /Readiness averaged 50/.test(r.lines[1]) && r.actions?.[0].type === 'rest_today', JSON.stringify(r.actions));
r = weekReview({ ...base, trainedDays: 2, plannedDays: 4 });
check('two missed split days: said, nothing changes', /2 of 4 split days/.test(r.lines[1]) && !r.actions);
check('the miss outranks attendance', /Bench Press/.test(weekReview({ ...base, trainedDays: 2, liftMisses: [{ lift: 'Bench Press', misses: 3 }] }).lines[1]));

console.log('\nNothing to say');
check('an empty week produces no review', weekReview({ ...base, trainedDays: 0, ranMiles: 0 }) === null);

console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
