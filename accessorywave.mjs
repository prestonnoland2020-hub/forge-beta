/* THE LIFTS NOBODY IS MEASURING.

   A goal lift climbs 8/6/4/2/1 toward a tested single, because there is a
   number it is walking to. An accessory has no such number — running it up the
   same wave spends heavy singles and doubles on a movement nothing is being
   judged by. Accessories run 12/10/8/6 off the calculated max, advanced by how
   many times the lift has actually been trained, and the load steps up one
   plate every fifth completed session, compounding. */
import { wavePrescription, bestsFromHistory, ACCESSORY_REPS, ACCESSORY_SESSIONS_PER_RAISE } from './src/features/training/aiPlanService.ts';
import { buildTrainingIntelligence } from './src/lib/trainingIntelligence.ts';
import { calculateEstimatedOneRepMax, weightForReps } from './src/lib/strength.ts';

let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${d ? ` — ${d}` : ''}`); if (!c) fails++; };
const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const curl = (ago, weight, reps, completed = true) => ({ id: `c${ago}-${weight}-${reps}`, date: day(ago), title: 'Pull', muscles: ['Biceps'],
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
const sameRung = [0, 4, 8, 12, 16, 20];
const wrong = sameRung.filter(sessions => at(sessions) !== expected(sessions));
check('every twelve is written off 200 plus a plate per five sessions', wrong.length === 0,
  sameRung.map(s => `${s}:${at(s)}`).join(' '));
check('the fifth session is the first raise', at(4) === expected(4) && at(8) > at(4), `${at(4)} → ${at(8)}`);
check('and the raises stack rather than repeating', at(20) === expected(20) && at(20) > at(8), `${at(8)} → ${at(20)}`);
check('the climb never goes backwards', sameRung.every((s, i) => i === 0 || at(s) >= at(sameRung[i - 1])), sameRung.map(at).join(' → '));

console.log('\n  a 12-rep prescription is lighter than a 10-rep one');
check('twelves sit under tens', wavePrescription(200, 0, { accessory: true, sessions: 0 }).weight
  < wavePrescription(200, 0, { accessory: true, sessions: 1 }).weight,
  `${wavePrescription(200, 0, { accessory: true, sessions: 0 }).weight} vs ${wavePrescription(200, 0, { accessory: true, sessions: 1 }).weight}`);

console.log('\n  and the logger agrees with it end to end');
const logged = ask([curl(2, 95, 8), curl(9, 95, 10), curl(16, 90, 12)]);
check('it takes an accessory rung', ACCESSORY_REPS.includes(logged.reps), `${logged.weight} × ${logged.reps}`);
check('and says which cycle it is running', /accessory cycle/.test(logged.rationale), logged.rationale.slice(0, 70));

console.log('\n  each rung answers for itself');
/* Preston's case, exactly: he holds the 12 and the 10 and cannot hold the 8 or
   the 6. Three passes later the 12 and the 10 should still be climbing and the
   8 and the 6 should be back at the last loads he actually completed. */
const pass = (weekAgo, twelve, ten, eight, six, held) => [
  curl(weekAgo * 7 + 0, twelve, 12), curl(weekAgo * 7 + 1, ten, 10),
  curl(weekAgo * 7 + 2, eight, 8, held), curl(weekAgo * 7 + 3, six, 6, held)];
const story = [
  ...pass(4, 90, 95, 100, 105, true),    /* everything held */
  ...pass(3, 95, 100, 105, 110, false),  /* the 8 and the 6 beat him */
  ...pass(2, 95, 100, 105, 110, false),
  ...pass(1, 100, 105, 105, 110, false),
];
const history = bestsFromHistory(story);
const key = 'barbell curl';
const rung = sessions => wavePrescription(history.bests.get(key), 0, { accessory: true, sessions,
  anchors: history.anchors.get(key), misses: history.misses.get(key), lastAt: history.lastAt.get(key) });
/* Sessions 8–11 are one full pass: 12, 10, 8, 6. */
const [twelve, ten, eight, six] = [8, 9, 10, 11].map(rung);
check('the rungs come round in order', [twelve, ten, eight, six].map(r => r.reps).join(',') === '12,10,8,6',
  [twelve, ten, eight, six].map(r => r.reps).join(','));
check('three misses at the 8 send it back to the 100 he completed', eight.weight === 100, `${eight.weight} × 8`);
check('and three at the 6 back to the 105 he completed', six.weight === 105, `${six.weight} × 6`);
/* The rungs he is holding ask one plate over the loads he last completed there
   — 100 x 12 and 105 x 10 — while the 8 and the 6 sit still. */
check('the 12 moves on from the 100 he completed', twelve.weight === 105, `${twelve.weight} × 12`);
check('and the 10 from the 105 he completed', ten.weight === 110, `${ten.weight} × 10`);
const kept = bestsFromHistory([curl(0, 105, 12), ...story]);
const nextTwelve = wavePrescription(kept.bests.get(key), 0, { accessory: true, sessions: 8,
  anchors: kept.anchors.get(key), misses: kept.misses.get(key), lastAt: kept.lastAt.get(key) });
check('and it moves again once he actually takes it', nextTwelve.weight === 110, `${nextTwelve.weight} × 12`);

console.log('\n  and one success at a rung clears that rung alone');
const recovered = bestsFromHistory([curl(0, 100, 8), ...story]);
const clearedEight = wavePrescription(recovered.bests.get(key), 0, { accessory: true, sessions: 10,
  anchors: recovered.anchors.get(key), misses: recovered.misses.get(key), lastAt: recovered.lastAt.get(key) });
/* One plate over the 100 he just completed — not a leap to wherever the
   working max drifted to while the rung was held down. */
check('the 8 asks one plate over the 100 he just completed', clearedEight.weight === 105, `${clearedEight.weight} × 8`);
const stillSix = wavePrescription(recovered.bests.get(key), 0, { accessory: true, sessions: 11,
  anchors: recovered.anchors.get(key), misses: recovered.misses.get(key), lastAt: recovered.lastAt.get(key) });
check('while the 6 is still held at its last completed 105', stillSix.weight === 105, `${stillSix.weight} × 6`);

console.log(`\n  (one plate every ${ACCESSORY_SESSIONS_PER_RAISE} sessions)`);
console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
