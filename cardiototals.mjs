/* THE TOTAL THE ATHLETE STATED WINS. Preston's fartlek — "6×1 min 5:42 pace
   1 min off 9:30 pace fartlek 1.65 miles 11:00 total" — logged as the six
   hard minutes alone: 1.05 mi in 6:00. The recoveries are part of the run. */
import { statedTotals, fillToTotals, parseCardioDescription } from './src/lib/cardioParse.ts';
let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };
const text = '6×1 min 5:42 pace 1 min off 9:30 pace fartlek 1.65 miles 11:00 total';
const totals = statedTotals(text);
check('reads 1.65 miles and 11:00 as the total', totals.miles === 1.65 && Math.abs(totals.minutes - 11) < 0.01, JSON.stringify(totals));
const work = Array.from({ length: 6 }, () => ({ cardioType: 'Run', distance: 0.175, unit: 'miles', timeMinutes: 1 }));
const filled = fillToTotals(work, totals);
check('the six work reps get one easy line for the remainder', filled.length === 7, String(filled.length));
const sumMi = filled.reduce((s, r) => s + r.distance, 0), sumMin = filled.reduce((s, r) => s + r.timeMinutes, 0);
check('and the session sums to 1.65 mi in 11:00', Math.abs(sumMi - 1.65) < 0.02 && Math.abs(sumMin - 11) < 0.02, `${sumMi.toFixed(2)} mi / ${sumMin.toFixed(2)} min`);
check('the remainder is the jog: 0.6 mi in 5:00', Math.abs(filled[6].distance - 0.6) < 0.02 && Math.abs(filled[6].timeMinutes - 5) < 0.02, JSON.stringify(filled[6]));
check('rows that already match are left alone', fillToTotals([{ cardioType: 'Run', distance: 1.65, unit: 'miles', timeMinutes: 11 }], totals).length === 1);
check('no "total" in the words → nothing is invented', Object.keys(statedTotals('ran 3 miles in 26:00')).length === 0);
check('km totals convert', Math.abs((statedTotals('10 km 50:00 total').miles || 0) - 6.21) < 0.02);
check('a total in minutes reads too', statedTotals('4 miles, 35 minutes total').minutes === 35);
const local = parseCardioDescription(text);
check('the local parser still reads the sentence at all', local.rows.length > 0, JSON.stringify(local.rows).slice(0, 120));
console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
