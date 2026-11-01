/* Appearance is light or dark now; ground, accent and app icon are no longer
   choices. Anyone who picked one under an older build has to open the app in
   the brand's carbon and signal, keep their light/dark choice, and never see
   a frame of the colour they used to have: the head script and the provider
   both leave <html> bare, and the stored record is rewritten to the tone
   alone. */
import { chromium } from 'playwright';
const BASE = 'http://localhost:4193';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

const cases = [
  ['forge-appearance-v4', { theme: 'dark', accent: 'ember', icon: 'match' }, 'dark'],
  ['forge-appearance-v4', { theme: 'light', accent: 'volt', icon: 'volt' }, 'light'],
  ['forge-appearance-v5', { theme: 'dark', ground: 'espresso', accent: 'tide', icon: 'match' }, 'dark'],
  ['forge-appearance-v5', { theme: 'light', ground: 'midnight', accent: 'amber', icon: 'flare' }, 'light'],
  ['forge-appearance-v5', { theme: 'dark', ground: 'nonsense', accent: 'nonsense', icon: 'match' }, 'dark'],
];

let fails = 0;
for (const [key, stored, theme] of cases) {
  const p = await b.newPage({ viewport: { width: 430, height: 800 } });
  await p.addInitScript(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [key, stored]);
  // domcontentloaded = after the inline head script, before React mounts.
  await p.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  const read = () => p.evaluate(() => ({
    theme: document.documentElement.dataset.theme ?? null,
    accent: document.documentElement.dataset.accent ?? null,
    ground: document.documentElement.dataset.ground ?? null,
  }));
  const first = await read();
  await p.waitForTimeout(1800);
  const after = await read();
  const saved = await p.evaluate(() => localStorage.getItem('forge-appearance-v5'));
  const ok = [first, after].every(state => state.accent === null && state.ground === null)
    && after.theme === theme && saved === JSON.stringify({ theme });
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${key} ${JSON.stringify(stored)}`);
  console.log(`      pre-paint ${JSON.stringify(first)}  settled ${JSON.stringify(after)}  saved ${saved}`);
  await p.close();
}
await b.close();
console.log(fails ? `${fails} failed` : 'every old colour choice lands on carbon and signal, keeping its tone, with no flicker');
process.exit(fails ? 1 : 0);
