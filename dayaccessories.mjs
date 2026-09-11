/* OPENING A PLAN DAY SHOWS EVERYTHING MAPPED TO IT.

   Preston's Chest & Back 2 maps four movements: Bench, Pull Ups, Smith Machine
   Incline Bench and Lat Pulldown. Bench and Pull Ups are goal lifts; the other
   two are not. The block's rows are whatever the model wrote — usually one or
   two a day — and resolvePlanWeek only ever repaired them, so the day showed
   two lines and opening it showed the same two. The athlete had mapped four
   movements and Forge had an opinion about two.

   The accessory cycle exists precisely so the rest can be prescribed. */
import { resolvePlanWeek, bestsFromHistory, ACCESSORY_REPS, WAVE_REPS } from './src/features/training/aiPlanService.ts';
import { calculateEstimatedOneRepMax } from './src/lib/strength.ts';

let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${d ? ` — ${d}` : ''}`); if (!c) fails++; };
const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

const SPLIT = [
  { name: 'Chest & Back 2', dayType: 'strength', muscles: ['Chest', 'Back'],
    exercises: ['Bench', 'Pull Ups', 'Smith Machine Incline Bench', 'Lat Pulldown'] },
  { name: 'Legs 2', dayType: 'strength', muscles: ['Quads'], exercises: ['Squat', 'Hack Squat'] },
  { name: 'Rest', dayType: 'rest', muscles: [], exercises: [] },
];
/* Every one of them logged at least once, because a lift with no history has
   nothing to wave off. */
const set = (ago, lift, weight, reps) => ({ id: `${ago}${lift}`, date: day(ago), title: 'Training', muscles: ['Chest'],
  topSets: [{ id: `${ago}${lift}t`, muscle: 'Chest', lift, weight, reps, completed: true, calculatedMax: calculateEstimatedOneRepMax(weight, reps) }],
  hasCardio: false, cardioSessions: [] });
const RECORDS = [
  set(2, 'Bench', 320, 6), set(4, 'Pull Ups', 90, 8), set(6, 'Smith Machine Incline Bench', 315, 3),
  set(8, 'Lat Pulldown', 265, 8), set(10, 'Squat', 460, 4), set(12, 'Hack Squat', 400, 6),
];
const history = bestsFromHistory(RECORDS);
const GOAL_LIFTS = new Set(['bench', 'pull ups', 'squat']);

/* A block that names ONE movement on the four-exercise day, the way the model
   writes them. */
const WEEK = { week: 1, phase: 'Build', mileage: 0, longRunMiles: 0, longRunPace: '', longRunDay: '',
  quality: '', qualityPace: '', qualityDay: '', easyDays: [], easyMinutes: 0, easyPace: '',
  topSets: [{ splitDay: 'Chest & Back 2', exercise: 'Bench', weight: 300, reps: 8 }], note: '' };
const ATHLETE = { runningDays: 0, minWeeklyMileage: 0, maxWeeklyMileage: 0, weeklyMileage: 0, longestRunMiles: 0 };

const resolve = waveIndex => resolvePlanWeek(WEEK, SPLIT, ATHLETE,
  { weekIndex: 0, blockWeeks: 10, waveIndex, currentWaveIndex: waveIndex },
  { bests: history.bests, singles: history.singles, goalLifts: GOAL_LIFTS, anchors: history.anchors,
    sessions: history.sessions, misses: history.misses, lastAt: history.lastAt });

const week = resolve(0);
const onDay = name => week.topSets.filter(row => row.splitDay === name);

console.log('\n  the day prescribes every movement mapped to it');
const chestBack = onDay('Chest & Back 2');
check('four movements mapped, four prescribed', chestBack.length === 4, chestBack.map(r => r.exercise).join(', '));
for (const name of ['Bench', 'Pull Ups', 'Smith Machine Incline Bench', 'Lat Pulldown']) {
  check(`${name} is there`, chestBack.some(row => row.exercise === name));
}
check('and every one carries a real load', chestBack.every(row => row.weight > 0 && row.reps > 0),
  chestBack.map(r => `${r.exercise} ${r.weight}×${r.reps}`).join(' · '));

console.log('\n  the block’s own rows keep their place at the front');
check('Bench leads, because that is the row the block wrote', chestBack[0].exercise === 'Bench', chestBack[0].exercise);

console.log('\n  goal lifts run the wave; the rest run the accessory cycle');
const repsOf = name => chestBack.find(row => row.exercise === name).reps;
check(`Bench takes a wave rung (${WAVE_REPS.join('/')})`, WAVE_REPS.includes(repsOf('Bench')), String(repsOf('Bench')));
check('Pull Ups too, it is a goal as well', WAVE_REPS.includes(repsOf('Pull Ups')), String(repsOf('Pull Ups')));
check(`Lat Pulldown takes an accessory rung (${ACCESSORY_REPS.join('/')})`,
  ACCESSORY_REPS.includes(repsOf('Lat Pulldown')), String(repsOf('Lat Pulldown')));
check('and so does the incline press', ACCESSORY_REPS.includes(repsOf('Smith Machine Incline Bench')),
  String(repsOf('Smith Machine Incline Bench')));

console.log('\n  a day the block said nothing about is prescribed too');
const legs = onDay('Legs 2');
check('both of its movements appear', legs.length === 2, legs.map(r => `${r.exercise} ${r.weight}×${r.reps}`).join(' · '));
check('the goal lift waves', WAVE_REPS.includes(legs.find(r => r.exercise === 'Squat').reps));
check('the accessory cycles', ACCESSORY_REPS.includes(legs.find(r => r.exercise === 'Hack Squat').reps));

console.log('\n  and nothing is invented');
check('the rest day gets no lifts', onDay('Rest').length === 0);
const unlogged = resolvePlanWeek(WEEK, [{ ...SPLIT[0], exercises: [...SPLIT[0].exercises, 'Cable Fly'] }], ATHLETE,
  { weekIndex: 0, blockWeeks: 10 },
  { bests: history.bests, singles: history.singles, goalLifts: GOAL_LIFTS, anchors: history.anchors,
    sessions: history.sessions, misses: history.misses, lastAt: history.lastAt });
check('a movement with no logged history is left out rather than shown as 0 × 0',
  !unlogged.topSets.some(row => row.exercise === 'Cable Fly'),
  unlogged.topSets.map(r => r.exercise).join(', '));

console.log('\n  max week does not turn the accessories into singles');
const maxWeek = resolve(4).topSets.filter(row => row.splitDay === 'Chest & Back 2');
check('no accessory is asked for a single', maxWeek.filter(row => !GOAL_LIFTS.has(row.exercise.toLowerCase())).every(row => row.reps > 1),
  maxWeek.map(r => `${r.exercise} ${r.weight}×${r.reps}`).join(' · '));

console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
