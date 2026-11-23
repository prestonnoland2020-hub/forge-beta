/* A COACHED PLAN DAY'S "NEXT TIME" IS THE NEXT PLAN DAY'S WEIGHT. The done
   screen used Guided's ten-rep logic (Lat Pulldown 40) while the next plan day
   loaded the lift from the top-set wave. planNextTimes now asks the same
   engine call the daily recommendation makes. */
globalThis.localStorage = { s: {}, getItem(k) { return this.s[k] ?? null; }, setItem(k, v) { this.s[k] = v; }, removeItem(k) { delete this.s[k]; } };
globalThis.window = globalThis.window || { dispatchEvent() {}, addEventListener() {} };
const { nextTimeWeights } = await import('./src/lib/guided/fromHistory.ts');
const { planNextTimes } = await import('./src/lib/guided/planNext.ts');
const { buildDailyRecommendation } = await import('./src/lib/dailyRecommendationEngine.ts');
let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${detail}`}`); if (!ok) fails += 1; };

const exercises = [
  { id: 1, name: 'Lat Pulldown', kind: 'Strength', muscles: ['Back', 'Biceps'], detail: 'Primary', enabled: true },
  { id: 2, name: 'Bench Press', kind: 'Strength', muscles: ['Chest', 'Triceps'], detail: 'Primary', enabled: true },
];
const splitDay = { position: 1, name: 'Upper', type: 'mixed', muscles: ['Back', 'Chest'], exercises: ['Lat Pulldown', 'Bench Press'], cardioTypes: ['Forge'] };
const set = (lift, weight, reps, muscle) => ({ muscle, lift, weight, reps, completed: true });
const rec = (id, date, sets) => ({ id, date, title: 'Upper', muscles: ['Back', 'Chest'], hasCardio: false, topSets: sets });
const before = [
  rec('a', '2026-10-27', [set('Lat Pulldown', 120, 8, 'Back'), set('Bench Press', 135, 8, 'Chest')]),
  rec('b', '2026-11-03', [set('Lat Pulldown', 125, 6, 'Back'), set('Bench Press', 140, 6, 'Chest')]),
  rec('c', '2026-11-10', [set('Lat Pulldown', 130, 6, 'Back'), set('Bench Press', 145, 6, 'Chest')]),
];
const todaySets = [set('Lat Pulldown', 40, 10, 'Back'), set('Bench Press', 145, 4, 'Chest')];
const today = rec('d', '2026-11-17', todaySets);
const all = [...before, today];
const top = todaySets.map(s => ({ moveId: `plan-${s.lift}`, name: s.lift, weight: s.weight, reps: s.reps }));

const shown = planNextTimes(top, all, [], '2026-11-17');
const next = buildDailyRecommendation({ date: '2026-11-24', splitDay, exercises, records: all, goals: [], recovery: { confidence: 'Low', readiness: 100 }, profile: { weeklyMileage: 0, runningDays: 0 }, runningHistory: [], loadBiasPercent: 0, inputFingerprint: 'x' });
for (const lift of ['Lat Pulldown', 'Bench Press']) {
  const prescribed = next.topSets.find(s => s.exercise === lift)?.weight;
  const promised = shown.find(item => item.name === lift)?.weight;
  const same = promised === prescribed || (promised === undefined && prescribed === todaySets.find(s => s.lift === lift).weight);
  check(`${lift}: done screen number = next plan day's weight`, same, `done screen ${promised}, next plan day ${prescribed}`);
}
const guidedOnly = nextTimeWeights(top, '2026-11-17', false);
check('and it is not just Guided\'s ten-rep number', JSON.stringify(guidedOnly) !== JSON.stringify(shown) || shown.length === 0, JSON.stringify(shown));
if (fails) process.exit(1);
