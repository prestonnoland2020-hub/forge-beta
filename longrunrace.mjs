/* A RUNNER WHOSE LONG RUNS ARE THE QUALITY WORK.

   Easy short runs, fast long runs: the long runs used to be set aside as
   "too good to be true" and the marathon judged off the jogs; and a "3:15"
   marathon saved with mm:ss was read as three minutes fifteen. */
import { goalFeasibility } from './src/lib/goalFeasibility.ts';
import { goalClockSeconds } from './src/lib/time.ts';
let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${detail}`}`); if (!ok) fails += 1; };
const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const ahead = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const run = (ago, miles, minutes, i) => ({ id: `r${i}`, date: day(ago), title: 'Run', muscles: ['Cardio'], hasCardio: true, topSets: [],
  cardioSessions: [{ id: `c${i}`, activity: 'Run', structure: 'steady', summary: `Run · ${miles} mi`, prescription: { legacyIntervals: [{ distance: miles, unit: 'miles', time: minutes, cardioType: 'Run' }] } }] });
const rows = [[60, 3, 24.6], [58, 4, 32.3], [55, 3, 25.3], [44, 6, 47], [40, 5.2, 40.5], [33, 3.1, 23.7], [29, 10, 79.6], [27, 4, 29.7], [21, 12, 97.4], [19, 4, 31.9], [14, 15, 117.4], [11, 7.4, 59.3], [7, 18, 134.6], [5, 3, 23.4], [1, 12, 87.7]];
const recs = rows.map(([ago, miles, minutes], i) => run(ago, miles, minutes, i));
console.log('\nReading the goal time');
check('3:15 on a marathon is hours, whatever the unit says', goalClockSeconds('3:15', 'mm:ss', 26.2) === 11700);
check('22:30 on a 5K stays minutes', goalClockSeconds('22:30', 'mm:ss', 3.1) === 1350);
console.log('\nLong runs as the quality work');
const goal = { type: 'Endurance', title: 'Full Marathon', exercise: 'Full Marathon', metric: 'Finish time', target: '3:15', unit: 'mm:ss', date: ahead(21) };
const [v] = goalFeasibility([goal], recs);
check('the long runs are read, not set aside', v.prediction && v.prediction.start < 3.5 * 3600, JSON.stringify(v.prediction));
check('3:15 is not out of reach', v.verdict !== 'out-of-reach', `${v.verdict} — ${v.say}`);
check('the time reads in hours', /\d:\d\d:\d\d/.test(v.say), v.say);
if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall passed');
