/* "JUST GO BACK TO OLD NAVIGATION BAR AND NO ZOOM THIS IS AWFUL."

   The floating capsule is gone. It was tried twice and failed four different
   ways on the way out: a band another stylesheet painted behind it, a
   full-width shadow, a fade scrim of my own, and a safe-area inset this phone
   reports as zero. Four causes, four deploys, still off the bottom of the
   screen.

   A bar clamped to the bottom edge does not care what the inset says. If the
   home-indicator strip is reported, the inset pads the bar's inside and the
   tabs sit above it. If it is not reported, the bar runs under the strip and
   the tabs are still on the screen, because there is no gap below them for
   the error to live in. That is why this shape survives phones that lie about
   their own geometry.

   This suite used to assert a capsule; it asserts the bar now. Same sweep:
   every route, both tones, three widths, top and bottom of the page. */
import { chromium } from 'playwright';
import { setup, goals, days } from './seed.mjs';

const BASE = 'http://localhost:4193';
const ROUTES = ['/', '/plan', '/split', '/workout', '/insights', '/history', '/goals', '/coach',
  '/exercises', '/profile', '/partners', '/profile?view=settings', '/profile?view=faq', '/profile?view=appearance'];
const WIDTHS = [320, 390, 430];
const LIFT_MIN = 6;
const GAP_MIN = 8;

let fails = 0;
const seen = new Map();
const fail = (label, detail) => { fails += 1; console.log(`  FAIL  ${label} — ${detail}`); };
const note = (key) => seen.set(key, (seen.get(key) || 0) + 1);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

const measure = (page) => page.evaluate(() => {
  const nav = document.querySelector('.bottom-nav');
  if (!nav) return { missing: true };
  const bar = nav.getBoundingClientRect();
  /* ::before is checked only to prove the capsule is NOT there any more. */
  const capsule = getComputedStyle(nav, '::before');
  const links = [...nav.querySelectorAll('a')].map(a => a.getBoundingClientRect().height);
  /* WHAT MATTERS IS WHETHER ANYTHING IS TRAPPED UNDER THE BAR, and the honest
     way to ask that is to hit-test the pixels rather than to measure boxes:
     an element inside a collapsed sheet still reports a rectangle at the
     bottom of the page even though nothing is painted there.

     Two questions. Does every tab actually receive its own tap — or is
     something sitting on top of the bar? And does the page reserve enough
     room below its content for the capsule to float over nothing? */
  const page_ = document.querySelector('.page');
  const clearance = page_ ? Number.parseFloat(getComputedStyle(page_).paddingBottom) : null;
  const navLinks = [...nav.querySelectorAll('a')];
  const blocked = navLinks.filter(a => {
    const r = a.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !hit || !nav.contains(hit);
  }).length;
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    bar: { top: bar.top, bottom: bar.bottom, left: bar.left, right: bar.right },
    capsule: { content: capsule.content },
    scrim: getComputedStyle(nav, '::after').backgroundImage,
    navBackground: getComputedStyle(nav).backgroundColor,
    links, clearance, blocked, scrollY: window.scrollY,
    docHeight: document.documentElement.scrollHeight,
  };
});

for (const theme of ['light', 'dark']) {
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 2 });
    await page.addInitScript(([s, gl, d, t]) => { localStorage.clear();
      localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
      localStorage.setItem('forge-goals', JSON.stringify(gl));
      localStorage.setItem('forge-workout-history-v1', JSON.stringify(d));
      localStorage.setItem('forge-appearance-v5', JSON.stringify({ theme: t, ground: 'carbon', accent: 'flare', icon: 'match' }));
    }, [setup, goals, days, theme]);
    await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    for (const route of ROUTES) {
      await page.evaluate(r => { window.location.hash = `#${r}`; }, route);
      await page.waitForTimeout(700);

      for (const where of ['top', 'bottom']) {
        if (where === 'bottom') {
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          await page.waitForTimeout(350);
        }
        const at = `${theme} ${width}px ${route} (${where})`;
        const m = await measure(page);
        if (m.missing) { fail('the tab bar exists', at); continue; }

        /* Pinned to the bottom of what is visible. */
        if (Math.abs(m.bar.bottom - m.viewport.h) > 1) fail('pinned to the bottom of the screen', `${at}: bar bottom ${Math.round(m.bar.bottom)} vs viewport ${m.viewport.h}`);
        else note('pinned');

        /* FULL BLEED, AND FLUSH WITH THE BOTTOM. No gap under it: a gap is
           where every one of the capsule's failures lived. */
        if (Math.abs(m.bar.left) > 0.5 || Math.abs(m.bar.right - m.viewport.w) > 0.5) {
          fail('the bar spans the whole width', `${at}: ${Math.round(m.bar.left)}..${Math.round(m.bar.right)} of ${m.viewport.w}`);
        } else note('full bleed');
        if (m.capsule.content && m.capsule.content !== 'none') fail('no capsule is painted inside it', at);
        else note('no capsule');
        if (/gradient|url\(/.test(m.scrim)) fail('and nothing is painted behind it', `${at}: ${m.scrim}`);
        else note('no band');

        /* ITS OWN GROUND IS OPAQUE. An undefined token makes a background
           vanish silently, which is exactly how the header once shipped with
           none — and a see-through bar over a scrolling list is the other half
           of what went wrong with the capsule. */
        const transparent = /rgba?\([^)]*,\s*0\s*\)/.test(m.navBackground) || m.navBackground === 'transparent';
        if (transparent) fail('the bar paints an opaque ground', `${at}: ${m.navBackground}`);
        else note('opaque');

        /* Nothing sits on top of the bar, and the page leaves room under its
           own content for the capsule to float over nothing but ground. */
        if (m.blocked) fail('every tab receives its own tap', `${at}: ${m.blocked} covered`);
        else note('tappable');
        const needed = m.viewport.h - m.bar.top + 8;
        if (m.clearance !== null && m.clearance < needed) {
          fail('the page reserves room under its content', `${at}: ${Math.round(m.clearance)}px reserved, ${Math.round(needed)}px needed`);
        } else note('cleared');

        /* And every tab is still a target. */
        const small = m.links.filter(h => h < 44);
        if (small.length) fail('every tab is a 44px target', `${at}: ${small.map(Math.round).join(', ')}`);
        else note('targets');
      }
    }
    await page.close();
  }
}
await browser.close();

console.log('\nThe bar holds on every route, tone and width');
for (const [what, count] of seen) console.log(`  PASS  ${what} (${count} checks)`);
console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
