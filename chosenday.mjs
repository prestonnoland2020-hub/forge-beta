/* PRESTON'S MONDAY, REPRODUCED.

   The cycle owed Rest (position 8 — he had logged Sharms 2 the day before).
   He chose Chest & Back instead. The logger showed no top sets and asked him
   to map exercises the split had already named.

   This drives the real engine with his real split and a history shaped like
   his, and asserts the chosen day comes back with the day's lifts and real
   numbers on them. */
import { buildDailyRecommendation, recommendationFingerprint } from './src/lib/dailyRecommendationEngine.ts';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };

/* His split, as it stands in the database. */
const CHEST_AND_BACK = {
  id: 'd1', splitId: 's1', position: 1, name: 'Chest & Back', type: 'mixed',
  muscles: ['Chest', 'Back'],
  exercises: ['Bench', 'Smith Machine Incline Bench', 'Pull Ups', 'Lat Pulldown', 'Smith Machine Bent Over Rows'],
  cardioTypes: ['Forge'],
};
const REST = { id: 'd8', splitId: 's1', position: 8, name: 'Rest', type: 'rest', muscles: [], exercises: [], cardioTypes: [] };

const exercises = [
  { id: 1, name: 'Bench', kind: 'Strength', muscles: ['Chest', 'Triceps'], detail: 'Primary', enabled: true },
  { id: 2, name: 'Smith Machine Incline Bench', kind: 'Strength', muscles: ['Chest', 'Shoulders'], detail: 'Primary', enabled: true },
  { id: 3, name: 'Pull Ups', kind: 'Strength', muscles: ['Back', 'Biceps'], detail: 'Primary', enabled: true },
  { id: 4, name: 'Lat Pulldown', kind: 'Strength', muscles: ['Back'], detail: 'Accessory', enabled: true },
  { id: 5, name: 'Smith Machine Bent Over Rows', kind: 'Strength', muscles: ['Back'], detail: 'Accessory', enabled: true },
  { id: 6, name: 'Squat', kind: 'Strength', muscles: ['Quads', 'Glutes'], detail: 'Primary', enabled: true },
];

/* Enough logged history that every mapped lift has a max to wave off. */
const day = (date, title, position, muscles, topSets) => ({
  id: `r-${date}`, date, title, splitPosition: position, muscles, effort: 'Moderate',
  topSets: topSets.map(([lift, weight, reps]) => ({ lift, weight, reps, completed: true })),
  cardioSessions: [], hasCardio: false, notes: '',
});
const records = [
  day('2026-09-06', 'Sharms 2', 7, ['Shoulders'], [['Smith Machine Shoulder Press', 215, 5]]),
  day('2026-09-03', 'Chest & Back 2', 5, ['Chest', 'Back'], [['Bench', 275, 6], ['Lat Pulldown', 190, 8], ['Pull Ups', 45, 6], ['Smith Machine Incline Bench', 225, 6], ['Smith Machine Bent Over Rows', 205, 8]]),
  day('2026-08-30', 'Chest & Back', 1, ['Chest', 'Back'], [['Bench', 270, 6], ['Lat Pulldown', 185, 8], ['Pull Ups', 40, 6], ['Smith Machine Incline Bench', 220, 6], ['Smith Machine Bent Over Rows', 200, 8]]),
];

const build = splitDay => buildDailyRecommendation({
  date: '2026-09-07', splitDay, exercises, records, goals: [],
  recovery: { confidence: 'Low' }, profile: { weeklyMileage: 20, runningDays: 3 },
  runningHistory: [], loadBiasPercent: 0,
  inputFingerprint: recommendationFingerprint({ date: '2026-09-07', splitDay, exercises, records, goals: [], loadBiasPercent: 0 }),
});

console.log('\nThe day the cycle owed');
const rest = build(REST);
check('is rest, and prescribes no lifting', rest.topSets.length === 0, rest.headline);

console.log('\nThe day he chose instead');
const chosen = build(CHEST_AND_BACK);
const selected = chosen.topSets.filter(set => set.selected);
check('comes back with top sets at all', selected.length > 0, `${selected.length} sets`);
check('covers every lift the split maps to the day', selected.length === CHEST_AND_BACK.exercises.length, selected.map(set => set.exercise).join(', '));
check('and never asks him to map an exercise it already knows',
  CHEST_AND_BACK.exercises.every(name => selected.some(set => set.exercise === name)));

console.log('\nAnd the numbers are real');
check('every set carries a weight', selected.every(set => set.weight > 0), selected.map(set => `${set.exercise} ${set.weight}`).join(' · '));
check('every set carries a rep target', selected.every(set => set.reps > 0), selected.map(set => `${set.reps}`).join('/'));
check('every set carries a calculated max', selected.every(set => set.calculatedMax > 0), selected.map(set => set.calculatedMax).join('/'));
check('and each is grounded in that lift\'s own history', selected.every(set => set.source === 'history'), [...new Set(selected.map(set => set.source))].join(','));

const bench = selected.find(set => set.exercise === 'Bench');
check('the bench prescription is near his logged work, not a guess', bench && bench.weight >= 240 && bench.weight <= 320, `${bench?.weight} x ${bench?.reps}`);

console.log(fails ? `\n${fails} check(s) failed` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
