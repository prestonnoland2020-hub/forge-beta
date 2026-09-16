/* "THE WORKOUT LOGGER WAS WHAT NEEDED SIMPLIFICATION AND CONDENSING."

   Four paragraphs on the logger described the controls sitting under them.

     "Start from today's plan, pick a day from your split, or record only what
      you did"  is the three source buttons, read out loud, directly above the
      three source buttons.
     "Tap to log one in a popup — it saves as completed" describes what happens
      when you press the button it sits above.
     "Review the context Forge will save with this workout" is a form saying it
      is a form.
     "This exercise supplies its muscle mapping automatically" sat under EVERY
      open top-set card and was the widest thing in the row: it asks for
      nothing and warns of nothing.

   What stays is what the screen cannot show by itself: that this is an EDIT of
   a saved day, that it is a back-dated entry, that a correction overwrites a
   result everywhere, and why a save is blocked. */
import { readFileSync } from 'node:fs';

let fails = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`);
  if (!ok) fails += 1;
};
const page = readFileSync('./src/pages/ProductPages.tsx', 'utf8');
const cards = readFileSync('./src/components/TopSetCards.tsx', 'utf8');
const cardio = readFileSync('./src/components/CardioBuilder.tsx', 'utf8');
const css = readFileSync('./src/workout.css', 'utf8');

console.log('\nThe logger stops describing its own buttons');
check('the intro no longer reads the source buttons out',
  !/Start from today’s plan, pick a day from your split/.test(page));
check('but an edit still says it is an edit', /Update the saved results for this day\./.test(page));
check('and a back-dated entry still says so', /Log anything you completed on this date/.test(page));
check('the top-set launcher drops the popup explanation',
  !/Tap to log one in a popup/.test(page) && /The one heaviest meaningful set per lift\./.test(page));
check('session details drops the line about being a form',
  !/Review the context Forge will save with this workout/.test(page));
check('and the cardio card drops its own',
  !/Log what you actually did\. Add a line for each interval\./.test(cardio));

console.log('\nAn open top-set card’s footer carries only what matters');
/* The sentence survives in the comment saying why it went; what must not
   survive is a copy of it rendered under every card. */
check('the muscle-mapping note is gone',
  !/\{[^}]*'This exercise supplies its muscle mapping automatically'/.test(cards)
  && (cards.match(/supplies its muscle mapping automatically/g) || []).length === 1);
check('a correction keeps its warning', /This replaces the completed result everywhere it is used\./.test(cards));
check('a blocked save keeps its reason', /: blockedReason\}/.test(cards));
check('and with neither, the footer is just the button',
  /className=\{isCorrecting \|\| blockedReason \? undefined : 'bare'\}/.test(cards));
check('which the stylesheet knows about', /\.top-set-entry footer\.bare\{/.test(css));

console.log('\nAnd the split’s cardio builder takes a sentence');
const plan = readFileSync('./src/components/CardioPlanBuilder.tsx', 'utf8');
check('the AI box is in the plan builder', /className="cardio-ai-box plan-ai-box"/.test(plan));
check('it reads the sentence the same way the logger does',
  /requestCardioParse\(description,/.test(plan) && /parseCardioDescription\(description\)/.test(plan));
check('and lands it on the real fields through one mapping',
  /planFromParsedRows\(/.test(plan));
check('nothing is saved from the sentence directly',
  /nothing is saved until you press Save/.test(plan));
check('an unreadable sentence leaves the fields alone',
  /if\(!shape\)\{setAiNote\(/.test(plan));

console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
