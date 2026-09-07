/* WHERE THE TAB BAR SITS WHILE THE PAGE IS SCROLLING.

   The earlier check only looked at rest, at the bottom, and found 80px of
   clearance. Preston's screenshots are all mid-scroll and show the bar
   floating over the middle of a card with content continuing below it — so
   the question is whether the bar stays pinned to the viewport during a
   scroll, or travels with the content. */
import { chromium } from 'playwright';
import { setup, goals, days } from './seed.mjs';
const BASE = 'http://localhost:4193';
let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
/* The demo build signs itself in, so the app renders without a session stub. */
await page.route('**/*', route => route.request().url().startsWith(BASE) ? route.continue() : route.abort());
await page.addInitScript(([s, g, d]) => {
  localStorage.clear();
  localStorage.setItem('forge-athlete-setup-v1', JSON.stringify(s));
  localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
  localStorage.setItem('forge-goals', JSON.stringify(g));
  localStorage.setItem('forge-workout-history-v1', JSON.stringify(d));
  localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'rolling', days: [
    { name: 'Chest & Back', weekday: 'MON', dayType: 'strength', muscles: ['Chest','Back'], exercises: ['Bench Press'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
    { name: 'Legs', weekday: 'TUE', dayType: 'strength', muscles: ['Quads','Glutes'], exercises: ['Back Squat'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
  ] }));
}, [setup, goals, days]);

for (const [label, route] of [['Today', '/'], ['Profile', '/profile'], ['Activities', '/activities'], ['Plan', '/plan'], ['Goals', '/goals']]) {
  await page.goto(`${BASE}/#${route}?t=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2400);
  const readings = [];
  for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
    await page.evaluate(f => window.scrollTo(0, (document.body.scrollHeight - window.innerHeight) * f), fraction);
    await page.waitForTimeout(250);
    const r = await page.evaluate(() => {
      const nav = document.querySelector('.bottom-nav');
      if (!nav) return { top: null, vh: window.innerHeight, docH: document.body.scrollHeight, missing: document.body.innerText.slice(0, 60) };
      const box = nav?.getBoundingClientRect();
      /* The bar must reach the bottom edge, leave no strip under it, and
         hide nothing at rest. */
      const gapBelow = box ? Math.round(window.innerHeight - box.bottom) : null;
      let hidden = 0;
      document.querySelectorAll('.page *').forEach(node => {
        if (node.closest('.bottom-nav') || node.closest('.coach-bubble-shell') || !node.textContent?.trim()) return;
        const b2 = node.getBoundingClientRect();
        if (b2.height && b2.width && box && b2.bottom > box.top && b2.top < box.bottom) hidden += 1;
      });
      return { top: box ? Math.round(box.top) : null, vh: window.innerHeight,
        gapBelow, hiddenNow: hidden, docH: document.body.scrollHeight };
    });
    readings.push(r);
  }
  const tops = readings.map(r => r.top);
  const moved = Math.max(...tops) - Math.min(...tops);
  const last = readings[readings.length - 1];
  check(`${label}: the bar stays put through the whole scroll`, moved <= 2, moved > 2 ? `moves ${moved}px` : 'pinned');
  check(`${label}: nothing shows underneath it`, last.gapBelow === 0, `${last.gapBelow}px strip`);
  check(`${label}: nothing is left hidden behind it at the bottom`, last.hiddenNow === 0, `${last.hiddenNow} element(s)`);
}
await browser.close();
console.log(fails ? `\n${fails} check(s) failed` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
