/* WHAT HAPPENS WHEN THE BAR WINS.

   Forge asks for one plate step over what you have done. The question that
   matters is what it asks for NEXT when you do not get it — a program that
   keeps adding five pounds to a set you already missed walks away from the
   athlete in a month. */
import { buildTrainingIntelligence } from './src/lib/trainingIntelligence.ts';
import { calculateEstimatedOneRepMax } from './src/lib/strength.ts';

let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${d ? ` — ${d}` : ''}`); if (!c) fails++; };
const mk = (date, weight, reps) => ({ id: date, date, title: 'Legs', muscles: ['Quads'],
  topSets: [{ id: date + 't', muscle: 'Quads', lift: 'Squat', weight, reps, completed: true, calculatedMax: calculateEstimatedOneRepMax(weight, reps) }],
  lift: 'Squat', weight, reps, calculatedMax: calculateEstimatedOneRepMax(weight, reps), hasCardio: false, cardioSessions: [] });
const recovery = { readiness: 100, confidence: 'Low', strengthFatigue: 'Low', hardTrainingAllowed: true };
const ask = (records, exposures = 3) => buildTrainingIntelligence({ records, recovery,
  templates: [{ exercise: 'Squat', calculatedMax: 0, exposureIndex: exposures }],
  goalMaxByLift: {}, loadBiasPercent: 0 }).topSets[0];

const BASE = [mk('2026-09-02', 255, 2), mk('2026-08-18', 225, 10), mk('2026-08-10', 245, 3), mk('2026-07-30', 235, 3)];

console.log('\n  it asks for one step over the double he did');
const first = ask(BASE);
check('260 x 2', first.weight === 260 && first.reps === 2, `${first.weight} x ${first.reps}`);

console.log('\n  he takes 260 and gets one rep, not two');
const missed = ask([mk('2026-09-09', 260, 1), ...BASE]);
check('it asks for 260 again rather than 265', missed.weight === 260 && missed.reps === 2, `${missed.weight} x ${missed.reps}`);

console.log('\n  he bails and logs a lighter double instead');
const backedOff = ask([mk('2026-09-09', 245, 2), ...BASE]);
check('his best double still stands, so it still asks 260', backedOff.weight === 260, `${backedOff.weight} x ${backedOff.reps}`);

console.log('\n  he logs nothing at all that day');
const skipped = ask(BASE);
check('the same bar is waiting next time', skipped.weight === 260, `${skipped.weight}`);

console.log('\n  he gets it');
const hit = ask([mk('2026-09-09', 260, 2), ...BASE]);
check('the floor rises with him — 265', hit.weight === 265 && hit.reps === 2, `${hit.weight} x ${hit.reps}`);

console.log('\n  and again');
const again = ask([mk('2026-09-16', 265, 2), mk('2026-09-09', 260, 2), ...BASE]);
check('270', again.weight === 270, `${again.weight}`);

console.log('\n  three misses in a row never compound');
const thrice = ask([mk('2026-09-23', 260, 1), mk('2026-09-16', 260, 1), mk('2026-09-09', 260, 1), ...BASE]);
check('still 260', thrice.weight === 260, `${thrice.weight}`);

console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
