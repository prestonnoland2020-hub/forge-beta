/* THE NAVIGATION CAME OFF ITS RAIL.

   Preston screenshotted the FAQ with the bottom bar floating two thirds of the
   way up the screen, content running on beneath it, and the status bar sitting
   on top of the prose with no header in sight. Both pieces of chrome — the
   sticky top bar and the fixed bottom bar — had stopped tracking the viewport
   at the same moment.

   "Fix in every single scenario", which means this file: the bar's box is
   measured against the viewport on every screen the app has, at the top of the
   page and at the bottom, on a phone and on a tablet, with a short page and a
   very long one. A layout that is right on the screen somebody happened to
   check is not fixed. */
import { chromium } from 'playwright';
import { setup, goals, days } from './seed.mjs';

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.FORGE_BASE || 'http://localhost:4193';
let fails = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`);
  if (!ok) fails += 1;
};

/* Every screen reachable from the bar, plus the two long-prose screens where
   he saw it go: the FAQ, and the exercise library. */
const ROUTES = [
  ['Today', '/'],
  ['Plan', '/plan'],
  ['Goals', '/goals'],
  ['Activities', '/history'],
  ['Profile', '/profile'],
  ['FAQ', '/profile?view=faq'],
  ['Progress', '/insights'],
  ['Exercises', '/exercises'],
  ['Coach', '/coach'],
  ['Split', '/split'],
];
/* A phone, the tablet band that had no layout of its own, and a desktop —
   where the bar is replaced by the sidebar and must not be on screen at all. */
const SIZES = [['phone', 390, 844], ['tall phone', 430, 932], ['tablet', 820, 1180], ['desktop', 1440, 900]];

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.route('**/*', route => route.request().url().startsWith(BASE) ? route.continue() : route.abort());
await page.addInitScript(([s, g, d]) => {
  localStorage.clear();
  localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
  localStorage.setItem('forge-goals', JSON.stringify(g));
  localStorage.setItem('forge-workout-history-v1', JSON.stringify(d));
  localStorage.setItem('forge-appearance-v5', JSON.stringify({ theme: 'dark', ground: 'carbon', accent: 'signal', icon: 'match' }));
}, [setup, goals, days]);

/* Where the bar actually is, against the viewport it is supposed to be glued
   to — read after a paint so a mid-scroll frame cannot pass by accident. */
const barBox = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
  const bar = document.querySelector('.bottom-nav');
  if (!bar) return resolve(null);
  const style = getComputedStyle(bar);
  const box = bar.getBoundingClientRect();
  resolve({
    hidden: style.display === 'none',
    position: style.position,
    top: Math.round(box.top), bottom: Math.round(box.bottom), height: Math.round(box.height),
    viewport: window.innerHeight,
    docHeight: document.documentElement.scrollHeight,
    scrollY: Math.round(window.scrollY),
  });
}))));

const visit = async (route) => {
  await page.goto(`${BASE}/#${route}${route.includes('?') ? '&' : '?'}t=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.locator('[aria-label="Confirm this effort"] .button').first().click({ timeout: 800 }).catch(() => {});
  await page.waitForTimeout(250);
};

for (const [sizeName, width, height] of SIZES) {
  console.log(`\n${sizeName} — ${width}x${height}`);
  await page.setViewportSize({ width, height });
  for (const [name, route] of ROUTES) {
    await visit(route);
    const top = await barBox();
    if (!top) { check(`${name}: the bar exists`, false, 'no .bottom-nav in the document'); continue; }
    if (width > 900) {
      /* Above the shell breakpoint the sidebar is the navigation and the bar
         is not drawn at all. A bar that is merely pushed off screen is not the
         same thing: it still takes tab stops and reads to a screen reader. */
      check(`${name}: the bar is not drawn beside the sidebar`, top.hidden, `display is not none`);
      continue;
    }
    check(`${name}: the bar is fixed to the viewport`, top.position === 'fixed', top.position);
    /* THE ASSERTION THAT WOULD HAVE CAUGHT IT. Its bottom edge is the bottom
       edge of the screen — not a few pixels up, not two thirds of the way up. */
    check(`${name}: its bottom edge is the screen's`, Math.abs(top.bottom - top.viewport) <= 1,
      `bottom ${top.bottom} against a ${top.viewport} viewport`);

    /* AND STILL THERE AFTER A SCROLL, which is the state he screenshotted.
       A page shorter than the screen cannot scroll and proves nothing, so it
       is reported rather than counted. */
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(350);
    const bottom = await barBox();
    if (bottom.scrollY < 20) { console.log(`  note  ${name} is shorter than the screen at this size — nothing to scroll`); continue; }
    check(`${name}: and after scrolling to the end of the page`, Math.abs(bottom.bottom - bottom.viewport) <= 1,
      `bottom ${bottom.bottom} against a ${bottom.viewport} viewport, scrolled ${bottom.scrollY}`);
    /* NOTHING MAY SIT UNDER IT. The page reserves --chrome-clear at the foot
       for exactly this, and the bar is opaque: a card under the bar is a card
       the athlete cannot read or tap. */
    const covered = await page.evaluate(() => {
      const bar = document.querySelector('.bottom-nav');
      const box = bar.getBoundingClientRect();
      const probes = [0.2, 0.5, 0.8].map(share => document.elementFromPoint(box.left + box.width * share, box.top + box.height / 2));
      return probes.filter(node => node && !node.closest('.bottom-nav') && !node.closest('.coach-bubble-shell')).map(node => node.className || node.tagName).slice(0, 2);
    });
    check(`${name}: and nothing is hidden underneath it`, covered.length === 0, covered.join(' | '));
  }
}

/* THE TOP BAR IS THE OTHER HALF OF THE SAME FAILURE — it had scrolled away in
   his screenshot, which is what a sticky header does when the element it is
   sticking inside is not the thing that scrolls. */
console.log('\nAnd the header stays at the top of the screen');
await page.setViewportSize({ width: 390, height: 844 });
for (const [name, route] of [['FAQ', '/profile?view=faq'], ['Exercises', '/exercises'], ['Plan', '/plan']]) {
  await visit(route);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(350);
  const bar = await page.evaluate(() => {
    const el = document.querySelector('.topbar');
    if (!el) return null;
    const box = el.getBoundingClientRect();
    return { top: Math.round(box.top), scrollY: Math.round(window.scrollY) };
  });
  if (!bar) { check(`${name}: the header exists`, false); continue; }
  if (bar.scrollY < 20) { console.log(`  note  ${name} does not scroll at this size`); continue; }
  check(`${name}: the header is still at the top after scrolling`, Math.abs(bar.top) <= 1, `top ${bar.top}`);
}

await browser.close();
console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
