/* COACH-SUGGESTED GOALS: quick win, attainable, stretch — from the same model
   that judges the goal on its card, for lifts, races and body weight. */
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
import { goalFeasibility } from './src/lib/goalFeasibility.ts';
import { goalProgress } from './src/lib/goalProgress.ts';
import { predictionFromNow } from './src/lib/predictionFromNow.ts';
import { suggestGoals, quickWinFor } from './src/lib/goalSuggestions.ts';
let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${detail}`}`); if (!ok) fails += 1; };
const iso = days => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
const judgeFor = (records, mode = 'calculated', setup = null) => goal => {
  const v = goalFeasibility([goal], records)[0]; const model = v?.prediction;
  const now = goalProgress(goal, records, v, setup, mode, null).current ?? model?.start ?? null;
  return { now, model, p: model ? predictionFromNow(model, now) : undefined };
};
const lift = (rows, name = 'Bench Press') => rows.map(([ago, weight, reps]) => ({ date: iso(-ago), topSets: [{ lift: name, weight, reps, completed: true }] }));
const weeks = 20; const rising = lift(Array.from({ length: weeks }, (_, i) => [(weeks - i) * 7, 225 + i * 2.5, 5]));
const tiers = list => list.map(item => item.tier).join(',');
const num = item => Number(item.targetText);

console.log('\nStrength, steady climber');
const s = suggestGoals({ type: 'Strength', exercise: 'Bench Press', unit: 'lb' }, judgeFor(rising));
check('three goals: quick, attainable, stretch', tiers(s) === 'quick,attainable,stretch', tiers(s));
check('each bigger and later than the last', s.every((item, i) => !i || (num(item) > num(s[i - 1]) && item.date >= s[i - 1].date)), JSON.stringify(s.map(i => [i.targetText, i.date])));
check('targets land on plates', s.every(item => num(item) % 5 === 0), s.map(i => i.targetText).join());
check('quick win within ten weeks', s[0] && (Date.parse(s[0].date) - Date.now()) / 864e5 <= 71);
check('quick and attainable read Realistic on the card', s[0]?.verdict === 'Realistic' && s[1]?.verdict === 'Realistic', s.map(i => i.verdict).join());
check('stretch reads Ambitious', s[2]?.verdict === 'Ambitious');
check('the card agrees once saved', (() => { const j = judgeFor(rising)(s[1].goal); return j.p && j.p.typical >= j.p.target; })());
check('every one says how to get there', s.every(item => /a week/.test(item.how)), s.map(i => i.how).join(' / '));

console.log('\nStrength, sets say more than the last test');
const tested = [...lift([[60, 300, 1]]), ...lift([[21, 295, 5], [14, 300, 5], [7, 305, 5]])];
const t = suggestGoals({ type: 'Strength', exercise: 'Bench Press', unit: 'lb' }, judgeFor(tested, 'tested'));
check('quick win is: test it', t[0]?.verdict === 'Test it' && num(t[0]) > 300, JSON.stringify(t[0]));

console.log('\nStrength, nothing logged');
check('nothing to go on: no suggestions', suggestGoals({ type: 'Strength', exercise: 'Deadlift', unit: 'lb' }, judgeFor([])).length === 0);
const typed = suggestGoals({ type: 'Strength', exercise: 'Deadlift', unit: 'lb', current: '315' }, judgeFor([]));
check('a typed current best is enough', typed.length >= 2 && num(typed[0]) > 315, tiers(typed));

console.log('\nRace, typed current time');
const run = suggestGoals({ type: 'Endurance', exercise: '5K Run', unit: 'mm:ss', metric: 'Finish time', current: '25:00' }, judgeFor([]));
check('three faster times', tiers(run) === 'quick,attainable,stretch', tiers(run));
const sec = text => text.split(':').reduce((a, b) => a * 60 + Number(b), 0);
check('each faster than the last', run.every((item, i) => sec(item.targetText) < (i ? sec(run[i - 1].targetText) : 1500)), run.map(i => i.targetText).join());
check('mileage named', run.every(item => /miles a week/.test(item.how)));
const marathon = suggestGoals({ type: 'Endurance', exercise: 'Marathon', unit: 'hh:mm:ss', metric: 'Finish time', current: '3:40:00' }, judgeFor([]));
check('marathon in hours', marathon.length > 0 && marathon.every(item => /^\d:\d\d:\d\d$/.test(item.targetText)), marathon.map(i => i.targetText).join());

console.log('\nBody weight');
const lose = suggestGoals({ type: 'Body Composition', unit: 'lb', current: '200', direction: 'lose' }, judgeFor([]));
check('lose: three lower weights', tiers(lose) === 'quick,attainable,stretch' && lose.every(item => num(item) < 200), lose.map(i => i.targetText).join());
check('no faster than 1% a week', lose.every(item => (200 - num(item)) / ((Date.parse(item.date) - Date.now()) / 6048e5) <= 2.05));
check('calories named', lose.every(item => /calories under/.test(item.how)));
const gain = suggestGoals({ type: 'Body Composition', unit: 'lb', current: '160', direction: 'gain' }, judgeFor([]));
check('gain: heavier, slower', gain.every(item => num(item) > 160 && /calories over/.test(item.how)), gain.map(i => i.targetText).join());

console.log('\nA slipping goal');
const big = { type: 'Strength', exercise: 'Bench Press', unit: 'lb', target: '400 lb', date: iso(70), title: '400 lb Bench', connection: '' };
const win = quickWinFor(big, judgeFor(rising));
check('offers a quick win before the goal date', win && win.date < big.date && num(win) < 400, JSON.stringify(win));

if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall passed');
