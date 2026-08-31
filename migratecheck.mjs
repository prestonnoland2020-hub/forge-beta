/* The retirement of the first accent set has to be invisible. An athlete who
   chose Ember opens the app and sees Coral, not the default blue, and sees it
   on the FIRST painted frame — the head script and the provider have to agree,
   or the app flickers through one colour on its way to another. */
import { chromium } from 'playwright';
const BASE = 'http://localhost:4193';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

const cases = [
  ['forge-appearance-v4', { theme: 'dark', accent: 'ember', icon: 'match' }, { accent: 'coral', ground: 'carbon' }],
  ['forge-appearance-v4', { theme: 'light', accent: 'volt', icon: 'volt' }, { accent: 'amber', ground: 'carbon' }],
  ['forge-appearance-v4', { theme: 'dark', accent: 'sand', icon: 'match' }, { accent: 'harbor', ground: 'carbon' }],
  ['forge-appearance-v4', { theme: 'dark', accent: 'slate', icon: 'match' }, { accent: 'harbor', ground: 'carbon' }],
  ['forge-appearance-v5', { theme: 'dark', ground: 'espresso', accent: 'tide', icon: 'match' }, { accent: 'tide', ground: 'espresso' }],
  ['forge-appearance-v5', { theme: 'dark', ground: 'nonsense', accent: 'nonsense', icon: 'match' }, { accent: 'signal', ground: 'carbon' }],
];

let fails = 0;
for (const [key, stored, want] of cases) {
  const p = await b.newPage({ viewport: { width: 430, height: 800 } });
  await p.addInitScript(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [key, stored]);
  // domcontentloaded = after the inline head script, before React mounts.
  await p.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  const first = await p.evaluate(() => ({ accent: document.documentElement.dataset.accent ?? null, ground: document.documentElement.dataset.ground ?? null }));
  await p.waitForTimeout(1800);
  const after = await p.evaluate(() => ({
    accent: document.documentElement.dataset.accent, ground: document.documentElement.dataset.ground,
    saved: localStorage.getItem('forge-appearance-v5'),
  }));
  // The head script may legitimately leave an attribute off (bare :root is
  // signal/carbon); what it must never do is paint a DIFFERENT colour.
  const flicker = (first.accent && first.accent !== after.accent) || (first.ground && first.ground !== after.ground);
  const ok = after.accent === want.accent && after.ground === want.ground && !flicker;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${key} ${JSON.stringify(stored)}`);
  console.log(`      pre-paint ${JSON.stringify(first)}  settled ${after.accent}/${after.ground}  saved ${after.saved}`);
  await p.close();
}
await b.close();
console.log(fails ? `${fails} failed` : 'every retired accent lands on its replacement, with no flicker');
process.exit(fails ? 1 : 0);
