/* CALCULATED OR TESTED, AND THE GOALS PAGE SAYS WHICH.

   Every strength goal on the page read its calculated max — the estimate
   from any set — with no way to see the number actually lifted for one.
   The page now switches between the two, and the switch moves every
   strength number on it: the cards, the bars and the ring. */
import { goalProgress } from './src/lib/goalProgress.ts';
import { readFileSync } from 'node:fs';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };
const goal = { type: 'Strength', title: '225 lb Bench', exercise: 'Bench Press', target: '225 lb', unit: 'lb', date: '2027-01-17', current: '' };
const records = [{ date: '2026-10-20', topSets: [{ lift: 'Bench Press', weight: 185, reps: 5 }, { lift: 'Bench Press', weight: 195, reps: 1 }] }];
const verdict = { verdict: 'needs-more' };

console.log('\nThe two maxes');
check('calculated is the best estimate from any set', goalProgress(goal, records, verdict, null, 'calculated').current === 208);
check('tested is the heaviest completed single', goalProgress(goal, records, verdict, null, 'tested').current === 195);
check('a failed single does not count', goalProgress(goal, [{ date: '2026-10-21', topSets: [{ lift: 'Bench Press', weight: 225, reps: 1, completed: false }] }], verdict, null, 'tested').current === null);
check('a starting 1RM entered on the goal counts as tested', goalProgress({ ...goal, current: '200' }, [], verdict, null, 'tested').current === 200);
const none = goalProgress(goal, [{ date: '2026-10-20', topSets: [{ lift: 'Bench Press', weight: 185, reps: 5 }] }], verdict, null, 'tested');
check('with no single there is no bar, and it says why', none.share === null && none.label === 'No tested max yet', JSON.stringify(none));
const reps = { ...goal, title: '12 Pull Ups', exercise: 'Pull Ups', target: '12 reps', unit: 'reps' };
check('a rep goal is reps in either mode', goalProgress(reps, [{ date: '2026-10-20', topSets: [{ lift: 'Pull Ups', weight: 0, reps: 9 }] }], verdict, null, 'tested').current === 9);

console.log('\nThe page');
const page = readFileSync('./src/pages/GoalsPage.tsx', 'utf8');
check('every goal is measured in the chosen mode', /goalProgress\(goal, records, verdicts\[index\], setup, maxMode[,)]/.test(page));
check('the choice is remembered on the device', /localStorage\.setItem\('forge-goals-max-mode', mode\)/.test(page));
check('the switch shows only when a strength goal can use it', /\{hasStrength && <div className="gx-mode"/.test(page));

console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
