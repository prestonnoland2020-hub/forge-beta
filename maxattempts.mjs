/* ONE 1RM ATTEMPT PER GOAL LIFT PER MAX WEEK, however often the split lands
   the lift's day. chooseMaxAttempts answers per lift, not per day. */
import { chooseMaxAttempts, loggedSinglesByLift } from './src/features/training/aiPlanService.ts';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };
const attempt = exercise => ({ exercise, reps: 1, hasHold: true });
const double = exercise => ({ exercise, reps: 2, hasHold: false });

console.log('\nA rolling split lands Chest & Back twice in one max week');
/* Mon Chest & Back, Tue Legs, Wed Rest, Thu Chest & Back, Fri Legs, Sat Rest, Sun Chest & Back */
const chestBack = [attempt('Bench Press'), attempt('Pull Ups')];
const legs = [attempt('Squat')];
const week = [
  { iso: '2026-11-02', sets: chestBack, cost: 0 },
  { iso: '2026-11-03', sets: legs, cost: 0 },
  { iso: '2026-11-04', sets: [], cost: 0 },
  { iso: '2026-11-05', sets: chestBack, cost: 0 },
  { iso: '2026-11-06', sets: legs, cost: 0 },
  { iso: '2026-11-07', sets: [], cost: 0 },
  { iso: '2026-11-08', sets: chestBack, cost: 0 },
];
const picked = chooseMaxAttempts(week);
check('bench is attempted once', picked.get('bench') === 0, JSON.stringify([...picked]));
check('pull ups — the SECOND lift on the day — is attempted once too', [...picked.keys()].filter(key => /pull/.test(key)).length === 1 && picked.get([...picked.keys()].find(key => /pull/.test(key))) === 0, JSON.stringify([...picked]));
check('squat is attempted once', picked.get('squat') === 1);
check('one entry per lift, never one per appearance', picked.size === 3);

console.log('\nThe cleanest day wins, the earliest on a tie');
const costed = chooseMaxAttempts([
  { iso: 'a', sets: legs, cost: 2 },
  { iso: 'b', sets: legs, cost: 0 },
  { iso: 'c', sets: legs, cost: 0 },
]);
check('the long-run day loses to a clean one', costed.get('squat') === 1);

console.log('\nA single already in the log settles it');
const logged = loggedSinglesByLift([
  { date: '2026-11-05', topSets: [{ lift: 'Bench Press', reps: 1, completed: true }, { lift: 'Pull Ups', reps: 2, completed: true }] },
  { date: '2026-11-03', topSets: [{ lift: 'Squat', reps: 1, completed: false }] },
]);
const afterPr = chooseMaxAttempts(week, logged);
check('bench taken Thursday: Thursday is its attempt, Monday and Sunday hold the double', afterPr.get('bench') === 3, String(afterPr.get('bench')));
check('a missed single does not count as taken', afterPr.get('squat') === 1);
check('a double is not a single', !logged.has([...picked.keys()].find(key => /pull/.test(key))));

console.log('\nNothing to attempt, nothing chosen');
check('doubles only', chooseMaxAttempts([{ iso: 'a', sets: [double('Squat')], cost: 0 }]).size === 0);
check('a single with no hold (not a max-week attempt) is not chosen', chooseMaxAttempts([{ iso: 'a', sets: [{ exercise: 'Squat', reps: 1, hasHold: false }], cost: 0 }]).size === 0);

console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
