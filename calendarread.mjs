/* "HOW CAN WE MAKE THIS SIMPLER AND MORE USER FRIENDLY?" — the Activities
   screen, and the bottom bar cut off on his phone.

   Four things were making it harder to read than it needed to be.

   A LEGEND YOU NEED IN ORDER TO READ THE CALENDAR IS A FAILED ENCODING. Lift
   was a solid accent dot and cardio a solid #c2410c one — two warm dots seven
   pixels wide, a few degrees of hue apart, sitting side by side on a day
   square. Nobody tells those apart at arm's length. They differ by SHAPE now:
   a lift is filled, a run is a ring.

   THE SAME INSTRUCTION, TWICE. "Tap a day to see it" above the calendar and
   "Tap a day · swipe to change month" inside it. The far one went.

   RECORD FIELDS ARE NOT SENTENCES. "Completed from Forge recommendation ·
   split position 7" is how the day is stored. "Forge planned this day" is what
   happened.

   AND A ROW THAT RUNS OFF THE CARD IS NOT A RESULT: the run summary held its
   two halves on one line at any cost and pushed the pace past the right edge.

   THE BAR. Every piece of bottom chrome measured its clearance from
   env(safe-area-inset-bottom), which is right where a phone reports one and
   wrong everywhere it reports zero — the bar then sits flush on the screen
   edge with the home indicator drawn through it, which is what "cut off"
   looks like. --safe-b puts a floor under it. */
import { readFileSync } from 'node:fs';

let fails = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`);
  if (!ok) fails += 1;
};
const page = readFileSync('./src/pages/HistoryPage.tsx', 'utf8');
const history = readFileSync('./src/history.css', 'utf8');
const theme = readFileSync('./src/forge-theme.css', 'utf8');
const system = readFileSync('./src/forge-system.css', 'utf8');

console.log('\nA day reads without consulting the legend');
check('a lift is a filled dot', /\.calendar-legend \.strength,\.calendar-markers \.strength\{background:var\(--accent\)\}/.test(history));
check('a run is a ring, not another filled dot',
  /\.calendar-markers \.cardio\{background:transparent;border:2px solid var\(--chart-2\)\}/.test(history));
check('and the ring keeps the dot’s footprint', /\.calendar-markers i\{[^}]*box-sizing:border-box\}/.test(history));
check('the legend still states the convention once', /calendar-legend/.test(page));

console.log('\nThe screen says each thing once');
/* The sentence survives in the comment explaining why it went; what must not
   survive is a second copy of it on the screen. */
check('the duplicated tap instruction is gone',
  !/<PageIntro copy="Tap a day/.test(page) && (page.match(/Tap a day/g) || []).length === 3);
check('the one beside the control stays', /Tap a day · swipe to change month/.test(page));
check('the month heading carries no CALENDAR eyebrow',
  !/<span className="eyebrow">CALENDAR<\/span>/.test(page));
check('the average weight names its unit', /<span>Avg \{weightUnit\}<\/span>/.test(page));
check('the lineage line is in words, not record fields',
  /Forge planned this day/.test(page) && !/split position \{selected\.splitPosition/.test(page));

console.log('\nA result row wraps rather than running off the card');
check('the row may wrap', /\.simple-preview-results>div\{[^}]*flex-wrap:wrap/.test(history));
check('and the detail half is what gives way',
  /\.simple-preview-results>div>span\{flex:1 1 auto;min-width:0/.test(history));

console.log('\nThe bottom bar has a floor under the safe-area inset');
check('--safe-b exists', /--safe-b: max\(env\(safe-area-inset-bottom\), 12px\);/.test(theme));
check('no bottom chrome reads the raw inset any more',
  !/env\(safe-area-inset-bottom\)/.test(system), 'forge-system.css still has a raw inset');
check('the capsule is lifted by it', /bottom:calc\(12px \+ var\(--safe-b\)\)/.test(system));
check('and the page reserves room measured the same way',
  /--chrome-clear:calc\(162px \+ var\(--safe-b\)\)/.test(system));

console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
