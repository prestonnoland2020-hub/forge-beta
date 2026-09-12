/* "THIS IS CUT OFF."

   The expanded day row on the Plan tab reads "Hard  5 × 1200 m @ 4:34/rep ·
   goal pa" and then the screen ends. Two separate causes, both in one CSS rule
   written for a different kind of value:

     .pv-line-value { white-space: nowrap }

   That is correct for a lift — "435 lb × 6" is short, tabular, and must never
   break across lines. A running session is a sentence: "5 × 1200 m @ 4:34/rep
   · goal pace". Held to one line it ran off the right edge, taking the pace
   and the label with it — the two parts of the session the athlete needs.

   And the name beside it could not give way either: a flex item does not
   shrink below its own content unless it is told it may, so "Smith Machine
   Shoulder Press" pushed its own weight off the screen.

   This is a source check rather than a browser one deliberately: it has to
   keep working in a suite where the browser fixtures do not, and the thing
   worth pinning is the rule, not a screenshot of it. */
import { readFileSync } from 'node:fs';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };

const css = readFileSync('./src/plan-simple.css', 'utf8');
const view = readFileSync('./src/components/PlanView.tsx', 'utf8');
const rule = name => (css.match(new RegExp(`\\${name}\\s*\\{([^}]*)\\}`)) || [, ''])[1];

console.log('\nA run line is marked as one');
check('RunLine carries the class', /className="pv-line pv-line-run"/.test(view));
check('LiftLine does not', /className="pv-line"[\s\S]{0,120}pv-line-name">\{lift\.exercise\}/.test(view));

console.log('\nA lift value still never breaks');
check('the base value is nowrap', /white-space:\s*nowrap/.test(rule('.pv-line-value')), rule('.pv-line-value').trim().slice(0, 60));
check('and is right-aligned and tabular',
  /text-align:\s*right/.test(rule('.pv-line-value')) && /tabular-nums/.test(rule('.pv-line-value')));

console.log('\nA run value wraps instead of running off the screen');
const runValue = (css.match(/\.pv-line-run \.pv-line-value\s*\{([^}]*)\}/) || [, ''])[1];
check('the run override exists at all', Boolean(runValue.trim()), runValue.trim().slice(0, 80));
check('and it turns wrapping back on', /white-space:\s*normal/.test(runValue));
check('long unbroken text breaks rather than overflowing', /overflow-wrap:\s*anywhere/.test(runValue));

console.log('\nNothing in the row refuses to shrink');
check('the row may shrink', /min-width:\s*0/.test(rule('.pv-line')), rule('.pv-line').trim().slice(0, 60));
check('and so may the name beside the value', /min-width:\s*0/.test(rule('.pv-line-name')));
check('a long exercise name wraps rather than pushing the value off',
  /overflow-wrap:\s*anywhere/.test(rule('.pv-line-name')));

console.log('\nOn a phone the session gets the full width');
const narrow = css.slice(css.indexOf('@media (max-width:520px)'));
check('there is a narrow-width rule', css.includes('@media (max-width:520px)'));
check('the run line stacks', /\.pv-line-run\s*\{[^}]*flex-direction:\s*column/.test(narrow));
check('and the session reads left-aligned under its label',
  /\.pv-line-run \.pv-line-value\s*\{[^}]*text-align:\s*left/.test(narrow));

console.log(`\n${fails ? `${fails} failed` : 'All checks passed'}`);
process.exit(fails ? 1 : 0);
