/* EVERY POP-UP OPENS INTO <body>. A dialog rendered inside the page is fixed to
   whichever card above it has a transform, filter or will-change, or to the
   iOS app's own fixed, scrolling frame — on iPhone it then lands below the page
   and all you see is the blurred backdrop (the missing weight dial, Nov 2026).
   A browser test can't see this, so the rule is checked in the source: any
   component with role="dialog" must render through <Overlay> or createPortal. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${detail}`}`); if (!ok) fails += 1; };
const walk = dir => readdirSync(dir).flatMap(name => { const path = join(dir, name); return statSync(path).isDirectory() ? walk(path) : path.endsWith('.tsx') ? [path] : []; });
const files = walk('src').filter(file => /role="dialog"/.test(readFileSync(file, 'utf8')) && !file.endsWith('AppShell.tsx'));
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const dialogs = (source.match(/role="dialog"/g) || []).length;
  const portals = (source.match(/<Overlay>|createPortal\(/g) || []).length;
  check(`${file} opens its pop-up into <body>`, portals >= Math.min(dialogs, 1) && (portals >= dialogs || /createPortal\(/.test(source)), `${dialogs} dialog(s), ${portals} portal(s) — wrap it in <Overlay> from src/components/Overlay.tsx`);
}
check('found the app\'s pop-ups', files.length >= 15, `only ${files.length}`);
if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall passed');
