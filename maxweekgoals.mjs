/* EVERY MAX WEEK TESTS EVERY GOAL LIFT — ONCE.

   Preston's block put its max week on Dec 27 – Jan 2. His Squat and Bench
   goals are dated Dec 30 and his 5K Dec 31, so the max week was also a race
   week. The nearer goal used to own a week like that, and a tie went to the
   race: Squat came out 475 × 2 and Bench 365 × 2, and the block ended with no
   tested max at all.

   The rule now: in a max week, every goal lift the split trains gets exactly
   one 1RM attempt. A goal lift that the split does not train is not invented.
   A split that hits the same lift twice in the week keeps one attempt and the
   other exposure takes the heavy double. */
import { resolvePlanWeek, bestsFromHistory, chooseMaxAttempts, attemptSlot, resolveWeekRunning } from './src/features/training/aiPlanService.ts';
import { peakConflict } from './src/lib/interference.ts';
import { calculateEstimatedOneRepMax } from './src/lib/strength.ts';

let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : d ? ` — ${d}` : ''}`); if (!c) fails++; };
const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const logged = (ago, lift, weight, reps) => ({ id: `${ago}${lift}`, date: day(ago), title: 'Training', muscles: ['Quads'],
  topSets: [{ id: `${ago}${lift}t`, muscle: 'Quads', lift, weight, reps, completed: true, calculatedMax: calculateEstimatedOneRepMax(weight, reps) }],
  hasCardio: false, cardioSessions: [] });

const SPLIT = [
  { name: 'Sharms', dayType: 'strength', muscles: ['Shoulders'], exercises: ['Smith Machine Shoulder Press'] },
  { name: 'Long Run', dayType: 'cardio', muscles: ['Cardio'], exercises: [] },
  { name: 'Chack 2', dayType: 'strength', muscles: ['Chest', 'Back'], exercises: ['Bench', 'Lat Pulldown'] },
  { name: 'Legs', dayType: 'strength', muscles: ['Quads'], exercises: ['Squat', 'Backless squat', 'Hack Squat', 'Smith Machine Squat'] },
  { name: 'Rest', dayType: 'rest', muscles: [], exercises: [] },
];
const RECORDS = [
  logged(2, 'Squat', 455, 4), logged(9, 'Squat', 445, 6), logged(16, 'Squat', 425, 8), logged(30, 'Squat', 475, 1),
  logged(3, 'Bench', 345, 4), logged(10, 'Bench', 335, 6), logged(17, 'Bench', 315, 8),
  logged(4, 'Hack Squat', 400, 6), logged(5, 'Backless squat', 165, 10), logged(6, 'Smith Machine Squat', 385, 8),
  logged(7, 'Lat Pulldown', 230, 12), logged(8, 'Smith Machine Shoulder Press', 225, 10),
];
const history = bestsFromHistory(RECORDS);
/* Pull Ups is a goal too, and this split does not train it. */
const GOAL_LIFTS = new Set(['squat', 'bench', 'pull ups']);
const ATHLETE = { runningDays: 2, minWeeklyMileage: 4, maxWeeklyMileage: 30, weeklyMileage: 10, longestRunMiles: 4 };
const WEEK = { week: 9, phase: 'Race', mileage: 6, longRunMiles: 0, longRunPace: '9:00', longRunDay: 'Long Run',
  quality: '5K race', qualityPace: '6:07', qualityDay: 'Long Run', easyDays: ['Sharms'], easyMinutes: 10, easyPace: '9:00',
  topSets: [{ splitDay: 'Legs', exercise: 'Hack Squat', weight: 440, reps: 2 }, { splitDay: 'Chack 2', exercise: 'Bench', weight: 365, reps: 2 }], note: '' };
const strength = sessions => ({ bests: history.bests, singles: history.singles, goalLifts: GOAL_LIFTS, anchors: history.anchors,
  sessions: sessions || history.sessions, misses: history.misses, lastAt: history.lastAt });
/* Max week of the wave (index 4 → the "1"), eight weeks from now, with the
   race and the lift goals in the same week. */
const BLOCK = { weekIndex: 8, blockWeeks: 10, waveIndex: 9, currentWaveIndex: 1, currentWeekIndex: 0, liftingMaxWeek: true, weeksToRace: 8, weeksToLiftGoal: 8 };

console.log('\nA max week on race week still tests the goal lifts');
const week = resolvePlanWeek(WEEK, SPLIT, ATHLETE, BLOCK, strength());
const singles = name => week.topSets.filter(row => row.exercise === name && row.reps === 1);
check('Squat gets its 1RM attempt', singles('Squat').length === 1, JSON.stringify(week.topSets.filter(r => r.exercise === 'Squat')));
check('Bench gets its 1RM attempt', singles('Bench').length === 1, JSON.stringify(week.topSets.filter(r => r.exercise === 'Bench')));
/* A full wave out, the projection assumes the max week before it happened:
   five percent over the tested single per wave, never more. */
check('the attempt is above the tested single and within the projected ceiling', singles('Squat')[0]?.weight > 475 && singles('Squat')[0]?.weight <= Math.floor(475 * 1.05 * 1.05 / 5) * 5, String(singles('Squat')[0]?.weight));
check('a goal lift the split does not train is not invented', !week.topSets.some(row => row.exercise === 'Pull Ups'));
check('no accessory is turned into a single', week.topSets.filter(row => row.reps === 1).every(row => GOAL_LIFTS.has(row.exercise.toLowerCase())),
  week.topSets.filter(row => row.reps === 1).map(row => row.exercise).join(', '));
check('a tie between race and lift goal goes to the max', peakConflict({ liftingMaxWeek: true, runningPeakWeek: true, weeksToRace: 8, weeksToLiftGoal: 8 })?.owner === 'lifting');
check('so does a race that is nearer', peakConflict({ liftingMaxWeek: true, runningPeakWeek: true, weeksToRace: 2, weeksToLiftGoal: 9 })?.owner === 'lifting');
const running = resolveWeekRunning(WEEK, SPLIT, { ...ATHLETE, goalPaceSecondsPerMile: 367, goalMiles: 3.1 }, BLOCK);
check('and the race itself is not turned into an easy run', !/max attempt/i.test(running.quality), running.quality);

console.log('\nA max week far ahead counts the sessions before it');
const fresh = new Map([...history.sessions].map(([key, count]) => [key, key === 'squat' ? 1 : count]));
const ahead = resolvePlanWeek(WEEK, SPLIT, ATHLETE, BLOCK, strength(fresh));
check('a lift trained once so far still tests eight weeks out', ahead.topSets.some(row => row.exercise === 'Squat' && row.reps === 1),
  JSON.stringify(ahead.topSets.filter(r => r.exercise === 'Squat')));
const now = resolvePlanWeek(WEEK, SPLIT, ATHLETE, { ...BLOCK, weekIndex: 0, currentWeekIndex: 0, waveIndex: 4, currentWaveIndex: 4 }, strength(fresh));
check('but this week it has not ramped, so it holds the double', now.topSets.some(row => row.exercise === 'Squat' && row.reps === 2),
  JSON.stringify(now.topSets.filter(r => r.exercise === 'Squat')));

console.log('\nNo more than one attempt per goal lift per week');
/* A rolling split visiting Legs twice, with Squat as the SECOND set on one
   visit: the old picker looked at each day's first set only, so both kept the
   single. */
const attempts = chooseMaxAttempts([
  { day: 1, exercise: 'Hack Squat', reps: 2, hasHold: false, cost: 0 },
  { day: 1, exercise: 'Squat', reps: 1, hasHold: true, cost: 2 },
  { day: 4, exercise: 'Squat', reps: 1, hasHold: true, cost: 0 },
  { day: 4, exercise: 'Bench', reps: 1, hasHold: true, cost: 0 },
  { day: 6, exercise: 'Back Squat', reps: 1, hasHold: true, cost: 1 },
]);
const squatSlots = [...attempts].filter(slot => slot.endsWith('|squat') || slot.endsWith('|back squat'));
check('one attempt for Squat, whichever spelling', squatSlots.length === 1, [...attempts].join(', '));
check('on its cheapest day', attempts.has(attemptSlot(4, 'Squat')), [...attempts].join(', '));
check('and Bench on the same day keeps its own', attempts.has(attemptSlot(4, 'Bench')));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
