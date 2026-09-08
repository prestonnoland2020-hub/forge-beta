/* THE LOGGER AND THE PLAN TAB HAVE TO AGREE.

   Adam's squat history is four sets: 235x3, 245x3, 225x10, 255x2. The 10-rep
   set estimates a 300 lb max — the highest number in his history and the least
   reliable one, because a ten-rep set is the furthest a formula has to travel.
   The logger took that estimate, divided it back down the curve, and opened on
   295 x 2: forty pounds past anything he has ever done, on the morning the
   Plan tab was saying 260.

   Both screens write from the same evidence now — his own sets, by rep count. */
import { buildTrainingIntelligence } from './src/lib/trainingIntelligence.ts';
import { bestsFromHistory, wavePrescription } from './src/features/training/aiPlanService.ts';
import { calculateEstimatedOneRepMax } from './src/lib/strength.ts';

let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${d ? ` — ${d}` : ''}`); if (!c) fails++; };
const mk = (date, lift, weight, reps) => ({ id: date + lift, date, title: 'Legs', muscles: ['Quads'],
  topSets: [{ id: date + lift + 't', muscle: 'Quads', lift, weight, reps, completed: true, calculatedMax: calculateEstimatedOneRepMax(weight, reps) }],
  lift, weight, reps, calculatedMax: calculateEstimatedOneRepMax(weight, reps), hasCardio: false, cardioSessions: [] });
const ADAM = [mk('2026-09-02', 'Squat', 255, 2), mk('2026-08-18', 'Squat', 225, 10), mk('2026-08-10', 'Squat', 245, 3), mk('2026-07-30', 'Squat', 235, 3)];
const recovery = { readiness: 100, confidence: 'Low', strengthFatigue: 'Low', hardTrainingAllowed: true };
const logger = exposures => buildTrainingIntelligence({ records: ADAM, recovery,
  templates: [{ exercise: 'Squat', calculatedMax: 0, exposureIndex: exposures }],
  goalMaxByLift: { squat: 315 }, loadBiasPercent: 0 }).topSets[0];

console.log('\n  the ten-rep set is still the highest estimate in his history');
const { bests, anchors } = bestsFromHistory(ADAM);
check('225 x 10 estimates 300', calculateEstimatedOneRepMax(225, 10) === 300);
check('his double estimates 262', calculateEstimatedOneRepMax(255, 2) === 262);
check('and 300 is what a single number would call his max', bests.get('squat') === 300, String(bests.get('squat')));

console.log('\n  the logger no longer divides that estimate back down');
const set = logger(3);
check('it asks for one step over his best double, not forty pounds over it',
  set.weight === 260 && set.reps === 2, `${set.weight} x ${set.reps}`);
check('and it names the set that decided it', /Your best set of 2 is 255 lb/.test(set.rationale), set.rationale.slice(0, 90));
check('not the ten-rep set', !/225 lb ×10/.test(set.rationale));

console.log('\n  max week without a goal holds the double, at the same load');
const maxWeek = logger(4);
check('still 260 x 2', maxWeek.weight === 260 && maxWeek.reps === 2, `${maxWeek.weight} x ${maxWeek.reps}`);

console.log('\n  and the two screens agree');
const plan = wavePrescription(bests.get('squat'), 3, false, 0, false, anchors.get('squat'));
check('the Plan tab writes the same bar as the logger',
  plan.weight === set.weight && plan.reps === set.reps, `plan ${plan.weight} x ${plan.reps} vs logger ${set.weight} x ${set.reps}`);

console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
