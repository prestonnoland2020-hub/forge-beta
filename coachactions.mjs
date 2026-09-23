/* THE COACH ACTS — and only within what the athlete has. */
import { parseActions, localActions, overrideFromActions, shortenRecommendation } from './src/lib/coachActions.ts';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };

const ctx = {
  splitDays: [{ position: 1, name: 'Chest & Back' }, { position: 2, name: 'Lower Body' }, { position: 3, name: 'Quality Cardio' }, { position: 4, name: 'Recovery', type: 'Rest' }],
  goals: [{ title: '315 lb Squat' }, { title: '5K Run · 22:00' }],
  activeNoteAreas: ['knee'],
  exercises: ['Back Squat', 'Bench Press'],
  weeklyMileage: 20, runningDays: 3, loadBiasPercent: 0,
};
const nulls = { dayName: null, minutes: null, noteKind: null, text: null, area: null, miles: null, days: null, percent: null, goalTitle: null, target: null, date: null, name: null, items: null };

console.log('\nValidation against the athlete\'s own plan');
let a = parseActions([{ ...nulls, type: 'swap_today', dayName: 'lower body' }], ctx);
check('a split day is matched by name, case-insensitively, and carries its position', a.length === 1 && a[0].position === 2 && a[0].label === 'Today → Lower Body', JSON.stringify(a));
a = parseActions([{ ...nulls, type: 'swap_today', dayName: 'Arms' }], ctx);
check('a day the athlete does not have is dropped, not guessed', a.length === 0);
a = parseActions([{ ...nulls, type: 'update_goal', goalTitle: 'squat', target: '335' }], ctx);
check('a goal is matched loosely and the label says what changes', a.length === 1 && a[0].goalTitle === '315 lb Squat' && /target 335/.test(a[0].label), JSON.stringify(a));
a = parseActions([{ ...nulls, type: 'update_goal', goalTitle: 'Deadlift', target: '500' }], ctx);
check('a goal that does not exist is dropped', a.length === 0);
a = parseActions([{ ...nulls, type: 'set_weekly_mileage', miles: 20 }], ctx);
check('a no-op change (same mileage) is dropped', a.length === 0);
a = parseActions([{ ...nulls, type: 'set_weekly_mileage', miles: 900 }], ctx);
check('mileage is clamped to something human', a[0].miles === 150);
a = parseActions([{ ...nulls, type: 'shorten_today', minutes: 5 }], ctx);
check('under ten minutes is not a workout', a.length === 0);
a = parseActions([{ ...nulls, type: 'rest_today' }, { ...nulls, type: 'swap_today', dayName: 'Chest & Back' }, { ...nulls, type: 'shorten_today', minutes: 30 }], ctx);
check('rest and swap contradict — the first wins, shorten stays', a.map(x => x.type).join(',') === 'rest_today,shorten_today', a.map(x => x.type).join(','));
a = parseActions([{ ...nulls, type: 'log_note', noteKind: 'injury', text: 'left knee is sore on the stairs', area: 'knee' }], ctx);
check('an injury note carries its area and says Forge trains around it', a.length === 1 && a[0].area === 'knee' && /train around it/.test(a[0].label));
a = parseActions([{ ...nulls, type: 'clear_note', area: 'Knee' }], ctx);
check('clearing a logged area matches the active note', a.length === 1 && a[0].area === 'knee');
a = parseActions([{ ...nulls, type: 'clear_note', area: 'shoulder' }], ctx);
check('clearing an area not in the log is dropped', a.length === 0);
a = parseActions([{ ...nulls, type: 'create_exercise', name: 'Belt Squat', items: ['quads', 'Glutes', 'wings'] }], ctx);
check('a new exercise keeps only known muscles', a.length === 1 && a[0].muscles.join(',') === 'Quads,Glutes');
a = parseActions([{ ...nulls, type: 'create_exercise', name: 'Bench Press', items: ['Chest'] }], ctx);
check('an exercise already in the library is not re-added', a.length === 0);
a = parseActions([{ ...nulls, type: 'delete_everything' }, 'junk', null], ctx);
check('unknown types and junk are ignored', a.length === 0);
a = parseActions('not an array', ctx);
check('a non-array is an empty list', a.length === 0);

console.log('\nToday override');
let o = overrideFromActions(parseActions([{ ...nulls, type: 'rest_today' }], ctx), '2026-09-22', null);
check('rest_today writes a dated rest override with a note', o?.rest === true && o.date === '2026-09-22' && /Rest day/.test(o.note));
o = overrideFromActions(parseActions([{ ...nulls, type: 'swap_today', dayName: 'Quality Cardio' }, { ...nulls, type: 'shorten_today', minutes: 40 }], ctx), '2026-09-22', o);
check('a later swap replaces the rest and keeps the minutes', o?.rest === false && o.position === 3 && o.minutes === 40 && /Quality Cardio today/.test(o.note) && /40 minutes/.test(o.note), JSON.stringify(o));
o = overrideFromActions(parseActions([{ ...nulls, type: 'set_weekly_mileage', miles: 25 }], ctx), '2026-09-22', o);
check('a non-today action leaves the override untouched', o?.position === 3 && o.minutes === 40);
o = overrideFromActions(parseActions([{ ...nulls, type: 'set_weekly_mileage', miles: 25 }], ctx), '2026-09-23', o);
check('and yesterday\'s override is not carried into today', o === null);

console.log('\nShortening a day');
const rec = { date: '2026-09-22', status: 'active', algorithmVersion: 'x', inputFingerprint: 'x', splitDay: { position: 2, name: 'Lower Body', type: 'strength', muscles: [], exercises: [], cardioTypes: [] }, headline: 'x', explanation: 'Lower Body.', evidence: { activeDays7: 0, historyCount: 0, goalNames: [] },
  topSets: [{ id: 'a', exercise: 'Back Squat' }, { id: 'b', exercise: 'Romanian Deadlift' }, { id: 'c', exercise: 'Leg Press' }],
  cardio: { id: 'c1', title: 'Easy run', summary: 'Easy run · 4 mi', rationale: '', selected: true, session: { plan: { distance: '4', duration: '36' } } } };
let s = shortenRecommendation(rec, 30);
check('thirty minutes keeps the first top set and a short run', s.topSets.length === 1 && s.topSets[0].exercise === 'Back Squat' && s.cardio.session.plan.duration === '18', `${s.topSets.length} sets, cardio ${s.cardio.session.plan.duration}`);
check('the run distance scales with the minutes', s.cardio.session.plan.distance === '2', s.cardio.session.plan.distance);
check('the explanation says what was dropped', /Trimmed to 30 minutes — 2 top sets dropped/.test(s.explanation), s.explanation);
s = shortenRecommendation(rec, 90);
check('ninety minutes changes nothing', s.topSets.length === 3 && s.cardio.session.plan.duration === '36');
s = shortenRecommendation({ ...rec, cardio: undefined }, 25);
check('with no cardio, twenty-five minutes is two top sets', s.topSets.length === 2, s.topSets.length);

console.log('\nOffline stand-in');
a = localActions('my knee hurts after yesterday', ctx);
check('pain is logged with its area', a.length === 1 && a[0].type === 'log_note' && a[0].area === 'knee', JSON.stringify(a));
a = localActions('knee is fine now', ctx);
check('"fine now" clears the logged knee', a.length === 1 && a[0].type === 'clear_note');
a = localActions('I only have 30 minutes today', ctx);
check('"only have 30 minutes" trims today', a.length === 1 && a[0].type === 'shorten_today' && a[0].minutes === 30);
a = localActions('should I run today?', ctx);
check('a question proposes nothing', a.length === 0);
a = localActions('I need a rest day', ctx);
check('"rest day" rests', a.length === 1 && a[0].type === 'rest_today');

console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
