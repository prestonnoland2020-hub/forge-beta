/* THE DAY SLIDER MEASURES FROM ITS OWN STRIP. HomePage centres a card with
   card.offsetLeft, which is measured from the nearest *positioned* ancestor.
   .tp-days was not positioned, so offsetLeft was relative to a card far up the
   page: the last day opened half off the screen ("ack 2") and the strip looked
   like it had nothing more to swipe to. Logic check, no browser needed. */
import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
let fail = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fail++; };
const home = readFileSync('src/pages/HomePage.tsx', 'utf8');
const css = readdirSync('src').filter(f => f.endsWith('.css')).map(f => [f, readFileSync(`src/${f}`, 'utf8')]);
if (/offsetLeft/.test(home)) {
  const rules = css.flatMap(([, text]) => [...text.matchAll(/(^|\n)\.tp-days\s*\{([^}]*)\}/g)].map(m => m[2]));
  ok(rules.some(r => /position:\s*relative/.test(r)), '.tp-days is positioned, so card.offsetLeft is strip-relative');
} else ok(true, 'HomePage no longer uses offsetLeft');
process.exit(fail ? 1 : 0);
