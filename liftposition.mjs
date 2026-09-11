/* THE PLAN IS A PRESCRIPTION, AND NOT EVERY DAY GOES TO PLAN.

   Preston's plan asked for a double. He took 320 x 6 — good work — and the
   wave wrapped from his max week back to the 8-rep week. Forge worked out where
   a lift sat by counting how many times it had been logged, so ANY set moved
   the block, and going off script cost him his place in it.

   Position is now how many times he has answered what the plan asked. */
import { liftPosition, rungFor, rungNearest, answeredThePlan, OFF_SCRIPT_BEFORE_RESEAT, REP_TOLERANCE } from './src/lib/liftProgression.ts';
import { WAVE_REPS, ACCESSORY_REPS, waveSlot, accessorySlot, bestsFromHistory } from './src/features/training/aiPlanService.ts';

let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${d ? ` — ${d}` : ''}`); if (!c) fails++; };
let clock = 0;
const on = () => { clock += 1; return `2026-06-${String(clock).padStart(2, '0')}`; };
/* A set that answered a prescription, or free training when asked is null. */
const set = (asked, reps, weight = 300, completed = true) => ({ date: on(), reps, weight, completed, prescribedReps: asked, prescribedWeight: asked ? weight : undefined });
const rung = (sets, accessory = false) => waveSlot(rungFor(liftPosition(sets, accessory)));

console.log('\n  answering the plan moves you along it');
const onPlan = [set(8, 8), set(6, 6), set(4, 4)];
check('three answered prescriptions, three rungs along', rungFor(liftPosition(onPlan, false)) === 3, String(rungFor(liftPosition(onPlan, false))));
check('so the next ask is the double', rung(onPlan).reps === 2, `${rung(onPlan).reps}`);

console.log('\n  Preston’s morning: asked for a double, took a set of six');
const offScript = [...onPlan, set(2, 6, 320)];
check('it is still the double next time', rung(offScript).reps === 2, `${rung(offScript).reps}`);
check('the block did not wrap back to the eight', rung(offScript).reps !== 8);
check('and the set is on file as off script', liftPosition(offScript, false).offScript === 1,
  String(liftPosition(offScript, false).offScript));

console.log('\n  the tolerance runs one way only');
check('asked two, did three — the set, no extra credit', rungFor(liftPosition([set(2, 3)], false)) === 1);
check('asked eight, did seven — short, so a miss', liftPosition([set(8, 7)], false).misses === 1
  && liftPosition([set(8, 7)], false).exposures === 0, JSON.stringify(liftPosition([set(8, 7)], false)));
check(`and ${REP_TOLERANCE + 1} over is a different session`, liftPosition([set(2, 2 + REP_TOLERANCE + 1)], false).offScript === 1);

console.log('\n  coming up short is a miss, not a day off script');
const short = [set(8, 8), set(6, 6), set(4, 4), set(2, 1, 400)];
check('the rung holds', rung(short).reps === 2, `${rung(short).reps}`);
check('and it is counted as a miss', liftPosition(short, false).misses === 1, String(liftPosition(short, false).misses));
check('not as off script', liftPosition(short, false).offScript === 0);

console.log('\n  three misses at what was asked back the load off');
/* Counted where the loads are built, so the back-off and the prescription
   cannot disagree about what was missed. */
const asDays = sets => sets.map((item, index) => ({ date: item.date, topSets: [{ id: `s${index}`, lift: 'Bench', weight: item.weight, reps: item.reps,
  completed: item.completed, prescribedReps: item.prescribedReps || undefined }] }));
const missed = [set(2, 2, 300), set(2, 1, 320), set(2, 1, 320), set(2, 1, 320)];
const counted = bestsFromHistory(asDays(missed)).misses.get('bench');
check('the back-off reads the reps ASKED for, not the ones managed',
  counted?.get(2) === 3, JSON.stringify([...(counted || [])]));
check('and a success at those reps clears it', 
  (bestsFromHistory(asDays([...missed, set(2, 2, 320)])).misses.get('bench')?.get(2) || 0) === 0,
  JSON.stringify([...(bestsFromHistory(asDays([...missed, set(2, 2, 320)])).misses.get('bench') || [])]));

console.log('\n  a plan the athlete is not following is a plan that is wrong');
/* Three sessions of sixes against a double is not a run of mistakes; it is
   Forge asking for the wrong thing. The rung moves to where he is. */
const keepsDoingSixes = [set(8, 8), set(6, 6), set(4, 4), set(2, 6, 320), set(2, 6, 320), set(2, 6, 320)];
const reseated = liftPosition(keepsDoingSixes, false);
check(`${OFF_SCRIPT_BEFORE_RESEAT} off-script sessions re-seat the rung`, reseated.reseated);
check('to the six he has actually been doing', WAVE_REPS[reseated.exposures % WAVE_REPS.length] === 6,
  String(WAVE_REPS[reseated.exposures % WAVE_REPS.length]));
check('and the off-script count starts over', reseated.offScript === 0);
check('two is not three', !liftPosition(keepsDoingSixes.slice(0, 5), false).reseated);

console.log('\n  free training moves nothing it should not');
/* A set logged with no plan behind it is not an answer to a prescription. It
   still counts as an exposure, so history logged before any of this existed is
   not reinterpreted underneath the athlete. */
const legacy = [set(null, 5), set(null, 5), set(null, 5)];
check('sets with no prescription still advance, as they always did', rungFor(liftPosition(legacy, false)) === 3);

console.log('\n  accessories run their own cycle on the same rules');
const accessory = [set(12, 12), set(10, 10), set(8, 12, 200)];
const position = liftPosition(accessory, true);
check('two answered, one off script', position.exposures === 2 && position.offScript === 1,
  `${position.exposures} / ${position.offScript}`);
check('so it still asks for the eight', accessorySlot(rungFor(position)).reps === 8,
  String(accessorySlot(rungFor(position)).reps));

console.log('\n  and a lift with nothing logged starts at the top');
check('no history, rung zero', rungFor(liftPosition([], false)) === 0);
check(`which is the ${WAVE_REPS[0]}`, waveSlot(0).reps === WAVE_REPS[0]);
check(`and the ${ACCESSORY_REPS[0]} for an accessory`, accessorySlot(0).reps === ACCESSORY_REPS[0]);

console.log('\n  the re-seat picks the nearest rung, and ties go to the harder one');
check('six reps is the six rung', WAVE_REPS[rungNearest(6, false)] === 6);
check('five sits on the six, not the four', WAVE_REPS[rungNearest(5, false)] === 6, String(WAVE_REPS[rungNearest(5, false)]));
check('eleven is the twelve on an accessory', ACCESSORY_REPS[rungNearest(11, true)] === 12, String(ACCESSORY_REPS[rungNearest(11, true)]));

console.log('\n  and the rule stated once, plainly');
check('meeting the ask answers it', answeredThePlan(2, 2));
check('one over still answers it', answeredThePlan(2, 3));
check('short does not', !answeredThePlan(2, 1));
check('well over does not', !answeredThePlan(2, 6));

console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
