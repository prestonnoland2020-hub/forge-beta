/* A LIMITATION CHANGES THE TRAINING IT NAMES.

   Only an injury with a body part Forge recognised ever changed a plan. "No
   overhead pressing", "no jumping", "avoid deadlifts" were saved and then
   read by nothing — Today and the Plan week went on prescribing exactly the
   movement the athlete had said to avoid. */
import { bodyLogState, exerciseBlocked, limitationIn, bodyLogReason } from './src/lib/bodyLog.ts';
import { localActions } from './src/lib/coachActions.ts';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };
const today = '2026-10-27';
const note = (text, kind = 'other', area) => ({ kind, note: text, area, status: 'active', bufferUntil: '2026-11-10' });
const lift = (name, muscles = ['Chest']) => ({ name, muscles });

console.log('\nWhat a limitation rules out');
let state = bodyLogState([note('No overhead pressing for two weeks')], today);
check('"no overhead pressing" holds Overhead Press', exerciseBlocked(lift('Overhead Press', ['Shoulders']), state));
check('and leaves Bench Press alone', !exerciseBlocked(lift('Bench Press'), state));
check('and running alone', !state.blocksRunning);
state = bodyLogState([note('No jumping or impact')], today);
check('"no jumping" holds Box Jumps', exerciseBlocked(lift('Box Jumps', ['Quads']), state));
check('and takes running off', state.blocksRunning);
state = bodyLogState([note('Doctor said avoid deadlifts')], today);
check('"avoid deadlifts" holds Deadlift and Romanian Deadlift', exerciseBlocked(lift('Deadlift', ['Back']), state) && exerciseBlocked(lift('Romanian Deadlift', ['Hamstrings']), state));
check('and leaves Back Squat alone', !exerciseBlocked(lift('Back Squat', ['Quads']), state));
state = bodyLogState([note("Can't run right now")], today);
check('"can\'t run" takes running off', state.blocksRunning);

console.log('\nInjuries still work, and the two combine');
state = bodyLogState([note('knee pain', 'injury', 'knee'), note('no overhead pressing')], today);
check('a knee still holds leg lifts', exerciseBlocked(lift('Back Squat', ['Quads']), state));
check('and the overhead rule stacks on top', exerciseBlocked(lift('Overhead Press', ['Shoulders']), state));
check('the card names the body part', bodyLogReason(state) === 'Knee', bodyLogReason(state));
check('a limitation with no body part names the rule', bodyLogReason(bodyLogState([note('no overhead pressing')], today)) === 'No overhead pressing');

console.log('\nOnly while it is in force');
check('a cleared note restricts nothing', !exerciseBlocked(lift('Overhead Press', ['Shoulders']), bodyLogState([{ ...note('no overhead pressing'), status: 'cleared' }], today)));
check('nor one past its end date', !exerciseBlocked(lift('Overhead Press', ['Shoulders']), bodyLogState([{ ...note('no overhead pressing'), bufferUntil: '2026-10-01' }], today)));
check('being tired is not a movement rule', bodyLogState([note('no energy, avoid heavy stuff', 'fatigue')], today).blockedMovements.length === 0);

console.log('\nThe coach hears a limitation');
const ctx = { splitDays: [], goals: [], activeNoteAreas: [], exercises: [], weeklyMileage: 0, runningDays: 0, loadBiasPercent: 0 };
check('"no jumping" in a sentence is a limitation', limitationIn('my physio says no jumping for now') === 'no jumping or impact');
check('a mention without "avoid" is not', limitationIn('I love box jumps') === null);
let a = localActions("I can't do overhead pressing for a couple of weeks", ctx);
check('it becomes a note the plan reads', a.length === 1 && a[0].type === 'log_note' && a[0].noteKind === 'other', JSON.stringify(a));
check('and the card says what changes', /Plan change: no overhead pressing/.test(a[0]?.label || ''), a[0]?.label);
check('for as long as was said', a[0]?.bufferDays === 14, String(a[0]?.bufferDays));
a = localActions('my shoulder hurts, no overhead pressing', ctx);
check('pain plus a limitation is one injury note, labelled with the change', a.length === 1 && a[0].noteKind === 'injury' && /no overhead pressing, shoulder protected/.test(a[0].label), JSON.stringify(a));

console.log('\nAs a phone types it');
check('a curly apostrophe (can’t) reads the same as a straight one', limitationIn('I can\u2019t do any jumping') === 'no jumping or impact');
check('and the coach acts on it', localActions('I can\u2019t do any jumping for two weeks', ctx).length === 1);
console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
