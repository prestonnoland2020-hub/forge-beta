/* THE COACH'S NEW HANDS, AND ONE SET OF GOAL NUMBERS.
   create_goal / delete_goal / swap_exercise / start_guided are validated
   against what the athlete has, and the goal facts the coach is given are the
   ones the Goals screen draws. */
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
import { parseActions, whereItGoes } from './src/lib/coachActions.ts';
import { goalCards, goalCardFacts } from './src/lib/goalCards.ts';
import { goalFeasibility } from './src/lib/goalFeasibility.ts';
import { goalProgress } from './src/lib/goalProgress.ts';
import { localDayIso } from './src/lib/time.ts';
let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${detail}`}`); if (!ok) fails += 1; };
const ahead = days => { const d = new Date(); d.setDate(d.getDate() + days); return localDayIso(d); };
const blank = { dayName: null, minutes: null, noteKind: null, text: null, area: null, miles: null, days: null, percent: null, goalTitle: null, target: null, date: null, name: null, items: null, stations: null, rounds: null, format: null, roundRest: null };
const ctx = { splitDays: [{ position: 1, name: 'Chest / Back' }], goals: [{ title: '405 lb Bench Press', type: 'Strength', exercise: 'Bench Press' }], todayLifts: ['Bench Press', 'Lat Pulldown'],
  activeNoteAreas: [], exercises: ['Bench Press', 'Dumbbell Bench Press', 'Lat Pulldown', 'Back Squat'], weeklyMileage: 10, runningDays: 3, loadBiasPercent: 0 };
const one = raw => parseActions([{ ...blank, ...raw }], ctx)[0];

console.log('\ncreate_goal');
const lift = one({ type: 'create_goal', name: 'back squat', target: '405', date: ahead(90) });
check('a lift goal on a library lift', lift?.goal.type === 'Strength' && lift.goal.exercise === 'Back Squat' && lift.goal.target === '405', JSON.stringify(lift));
const race = one({ type: 'create_goal', name: '5K', target: '21:30', date: ahead(60) });
check('a race goal with a clock', race?.goal.exercise === '5K Run' && race.goal.unit === 'mm:ss', JSON.stringify(race));
const half = one({ type: 'create_goal', name: 'Half Marathon', target: '1:45:00', date: ahead(120) });
check('a long race in hours', half?.goal.unit === 'hh:mm:ss', JSON.stringify(half));
const body = one({ type: 'create_goal', name: 'Body weight', target: '185 lb', date: ahead(84) });
check('a body-weight goal', body?.goal.type === 'Body Composition' && body.goal.target === '185', JSON.stringify(body));
check('a lift not in the library is dropped', !one({ type: 'create_goal', name: 'Zercher Squat', target: '300', date: ahead(60) }));
check('a date in the past is dropped', !one({ type: 'create_goal', name: 'Back Squat', target: '405', date: '2020-01-01' }));
check('a race without a time is dropped', !one({ type: 'create_goal', name: '5K', target: 'fast', date: ahead(60) }));
check('lands on Goals', whereItGoes(lift).to === '/goals');

console.log('\ndelete_goal, swap_exercise, start_guided');
check('delete names a real goal', one({ type: 'delete_goal', goalTitle: '405 lb bench press' })?.goalTitle === '405 lb Bench Press');
check('delete of a goal that is not there is dropped', !one({ type: 'delete_goal', goalTitle: '600 lb Deadlift' }));
const swap = one({ type: 'swap_exercise', name: 'Bench Press', target: 'Dumbbell Bench Press' });
check('swap one of today’s lifts for a library lift', swap?.from === 'Bench Press' && swap.to === 'Dumbbell Bench Press', JSON.stringify(swap));
check('swap of a lift not on today is dropped', !one({ type: 'swap_exercise', name: 'Back Squat', target: 'Leg Press' }));
const guided = one({ type: 'start_guided', name: 'Upper body', minutes: 35 });
check('guided picks a real focus and a real length', guided?.focus === 'Upper body' && [30, 45].includes(guided.minutes), JSON.stringify(guided));
check('and opens the session', /\/guided\?go=1&min=\d+&focus=Upper%20body/.test(whereItGoes(guided).to), whereItGoes(guided).to);

console.log('\nOne set of goal numbers');
const iso = ago => { const d = new Date(); d.setDate(d.getDate() - ago); return localDayIso(d); };
const records = [[70, 225, 5], [56, 230, 5], [42, 235, 5], [28, 240, 5], [14, 245, 5]].map(([ago, weight, reps], i) => ({ id: `r${i}`, date: iso(ago), title: 'Push', muscles: ['Chest'], hasCardio: false, topSets: [{ lift: 'Bench Press', muscle: 'Chest', weight, reps, completed: true }] }));
records.push({ id: 'single', date: iso(100), title: 'Push', muscles: ['Chest'], hasCardio: false, topSets: [{ lift: 'Bench Press', muscle: 'Chest', weight: 255, reps: 1, completed: true }] });
const goal = { type: 'Strength', title: '300 lb Bench Press', target: '300 lb', date: ahead(120), exercise: 'Bench Press', metric: 'Real 1RM', unit: 'lb', connection: '' };
for (const mode of ['calculated', 'tested']) {
  const cards = goalCards([goal], records, null, [], mode);
  const direct = goalProgress(goal, records, goalFeasibility([goal], records, { maxWeeklyMileage: 0, excludedEfforts: [], workoutEfforts: [] })[0], null, mode, null);
  check(`${mode}: the card is what goalProgress says`, cards[0].progress.currentText === direct.currentText && cards[0].progress.label === direct.label, `${cards[0].progress.currentText} vs ${direct.currentText}`);
  const facts = goalCardFacts(cards, mode)[0];
  check(`${mode}: the coach is told the same number`, facts.shownOnCard.startsWith(direct.currentText), facts.shownOnCard);
  check(`${mode}: and which max it is`, facts.shownOnCard.includes(mode === 'tested' ? 'tested' : 'calculated'), facts.shownOnCard);
}
const testedFacts = goalCardFacts(goalCards([{ ...goal, target: '265 lb', title: '265 lb Bench Press' }], records, null, [], 'tested'), 'tested')[0];
check('a goal the sets already reach, tested short, is ready to test', Boolean(testedFacts.readyToTest), JSON.stringify(testedFacts));
check('and its status says so, the same as the card', testedFacts.status === 'Ready to test', testedFacts.status);

console.log('\nLogging from the chat');
const today = new Date(); const dayIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const set = one({ type: 'log_top_set', name: 'bench', target: '225x5' });
check('"bench 225x5" is a Bench Press top set today', set?.exercise === 'Bench Press' && set.weight === 225 && set.reps === 5 && set.date === dayIso(today), JSON.stringify(set));
check('"225 for 5" reads the same', one({ type: 'log_top_set', name: 'Bench Press', target: '225 for 5' })?.reps === 5);
check('a lift not in the library is dropped', !one({ type: 'log_top_set', name: 'Zercher Squat', target: '225x5' }));
const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
check('a set in the future is dropped', !one({ type: 'log_top_set', name: 'Bench Press', target: '225x5', date: dayIso(tomorrow) }));
const old = new Date(today); old.setDate(old.getDate() - 30);
check('a set from a month ago is dropped', !one({ type: 'log_top_set', name: 'Bench Press', target: '225x5', date: dayIso(old) }));
const two = parseActions([{ ...blank, type: 'log_top_set', name: 'Bench Press', target: '225x5' }, { ...blank, type: 'log_top_set', name: 'Lat Pulldown', target: '180x8' }], ctx);
check('two sets in one message are two actions', two.length === 2, JSON.stringify(two.map(a => a.label)));
const run = one({ type: 'log_run', miles: 3.1, minutes: 27 });
check('a 3.1 mi run in 27 min logs today', run?.miles === 3.1 && run.minutes === 27 && run.date === dayIso(today), JSON.stringify(run));
check('a run at 2 min a mile is a typo, dropped', !one({ type: 'log_run', miles: 10, minutes: 20 }));

if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall passed');
