/* THE TAB BAR ANSWERS THE FIRST TAP, AND COMES BACK AFTER THE KEYBOARD.

   Preston: "navigation bar gets sticky at times". Two ways it happened:
   a tap during a scroll's coast only stopped the scroll on iOS (no click),
   and a focused field removed from the page never sent focusout, leaving
   html.keyboard-open on — the bar hidden and untappable. Read off the source,
   since neither can be driven without a device. */
import { readFileSync } from 'node:fs';

let fails = 0;
const check = (label, ok) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) fails += 1; };
const shell = readFileSync('./src/components/AppShell.tsx', 'utf8');
const chrome = readFileSync('./src/features/shell/nativeChrome.ts', 'utf8');
const css = readFileSync('./src/app-chrome.css', 'utf8');

console.log('\nA tab switches on the touch itself');
check('a still touch on a tab navigates on touchend', /onTouchEnd=\{event => \{[\s\S]*?Math\.hypot[\s\S]*?> 10\) return;[\s\S]*?navigate\(tab\.to\)/.test(shell));
check('and the click that follows is suppressed', /event\.preventDefault\(\);\s*if \(index !== activeTab\)/.test(shell));

console.log('\nThe bar sits above the strip iOS keeps for its swipe');
check('it is lifted off the safe area, not tucked into it', /bottom: calc\(var\(--safe-b, env\(safe-area-inset-bottom\)\) \+ var\(--tab-lift\)\);/.test(css));
check('and the page clears the lifted bar', /--tab-clear: calc\(var\(--tab-h\) \+ var\(--tab-gap\) \+ var\(--tab-lift\)/.test(css));

console.log('\nThe keyboard state cannot stick');
check('every screen change re-reads it', /useEffect\(\(\) => \{ syncKeyboardState\(\); \}, \[location\.pathname, location\.search\]\)/.test(shell));
check('it clears unless a text field really has focus', /if \(!isTextEntry\(document\.activeElement\)\) document\.documentElement\.classList\.remove\('keyboard-open'\)/.test(chrome));
check('and the next touch rechecks it too', /addEventListener\('touchstart', onTouch, \{ passive: true \}\)/.test(chrome));
console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
