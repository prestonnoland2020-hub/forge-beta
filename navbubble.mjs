/* "MAKE THE NAVIGATION BAR LIKE INSTAGRAM AS A BUBBLE" —
   "just make it work no matter what page you open."

   A floating capsule was built once before and pulled, for three reasons
   written into forge-system.css: content showed in the gap under it; a fixed,
   backdrop-filtered layer drifts during iOS momentum scroll and left the pill
   stranded mid-card; and a translucent bar over a scrolling list is busy where
   the eye needs calm. Two of those are fixed elsewhere now (pinChrome pins to
   the visual viewport; the capsule is opaque), and the third is answered by
   fading the page into its own ground behind the bar.

   None of that is worth anything if it only holds on the route it was built
   on. This walks every route, in both tones, at three phone widths, at the top
   of the page and scrolled to the bottom, and asks the same questions of the
   rendered pixels each time:

     it is pinned to the bottom of what the athlete can see;
     the capsule is inside the screen, lifted off the edge, and centred;
     its background is actually painted — an undefined token makes a
       background vanish silently, which is exactly how the header shipped
       with none;
     the page ends far enough above it that nothing tappable hides behind it;
     and every tab is still a 44px target. */
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
  const capsule = getComputedStyle(nav, '::before');
  /* The capsule is a pseudo-element, so its box is derived: the nav's own box
     inset by the pseudo's resolved left/right/bottom. */
  const px = (value) => Number.parseFloat(value) || 0;
  const left = bar.left + px(capsule.left);
  const right = bar.right - px(capsule.right);
  const bottom = bar.bottom - px(capsule.bottom);
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
    capsule: { left, right, bottom, top: bar.top + px(capsule.top), radius: capsule.borderRadius,
      background: capsule.backgroundColor, content: capsule.content },
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

        /* The capsule is drawn, inside the screen, lifted, and centred. */
        if (!m.capsule.content || m.capsule.content === 'none') fail('the capsule is drawn', at);
        else note('drawn');
        const lift = m.viewport.h - m.capsule.bottom;
        if (lift < LIFT_MIN) fail('the capsule is lifted off the bottom edge', `${at}: ${Math.round(lift)}px`);
        else note('lifted');
        if (m.capsule.left < GAP_MIN || m.viewport.w - m.capsule.right < GAP_MIN) fail('the capsule is inset from both sides', `${at}: ${Math.round(m.capsule.left)} / ${Math.round(m.viewport.w - m.capsule.right)}`);
        else note('inset');
        if (Math.abs(m.capsule.left - (m.viewport.w - m.capsule.right)) > 1) fail('the capsule is centred', `${at}: ${Math.round(m.capsule.left)} vs ${Math.round(m.viewport.w - m.capsule.right)}`);
        else note('centred');
        if (m.capsule.right - m.capsule.left > 431) fail('the capsule stops widening on a big phone', `${at}: ${Math.round(m.capsule.right - m.capsule.left)}px`);
        else note('capped');

        /* AN UNDEFINED TOKEN MAKES A BACKGROUND VANISH WITH NO ERROR. */
        const alpha = (m.capsule.background.match(/[\d.]+\s*\)$/) || ['1)'])[0];
        const transparent = /rgba?\([^)]*,\s*0\s*\)/.test(m.capsule.background) || m.capsule.background === 'transparent';
        if (transparent) fail('the capsule is opaque', `${at}: ${m.capsule.background}`);
        else note('opaque');
        /* AND NO BAND BEHIND IT. A strip of flat ground under a floating bar
           is a bar; its gradient edge crossing the capsule's rounded corners
           is what read as chipped. The gap shows the page. */
        if (/gradient|url\(/.test(m.scrim)) fail('nothing is painted behind the capsule', `${at}: ${m.scrim}`);
        else note('floating');
        if (!/rgba?\([^)]*,\s*0\s*\)/.test(m.navBackground)) fail('the bar itself paints no ground', `${at}: ${m.navBackground}`);
        else note('no band');

        /* Nothing tappable ends underneath it. */
        /* Nothing sits on top of the bar, and the page leaves room under its
           own content for the capsule to float over nothing but ground. */
        if (m.blocked) fail('every tab receives its own tap', `${at}: ${m.blocked} covered`);
        else note('tappable');
        const needed = m.viewport.h - m.capsule.top + 8;
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

console.log('\nThe capsule holds on every route, tone and width');
for (const [what, count] of seen) console.log(`  PASS  ${what} (${count} checks)`);
console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
