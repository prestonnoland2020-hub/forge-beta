/* A BARBELL LIFT IS NEVER LOADED UNDER THE EMPTY BAR. Nov 23: Barbell Row
   45 x 5 "Too easy" loaded 40 lb on the next plan day. The top-set engine now
   floors barbell lifts at 45 lb / 20 kg; dumbbell lifts are left alone. */
globalThis.localStorage = { s: {}, getItem(k) { return this.s[k] ?? null; }, setItem(k, v) { this.s[k] = v; }, removeItem(k) { delete this.s[k]; } };
globalThis.window = globalThis.window || { dispatchEvent() {}, addEventListener() {} };
const { intelligenceFor } = await import('./src/lib/dailyRecommendationEngine.ts');
const { isBarbellLift } = await import('./src/lib/trainingIntelligence.ts');
let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${detail}`}`); if (!ok) fails += 1; };
const rec = (id, date, lift, weight, reps) => ({ id, date, title: 'x', muscles: ['Back'], hasCardio: false, topSets: [{ muscle: 'Back', lift, weight, reps, completed: true }] });
const recovery = { date: '2026-11-24', readiness: 100, confidence: 'Low', sleepScore: 0, autonomicScore: 0, loadScore: 0, strengthFatigue: 'Low', reasons: [], hardTrainingAllowed: true };
const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const today = day(0);
for (const lift of ['Barbell Row', 'Bench Press']) {
  for (const w of [45, 35, 25]) {
    const out = intelligenceFor({ records: [rec('a', day(3), lift, w, 5)], recovery, lifts: [lift], goalMaxByLift: {}, date: today }).topSets[0];
    check(`${lift} from ${w} x 5 never loads under 45`, out.weight >= 45 && out.backoffWeight >= 45, `${out.weight}/${out.backoffWeight}`);
  }
}
const db = intelligenceFor({ records: [rec('a', day(3), 'Dumbbell Row', 25, 8)], recovery, lifts: ['Dumbbell Row'], goalMaxByLift: {}, date: today }).topSets[0];
check('a dumbbell row is not floored', db.weight > 0 && db.weight < 45, String(db.weight));
check('barbell detection', isBarbellLift('Barbell Row') && isBarbellLift('Back Squat') && !isBarbellLift('Inverted Row') && !isBarbellLift('Romanian Deadlift') && !isBarbellLift('Dumbbell Bench Press'));
if (fails) process.exit(1);
