/* AN ENDURANCE GOAL'S CARD SHOWS WHAT THE RUNNING IS WORTH TODAY.

   The Goals list read only a time typed into the goal, so with runs logged a
   5K goal still said "Log it to start · No data yet" while its own detail,
   one tap away, showed a predicted current. */
import { goalProgress, expectedRunMiles } from './src/lib/goalProgress.ts';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };
const fiveK = { type: 'Endurance', title: '5K goal', exercise: '5K', target: '18:59', unit: 'mm:ss', date: '2027-01-17' };
const verdict = { goal: '5K goal', verdict: 'needs-more', say: '' };

console.log('\nThe card reads the predictor');
let p = goalProgress(fiveK, [], verdict, null, 'calculated', 20 * 60 + 30);
check('a predicted 20:30 is the current', p.current === 1230 && p.currentText === '20:30', `${p.current} ${p.currentText}`);
check('and the bar is drawn from it', p.share !== null && Math.abs(p.share - 1139 / 1230) < 0.001, String(p.share));
check('it no longer asks to be logged', p.label !== 'Log it to start', p.label);

console.log('\nWithout a prediction');
p = goalProgress(fiveK, [], verdict, null, 'calculated', null);
check('nothing logged still says so', p.current === null && p.label === 'Log it to start', p.label);
p = goalProgress({ ...fiveK, current: '21:10' }, [], verdict, null, 'calculated', null);
check('a typed starting time is the fallback', p.currentText === '21:10', p.currentText);

console.log('\nThe distance a goal is for');
check('5K', Math.abs(expectedRunMiles(fiveK) - 3.10686) < 1e-4);
check('a mile', expectedRunMiles({ type: 'Endurance', title: '1 Mile Run goal', exercise: '1 Mile Run' }) === 1);
console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
