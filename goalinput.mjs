import { normalizeGoalValue, normalizeTimeValue, normalizeNumberValue } from './src/lib/goalInput.ts';
let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };
const v = r => r.ok ? r.value : `ERR:${r.message}`;

console.log('\nNumbers');
check('315 stays 315', v(normalizeNumberValue('315')) === '315');
check('1,200 drops the comma', v(normalizeNumberValue('1,200')) === '1200');
check('decimals keep', v(normalizeNumberValue('102.5')) === '102.5');
check('"315 lbs!!" is refused', !normalizeNumberValue('315 lbs!!').ok, v(normalizeNumberValue('315 lbs!!')));
check('"two seventy five" is refused', !normalizeNumberValue('two seventy five').ok);
check('empty is refused', !normalizeNumberValue('  ').ok);
check('zero is refused', !normalizeNumberValue('0').ok);

console.log('\nTimes');
check('22 → 22:00', v(normalizeTimeValue('22')) === '22:00');
check('22.5 → 22:30', v(normalizeTimeValue('22.5')) === '22:30');
check('22:30 stays', v(normalizeTimeValue('22:30')) === '22:30');
check('1:20:00 stays', v(normalizeTimeValue('1:20:00')) === '1:20:00');
check('80 with hh:mm:ss → 1:20:00', v(normalizeTimeValue('80', true)) === '1:20:00');
check('1:20 with hh:mm:ss is h:mm', v(normalizeTimeValue('1:20', true)) === '1:20:00');
check('22:75 is refused', !normalizeTimeValue('22:75').ok);
check('"fast" is refused', !normalizeTimeValue('fast').ok);
check('0 is refused', !normalizeTimeValue('0').ok);

console.log('\nBy unit');
check('mm:ss unit routes to time', v(normalizeGoalValue('22', 'mm:ss')) === '22:00');
check('pace metric routes to time', v(normalizeGoalValue('8.5', 'min/mi', 'Average pace')) === '8:30');
check('lb routes to number', v(normalizeGoalValue('315', 'lb')) === '315');
check('lb refuses a clock', !normalizeGoalValue('22:00', 'lb').ok);

console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
