/* A NEW ATHLETE'S STARTING NUMBERS STAND IN UNTIL THE FIRST REAL SET.

   Setup asks "what can you lift right now?" so day one has loads. The number
   is a stand-in: it fills a lift's best only while nothing of that lift is
   logged, never counts as a session or a single, and the first logged set of
   the lift replaces it. */
import { setStartingNumbers } from './src/lib/startingNumbers.ts';
import { bestsFromHistory } from './src/features/training/aiPlanService.ts';
import { goalProgress } from './src/lib/goalProgress.ts';
import { calculateEstimatedOneRepMax } from './src/lib/strength.ts';
import { canonicalLiftKey } from './src/lib/liftAliases.ts';
const B = canonicalLiftKey('Bench Press'), Q = canonicalLiftKey('Back Squat'), D = canonicalLiftKey('Deadlift');

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };

setStartingNumbers([{ lift: 'Bench Press', weight: 185, reps: 5 }, { lift: 'Back Squat', weight: 225, reps: 5 }]);
const bench = calculateEstimatedOneRepMax(185, 5);

console.log('\nWith nothing logged');
const empty = bestsFromHistory([]);
check('the bench has a best from the starting number', empty.bests.get(B) === bench, `${empty.bests.get(B)} vs ${bench}`);
check('and an anchor at the reps given', empty.anchors.get(B)?.get(5) === 185);
check('it is not a session', !empty.sessions.get(B));
check('and not a single for a Real 1RM goal', !empty.singles.get(B));
check('a lift with no starting number stays empty', !empty.bests.has(D));

console.log('\nThe first real set replaces it');
const logged = bestsFromHistory([{ date: '2026-11-02', topSets: [{ lift: 'Bench Press', weight: 155, reps: 5 }] }]);
check('the logged bench wins, even when lighter', logged.bests.get(B) === calculateEstimatedOneRepMax(155, 5), String(logged.bests.get(B)));
check('the squat still uses its starting number', logged.bests.get(Q) === calculateEstimatedOneRepMax(225, 5), JSON.stringify([...logged.bests]));
const missed = bestsFromHistory([{ date: '2026-11-02', topSets: [{ lift: 'Bench Press', weight: 205, reps: 5, completed: false }] }]);
check('a missed set also means the number is not used', !missed.bests.has(B));

console.log('\nA strength goal has a "now" on day one');
const goal = { type: 'Strength', title: '225 lb Bench', target: '225 lb', unit: 'lb', exercise: 'Bench Press', date: '2027-02-01', connection: '' };
const now = goalProgress(goal, [], undefined, null, 'calculated');
check('calculated mode reads the starting number', now.current === bench, String(now.current));
const tested = goalProgress(goal, [], undefined, null, 'tested');
check('tested mode does not: a typed estimate is not a tested max', tested.current === null, String(tested.current));

setStartingNumbers([]);
check('with none given, nothing is invented', !bestsFromHistory([]).bests.size);

console.log(`\n${fails ? `${fails} failed` : 'All checks passed'}`);
process.exit(fails ? 1 : 0);
