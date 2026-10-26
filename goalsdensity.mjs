/* "CLEAN UP THE EXTRA SPACING AND TEXT HERE PLS"

   Six goals, and the list they are the point of did not fit on a phone. Two
   things were paying for that. Every goal carried a permanent row of Edit and
   Delete — two buttons per goal, used once in a while, charged for always —
   and the status sat on a third line of its own under the title. So a goal
   that is a tag, a date, a name, a number and a word cost five lines.

   It is two lines now: tag and date with the status opposite, then the goal
   and its number. Edit and Delete belong to the goal you opened, and open with
   it. The race-clash card said in two paragraphs what two short lines say.

   Read off the source, because what is being asserted is which markup exists
   at all, not how it looks. */
import { readFileSync } from 'node:fs';

let fails = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`);
  if (!ok) fails += 1;
};
const page = readFileSync('./src/pages/GoalsPage.tsx', 'utf8');

console.log('\nA collapsed goal is the goal, not its controls');
check('the actions render only for the open goal',
  /\{isOpen && <div className="goal-card-actions">/.test(page));
check('and the detail is still its own block',
  /\{isOpen && roadmaps\[index\]/.test(page));
check('collapsing clears a half-pressed Delete',
  /const toggleGoal = \(index: number\) => \{ setConfirming\(null\);/.test(page));

console.log('\nEach goal is its own card, grouped by kind');
check('strength, endurance and body are separate sections', /const CATEGORIES = \[/.test(page) && /className=\{`gx-group \$\{category\.className\}`\}/.test(page));
check('each goal draws a progress bar', /className="gx-bar" role="progressbar"/.test(page));
check('the bar is coloured by the verdict', /tone-\$\{item\.tone\}/.test(page));
check('the bars fill after the page mounts', /setFilled\(true\)/.test(page) && /width: filled \?/.test(page));
check('adding a goal is the last thing on the page', page.lastIndexOf('className="gx-add"') > page.lastIndexOf('className="gx-cards"'));

console.log('\nThe coach says what used to be a heading');
check('the race-clash card is gone from the page', !/clash &&/.test(page) && !/Built for/.test(page));
check('and the mileage gate is not drawn above the goals', !/<MileageGate \/>/.test(page));
const notes = readFileSync('./src/lib/coachNotes.ts', 'utf8');
check('a clash is a coach note instead, said once', /key: `race-clash:\$\{input\.raceClash\.date\}/.test(notes));

console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
