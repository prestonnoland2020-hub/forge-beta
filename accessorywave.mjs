/* THE LIFTS NOBODY IS MEASURING.

   A goal lift climbs 8/6/4/2/1 toward a tested single, because there is a
   number it is walking to. An accessory has no such number — running it up the
   same wave spends heavy singles and doubles on a movement nothing is being
   judged by. Accessories run 12/10/8/6 off the calculated max, advanced by how
   many times the lift has actually been trained, and the load steps up one
   plate every fifth completed session, compounding. */
import { wavePrescription, ACCESSORY_REPS, ACCESSORY_SESSIONS_PER_RAISE } from './src/features/training/aiPlanService.ts';
import { buildTrainingIntelligence } from './src/lib/trainingIntelligence.ts';
import { calculateEstimatedOneRepMax, weightForReps } from './src/lib/strength.ts';

let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${d ? ` — ${d}` : ''}`); if (!c) fails++; };
const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const curl = (ago, weight, reps, completed = true) => ({ id: `c${ago}`, date: day(ago), title: 'Pull', muscles: ['Biceps'],
  topSets: [{ id: `s${ago}`, muscle: 'Biceps', lift: 'Barbell Curl', weight, reps, completed, calculatedMax: calculateEstimatedOneRepMax(weight, reps) }],
  hasCardio: false, cardioSessions: [] });
const recovery = { readiness: 100, confidence: 'Low', strengthFatigue: 'Low', hardTrainingAllowed: true };
const ask = records => buildTrainingIntelligence({ records, recovery,
  templates: [{ exercise: 'Barbell Curl', calculatedMax: 0, exposureIndex: 0 }],
  goalMaxByLift: {}, loadBiasPercent: 0 }).topSets[0];

console.log('\n  the cycle is four rungs long and it is not the wave');
check('12, 10, 8, 6', ACCESSORY_REPS.join('/') === '12/10/8/6');
const rungs = [0, 1, 2, 3, 4].map(sessions => wavePrescription(200, 0, { accessory: true, sessions }).reps);
check('and it wraps back to 12 on the fifth session', rungs.join(',') === '12,10,8,6,12', rungs.join(','));

console.log('\n  it never asks an accessory for a tested single');
const everySlot = Array.from({ length: 20 }, (_, sessions) => wavePrescription(200, sessions, { accessory: true, sessions }));
check('no 1-rep slot anywhere in twenty sessions', everySlot.every(set => set.reps > 1));
check('and none of them is flagged a max', everySlot.every(set => !set.isMax));

console.log('\n  the load steps up one plate every fifth completed session, compounding');
const at = sessions => wavePrescription(200, 0, { accessory: true, sessions }).weight;
/* Compared on ONE rung of the cycle — every fourth session is the 12 again —
   so the only thing moving between them is the working max. */
const expected = sessions => Math.max(5, Math.ceil(weightForReps(200 + Math.floor(sessions / ACCESSORY_SESSIONS_PER_RAISE) * 5, 12) / 5) * 5);
const rung = [0, 4, 8, 12, 16, 20];
const wrong = rung.filter(sessions => at(sessions) !== expected(sessions));
check('every twelve is written off 200 plus a plate per five sessions', wrong.length === 0,
  rung.map(s => `${s}:${at(s)}`).join(' '));
check('the fifth session is the first raise', at(4) === expected(4) && at(8) > at(4), `${at(4)} → ${at(8)}`);
check('and the raises stack rather than repeating', at(20) === expected(20) && at(20) > at(8), `${at(8)} → ${at(20)}`);
check('the climb never goes backwards', rung.every((s, i) => i === 0 || at(s) >= at(rung[i - 1])), rung.map(at).join(' → '));

console.log('\n  a 12-rep prescription is lighter than a 10-rep one');
check('twelves sit under tens', wavePrescription(200, 0, { accessory: true, sessions: 0 }).weight
  < wavePrescription(200, 0, { accessory: true, sessions: 1 }).weight,
  `${wavePrescription(200, 0, { accessory: true, sessions: 0 }).weight} vs ${wavePrescription(200, 0, { accessory: true, sessions: 1 }).weight}`);

console.log('\n  and the logger agrees with it end to end');
const logged = ask([curl(2, 95, 8), curl(9, 95, 10), curl(16, 90, 12)]);
check('it takes an accessory rung', ACCESSORY_REPS.includes(logged.reps), `${logged.weight} × ${logged.reps}`);
check('and says which cycle it is running', /accessory cycle/.test(logged.rationale), logged.rationale.slice(0, 70));

console.log('\n  three failed attempts send it back to what was completed');
const beaten = ask([curl(2, 105, 8, false), curl(5, 105, 8, false), curl(9, 105, 8, false),
  curl(16, 95, 8), curl(23, 95, 10), curl(30, 90, 12), curl(37, 90, 10), curl(44, 90, 8)]);
check('it is not still asking for more than the 95 he completed', beaten.weight <= 100, `${beaten.weight} × ${beaten.reps}`);

console.log(`\n  (one plate every ${ACCESSORY_SESSIONS_PER_RAISE} sessions)`);
console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
