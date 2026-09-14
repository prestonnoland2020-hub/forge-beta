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

console.log('\n  the raise proposes one plate every fifth session — and evidence decides');
/* THESE THREE CHECKS USED TO PIN THE OPPOSITE, and the opposite was a bug.
   The raise compounded on session count alone, so a lift whose calculated max
   had not moved in two months still had its working max written up by a plate
   every fifth time the athlete turned up — and the rung came out at a weight
   nobody had been near. Attendance is not strength. The raise may still
   propose; the cap below decides. */
const at = sessions => wavePrescription(200, 0, { accessory: true, sessions }).weight;
const sameRung = [0, 4, 8, 12, 16, 20];
/* Compared on ONE rung of the cycle — every fourth session is the 12 again —
   so the only thing that could move between them is the working max. */
const ceiling = Math.max(5, Math.floor((weightForReps(200, 12) + 5) / 5) * 5);
check(`every twelve is capped at what a 200 max is worth there, plus a plate (${ceiling})`,
  sameRung.every(sessions => at(sessions) === ceiling), sameRung.map(s => `${s}:${at(s)}`).join(' '));
check('so turning up twenty times does not add a pound to a max that has not moved',
  at(20) === at(0), `${at(0)} → ${at(20)}`);
/* And the raise is not dead — it is what carries the load up as soon as the
   athlete gives it something to carry. */
check('a better max raises every rung at once',
  wavePrescription(240, 0, { accessory: true, sessions: 0 }).weight > at(0),
  `${at(0)} → ${wavePrescription(240, 0, { accessory: true, sessions: 0 }).weight}`);
/* The rung is read at the exact rep count it was run at — lastAt keeps
   twelves as twelves, where the anchors clamp them to ten. */
check('and a completed set at that rung raises it too',
  wavePrescription(200, 0, { accessory: true, sessions: 0, lastAt: new Map([[12, ceiling]]) }).weight > ceiling,
  String(wavePrescription(200, 0, { accessory: true, sessions: 0, lastAt: new Map([[12, ceiling]]) }).weight));
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
/* THE LADDER STAYS A LADDER. All four rungs are written from one calculated
   max, so the twelve is lighter than the ten is lighter than the eight — the
   only rungs that break the proportion are the ones he has failed three times. */
check('the 12 sits under the 10', twelve.weight < ten.weight, `${twelve.weight} × 12 vs ${ten.weight} × 10`);
check('and the failed rungs are the only ones off the ladder',
  eight.weight === 100 && six.weight === 105, `${eight.weight} × 8, ${six.weight} × 6`);

console.log('\n  and one better set lifts the whole program');
/* This is the reason the max writes all four: a single heavy set is new
   evidence about the athlete, so every rung moves with it at once. */
const stronger = bestsFromHistory([curl(0, 150, 5), ...story]);
const after = sessions => wavePrescription(stronger.bests.get(key), 0, { accessory: true, sessions,
  anchors: stronger.anchors.get(key), misses: stronger.misses.get(key), lastAt: stronger.lastAt.get(key) });
check('the 12 goes up', after(8).weight > twelve.weight, `${twelve.weight} → ${after(8).weight}`);
check('the 10 goes up', after(9).weight > ten.weight, `${ten.weight} → ${after(9).weight}`);
check('and the rung he keeps failing does not', after(10).weight === 100, `${after(10).weight} × 8`);

console.log('\n  and one success at a rung puts that rung back on the ladder');
const recovered = bestsFromHistory([curl(0, 100, 8), ...story]);
const ladder = sessions => wavePrescription(recovered.bests.get(key), 0, { accessory: true, sessions,
  anchors: recovered.anchors.get(key), misses: recovered.misses.get(key), lastAt: recovered.lastAt.get(key) });
const unpinned = wavePrescription(recovered.bests.get(key), 0, { accessory: true, sessions: 10 });
check('the 8 is back to what the max says', ladder(10).weight === unpinned.weight, `${ladder(10).weight} × 8`);
check('and it is above the 100 he was pinned at', ladder(10).weight > 100, `${ladder(10).weight}`);
check('while the 6 is still held at its last completed 105', ladder(11).weight === 105, `${ladder(11).weight} × 6`);


console.log('\n  ATTENDANCE IS NOT STRENGTH');
/* THE BUG THIS PINS, off his live account. Preston's Smith Machine Shoulder
   Press had sat at a calculated max between 273 and 292 since July — twelve
   sessions, no trend — and the "a plate every fifth session" raise had quietly
   written the working max up to 302. The six-rep rung came out at 265 lb. His
   best six is nothing at all; his best EIGHT is 235 and his best FIVE is 245.
   A number twenty pounds over the heaviest five he has ever done, for six
   reps, is not a progression, it is a different lift.

   The back-off cannot catch it either: that fires after three failures at a
   rung, and a rung the cycle has never asked for has no failures on it yet. */
const press = [[235,8],[225,9],[230,8],[230,8],[205,10],[255,3],[230,8],[245,5],[235,7],[225,8],[225,7]];
const pressAnchors = new Map();
for (const [w, r] of press) if (w > (pressAnchors.get(r) || 0)) pressAnchors.set(r, w);
const pressMax = Math.max(...press.map(([w, r]) => calculateEstimatedOneRepMax(w, r)));
const pressRung = (sessions) => wavePrescription(pressMax, 0, { accessory: true, sessions, anchors: pressAnchors });
const sixRep = pressRung(11);
check('his calculated max is 292, off a 235 x 8', pressMax === 292, String(pressMax));
check('the six-rep rung no longer asks for 265', sixRep.weight < 265, `${sixRep.weight} × ${sixRep.reps}`);
check('it asks for a real personal best rather than a fictional one',
  calculateEstimatedOneRepMax(sixRep.weight, sixRep.reps) > pressMax
  && calculateEstimatedOneRepMax(sixRep.weight, sixRep.reps) < pressMax * 1.03,
  `${sixRep.weight} × 6 implies ${calculateEstimatedOneRepMax(sixRep.weight, sixRep.reps)} against ${pressMax}`);
check('and it is above the heaviest five he has done, not twenty pounds over it',
  sixRep.weight > 245 && sixRep.weight <= 245 + 15, `${sixRep.weight} vs 245 × 5`);
/* AND NO NUMBER OF SESSIONS BUYS ANYTHING. Turning up for another year does
   not move a max that is not moving. */
check('a hundred more sessions do not move the rung',
  pressRung(111).reps === sixRep.reps ? pressRung(111).weight === sixRep.weight : true,
  `${pressRung(111).weight} × ${pressRung(111).reps}`);
for (const sessions of [11, 15, 19, 23]) {
  const at = pressRung(sessions);
  if (at.reps !== 6) continue;
  check(`session ${sessions + 1} still asks ${sixRep.weight}`, at.weight === sixRep.weight, `${at.weight}`);
}

console.log('\n  but performance still ratchets it, which is the point');
/* Hit the 255 and it becomes evidence: the max rises and every pressRung with it.
   The cycle keeps its proportion; it just cannot run ahead of the athlete. */
const hit = Math.max(pressMax, calculateEstimatedOneRepMax(sixRep.weight, 6));
const afterHit = wavePrescription(hit, 0, { accessory: true, sessions: 11,
  anchors: new Map([...pressAnchors, [6, sixRep.weight]]), lastAt: new Map([[6, sixRep.weight]]) });
check('hitting it raises what the next six asks for', afterHit.weight > sixRep.weight,
  `${sixRep.weight} → ${afterHit.weight}`);
check('and the ladder is still a ladder underneath it',
  pressRung(12).weight < pressRung(13).weight && pressRung(13).weight < pressRung(14).weight,
  `${pressRung(12).weight} × 12, ${pressRung(13).weight} × 10, ${pressRung(14).weight} × 8`);
/* A lift with no history at all has no fact to be disciplined by, and must
   still produce a load rather than nothing. */
const fresh = wavePrescription(0, 0, { accessory: true, sessions: 0 });
check('a lift with no calculated max still gets a prescription', fresh.weight > 0, JSON.stringify(fresh));

console.log(`\n  (one plate every ${ACCESSORY_SESSIONS_PER_RAISE} sessions)`);
console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
