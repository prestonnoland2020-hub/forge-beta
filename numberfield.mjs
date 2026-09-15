/* "A BUNCH OF NUMERICAL INPUTS WONT LET YOU INPUT A NUMBER WITHOUT A 0 BEFORE
   IT."

   The pattern was `value={someNumber}` with `onChange={... Number(e.target.value)}`
   and it fails twice, and the two failures together make the field nearly
   unusable:

     THE ZERO CANNOT BE CLEARED. Select it, delete it, and the handler runs
     Number('') — which is 0 — so the field puts the zero straight back. There
     is no keystroke that empties it.

     AND YOUR NUMBER LANDS BEHIND IT. With a "0" in the box a tap often puts
     the caret before it, so typing 45 gives "045" and, re-parsed, 450.

   The answer is to stop pretending an input holds a number. It holds text; the
   text becomes a number when it is worth becoming one. Every rule of that
   conversion is checked here, because this runs on every keystroke of every
   numeric field in the app and a wrong one is unusable rather than untidy. */
import { normalizeNumericEntry, numericValue, numericDisplay } from './src/lib/numberField.ts';

let fails = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`);
  if (!ok) fails += 1;
};

console.log('\nThe zero goes, which is the whole complaint');
/* A zero mileage is not a fact about the athlete, it is the absence of one.
   Printing it is what put the character in the way. */
check('a zero shows as an empty field', numericDisplay(0) === '', `"${numericDisplay(0)}"`);
check('and so does nothing at all', numericDisplay(null) === '' && numericDisplay(undefined) === '');
check('but a real number shows', numericDisplay(18) === '18');
/* Some fields mean zero — a rest of zero seconds is a choice. */
check('a field where zero is a real answer can say so', numericDisplay(0, false) === '0');

console.log('\nTyping over a leading zero works, as you type');
/* IT HAS TO HAPPEN ON THE KEYSTROKE, not on blur: if "045" survives until the
   field loses focus, the next keystroke makes it "0456". */
check('"045" becomes 45', normalizeNumericEntry('045') === '45', normalizeNumericEntry('045'));
check('"007" becomes 7', normalizeNumericEntry('007') === '7');
check('and 450 is never what 45 meant', numericValue('045') === 45, String(numericValue('045')));

console.log('\nBut a zero on its own is not an error');
/* Eating these would make a decimal impossible to type: every "0.5" passes
   through "0" and then "0." on the way. */
check('"0" stays "0"', normalizeNumericEntry('0') === '0');
check('"0." stays, so a decimal can be reached', normalizeNumericEntry('0.') === '0.');
check('and "0.5" is 0.5', numericValue('0.5') === 0.5, String(numericValue('0.5')));

console.log('\nAn empty field means nothing, not zero');
/* THE OTHER HALF OF THE BUG. Number('') is 0, which is how the zero came
   back. Empty has to be reportable as empty so the caller decides. */
check('an emptied field reports nothing', numericValue('') === null);
check('and a lone decimal point is not a number yet', numericValue('.') === null);
check('nor is a field of nothing but rubbish', numericValue('abc') === null);

console.log('\nOnly what belongs in a weight or a mileage gets in');
check('letters are dropped', normalizeNumericEntry('12kg') === '12');
/* A minus has no meaning on a weight, a mileage or a rep count. */
check('a minus sign is not a number here', normalizeNumericEntry('-5') === '5');
/* And "2e9" is two billion, which is not a rep count anybody typed. */
check('and neither is exponent notation', numericValue('2e9') === 29, String(numericValue('2e9')));
check('a second decimal point is a typo', normalizeNumericEntry('1.2.3') === '1.23');
check('a whole-number field refuses the point entirely',
  normalizeNumericEntry('12.5', false) === '125', normalizeNumericEntry('12.5', false));

console.log('\nAnd what comes out is what a person would have written');
check('a tenth survives', numericDisplay(20.5) === '20.5');
/* Floating point turns a third of a mile into 0.3333333333333333 in a text
   box. Three places is more than any field here measures. */
check('but not fifteen decimal places', numericDisplay(1 / 3) === '0.333', numericDisplay(1 / 3));
check('a whole number has no point on it', numericDisplay(20) === '20');

console.log('\nEvery keystroke of typing "20.5" from empty is legal');
/* The real test of a per-keystroke rule: replay the whole sequence and check
   nothing along the way is rewritten into something the next keystroke
   breaks. */
const typed = ['2', '20', '20.', '20.5'];
let draft = '';
const trail = [];
for (const raw of typed) { draft = normalizeNumericEntry(raw); trail.push(draft); }
check('nothing is rewritten mid-word', trail.join(' → ') === '2 → 20 → 20. → 20.5', trail.join(' → '));
check('and it ends up as the number', numericValue(draft) === 20.5);

console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
