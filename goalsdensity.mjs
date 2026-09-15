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
const css = readFileSync('./src/goal-tracking.css', 'utf8');

console.log('\nA collapsed goal is the goal, not its controls');
check('the actions render only for the open goal',
  /\{isOpen && <div className="goal-card-actions">/.test(page));
check('and the detail is still its own block',
  /\{isOpen && roadmaps\[index\]/.test(page));
check('collapsing clears a half-pressed Delete',
  /const toggleGoal = \(index: number\) => \{ setConfirming\(null\);/.test(page));

console.log('\nThe status shares the line the date is on');
check('the meta row no longer spans the card', /\.goal-card-meta\{grid-column:1;/.test(css));
check('the verdict sits opposite it on the same row',
  /\.goal-card-verdict\{grid-column:2;grid-row:1;justify-self:end;/.test(css));
check('a very narrow screen gives it back its own line',
  /@media \(max-width:360px\)\{[^}]*\.goal-card-meta\{grid-column:1\/-1\}/.test(css.replace(/\s+/g, ' ')) ||
  /max-width:360px[\s\S]*goal-card-verdict\{grid-column:1\/-1/.test(css));

console.log('\nThe clash card says it once');
check('the date is in the heading, not repeated below',
  /<strong>\{clash\.races\.length\} races on \{new Date/.test(page));
check('the advice is one sentence', /A block peaks for one — move the others out a few weeks\.<\/p>/.test(page));
check('and it still names the race the block is built for',
  /Built for <strong>\{built\.goal\.title \|\| built\.goal\.exercise\}<\/strong>/.test(page));
/* The word survives once, in the comment explaining why the card exists. What
   must not survive is a second paragraph of advice on the screen. */
const clash = (page.match(/\{clash && <section[\s\S]*?<\/section>\}/) || [''])[0];
check('the card is two short lines', (clash.match(/<p/g) || []).length === 2, `${(clash.match(/<p/g) || []).length} paragraphs`);
check('and none of them is the old three-sentence version', !/compromise/.test(clash));

console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
