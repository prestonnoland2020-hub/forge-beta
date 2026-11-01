/* SLIDE A FINGER ALONG THE TAB BAR AND THE PAGE FOLLOWS IT.

   Asked for in so many words: swipe across the bottom bar and it changes
   page, with a haptic tick. A source check, so it runs where the browser
   fixtures do not; the gesture itself was driven with synthetic touches in a
   demo build and on the simulator. */
import { readFileSync } from 'node:fs';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };

const shell = readFileSync('./src/components/AppShell.tsx', 'utf8');
const haptics = readFileSync('./src/lib/haptics.ts', 'utf8');
const css = readFileSync('./src/app-chrome.css', 'utf8');

console.log('\nThe bar follows a sliding finger');
check('the bar listens for a moving touch', /className=\{`tab-bar[\s\S]{0,400}onTouchMove=/.test(shell));
check('only a sideways drag counts, not a tap or a scroll', /dx < 12 \|\| dx < dy/.test(shell));
check('the tab under the finger is found by its box', /getBoundingClientRect\(\); return point\.clientX >= box\.left && point\.clientX < box\.right/.test(shell));
check('crossing into a tab changes page', /navigate\(tabs\[index\]\.to, \{ replace: state\.moved \}\)/.test(shell));
check('so Back returns to where the slide began', /replace: state\.moved/.test(shell));

console.log('\nAnd you can feel each tab');
check('a tick for every tab crossed', /if \(index < 0 \|\| index === state\.index\) return;\s*state\.index = index;\s*tick\(\);/.test(shell));
check('tick is the selection detent where the engine has one', /export function tick\(\)[\s\S]{0,300}selectionChanged/.test(haptics));

console.log('\nThe browser does not steal the drag');
check('the bar takes the gesture itself', /\.tab-bar \{ touch-action: none; \}/.test(css));

console.log(`\n${fails ? `${fails} failed` : 'All checks passed'}`);
process.exit(fails ? 1 : 0);
