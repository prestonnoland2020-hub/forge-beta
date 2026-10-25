/* "I'M SICK" CHANGES THE PLAN — and only as much as it should.

   Telling the coach you are ill used to earn a sentence and, at most, a note
   the plan never read: tomorrow came back at full intensity. Now being sick
   rests every scheduled day until it clears, the first days back are lighter,
   and none of it fires on a question or on "sick of squats". */
import { parseActions, localActions, statedDays, easeRecommendation, EASE_PERCENT } from './src/lib/coachActions.ts';
import { bodyLogState, isSickNote, SICK_AREA, EASE_BACK_DAYS } from './src/lib/bodyLog.ts';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };
const ctx = { splitDays: [{ position: 1, name: 'Chest & Back' }], goals: [], activeNoteAreas: [], exercises: [], weeklyMileage: 20, runningDays: 3, loadBiasPercent: 0 };
const types = actions => actions.map(action => action.type).join(',');

console.log('\nThe coach hears it, with or without the AI');
let a = localActions("I'm sick", ctx);
check('"I\'m sick" rests today and logs being sick', types(a) === 'rest_today,log_note' && a[1].area === SICK_AREA, JSON.stringify(a));
check('for three days unless told otherwise', a[1].bufferDays === 3, JSON.stringify(a[1]));
check('and the card says what happens after', /3 easier days back/.test(a[1].label), a[1].label);
a = localActions('I have the flu, probably out all week', ctx);
check('"out all week" is seven days', a[1]?.bufferDays === 7, JSON.stringify(a));
a = localActions('caught a cold, a couple of days off please', ctx);
check('"a couple of days" is two', a[1]?.bufferDays === 2, JSON.stringify(a));
a = localActions("I've got a fever. Should I still run?", ctx);
check('a report with a question in it still acts', types(a) === 'rest_today,log_note', JSON.stringify(a));
a = localActions('should I train when I am sick?', ctx);
check('a question about being sick does not', a.length === 0, JSON.stringify(a));
a = localActions("I'm sick of squats", ctx);
check('"sick of" is not an illness', !a.some(action => action.area === SICK_AREA), JSON.stringify(a));
a = localActions('it is cold out today', ctx);
check('"cold out" is weather, not a cold', a.length === 0, JSON.stringify(a));

console.log('\nAnd hears when it is over');
const sickCtx = { ...ctx, activeNoteAreas: [SICK_AREA] };
a = localActions('feeling much better today', sickCtx);
check('"feeling better" clears being sick', types(a) === 'clear_note' && a[0].area === SICK_AREA, JSON.stringify(a));
check('and says the next days are easier', /easier days first/.test(a[0].label), a[0].label);
a = localActions('feeling much better today', ctx);
check('with nothing logged there is nothing to clear', a.length === 0, JSON.stringify(a));

console.log('\nThe server\'s actions mean the same thing');
const nulls = { dayName: null, minutes: null, noteKind: null, text: null, area: null, miles: null, days: null, percent: null, goalTitle: null, target: null, date: null, name: null, items: null };
a = parseActions([{ ...nulls, type: 'log_note', noteKind: 'illness', text: 'stomach bug', days: 4 }], ctx);
check('an illness note from the AI becomes "Sick" with its days', a[0]?.area === SICK_AREA && a[0].noteKind === 'fatigue' && a[0].bufferDays === 4, JSON.stringify(a));
a = parseActions([{ ...nulls, type: 'log_note', noteKind: 'illness', text: 'flu', days: 60 }], ctx);
check('a duration past a fortnight falls back to the default', a[0]?.bufferDays === 3, JSON.stringify(a));
a = parseActions([{ ...nulls, type: 'log_note', noteKind: 'fatigue', text: 'wiped', days: 2 }], ctx);
check('plain fatigue keeps its own label', a[0]?.area === undefined && /Lighter training for 2 days/.test(a[0].label), JSON.stringify(a));

console.log('\nHow long things last');
check('"3 days" → 3', statedDays('sick for 3 days') === 3);
check('"two weeks" → 14', statedDays('out for two weeks') === 14);
check('"a few days" → 3', statedDays('a few days') === 3);
check('nothing said → nothing assumed', statedDays('i am sick') === undefined);

console.log('\nWhat the plan does with it');
const today = '2026-10-25';
const sick = (extra = {}) => ({ kind: 'fatigue', area: SICK_AREA, status: 'active', bufferUntil: '2026-10-27', ...extra });
let state = bodyLogState([sick()], today);
check('while sick, the day is rest', state.sick && !state.easing, JSON.stringify(state));
check('and no muscle is "blocked" — the whole day is off instead', state.blockedMuscles.length === 0);
state = bodyLogState([sick({ status: 'cleared', bufferUntil: today })], today);
check('cleared today, today already eases', !state.sick && state.easing, JSON.stringify(state));
state = bodyLogState([sick({ bufferUntil: '2026-10-23' })], today);
check(`the days after the buffer ends ease (${EASE_BACK_DAYS} of them)`, !state.sick && state.easing, JSON.stringify(state));
state = bodyLogState([sick({ bufferUntil: '2026-10-20' })], today);
check('and then training is back to normal', !state.sick && !state.easing, JSON.stringify(state));
state = bodyLogState([{ kind: 'fatigue', status: 'active', bufferUntil: '2026-10-26' }], today);
check('ordinary fatigue eases without resting', !state.sick && state.easing, JSON.stringify(state));
state = bodyLogState([{ kind: 'injury', area: 'knee', status: 'active', bufferUntil: '2026-11-01' }], today);
check('an injury still holds its muscles and nothing else', !state.sick && !state.easing && state.blocksRunning, JSON.stringify(state));
check('a sick note is told apart from fatigue', isSickNote(sick()) && !isSickNote({ kind: 'fatigue' }));

console.log('\nEasing back in, in numbers');
const rec = {
  topSets: [{ id: 'a', exercise: 'Bench Press', weight: 225, reps: 5, calculatedMax: 262, rationale: 'wave' }, { id: 'b', exercise: 'Row', weight: 0, reps: 8 }],
  cardio: { id: 'c', title: 'Intervals', summary: '6 × 400 m', session: { plan: { activity: 'Run', duration: '40', distance: '4', repeats: '6', structure: 'Intervals' }, stress: 'High' } },
  explanation: '',
};
const eased = easeRecommendation(rec);
check(`loads drop ${EASE_PERCENT}% to a weight the bar holds`, eased.topSets[0].weight === 200, String(eased.topSets[0].weight));
check('in kg it rounds to 2.5', easeRecommendation({ ...rec, topSets: [{ ...rec.topSets[0], weight: 100 }] }, true).topSets[0].weight === 90);
check('an unweighted set is left alone', eased.topSets[1].weight === 0);
check('intervals become a shorter steady session', eased.cardio.session.plan.structure === 'Steady' && eased.cardio.session.plan.duration === '30' && !eased.cardio.session.plan.repeats, JSON.stringify(eased.cardio.session.plan));
check('and the summary says so', eased.cardio.summary === 'Easy · 30 min', eased.cardio.summary);

console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
