/* THE BOTTOM BAR TWO THIRDS OF THE WAY UP THE SCREEN.

   Preston's FAQ screenshot: the navigation floating mid-page with content
   running on beneath it, the status bar sitting on the prose, and no header at
   all. Both pieces of chrome had stopped tracking the screen at the same
   moment, which is the tell — nothing was wrong with either one's own CSS.

   A `position: fixed` element is positioned against the LAYOUT viewport. On a
   phone that is not the part of the page you can see: pinch or double-tap
   zoom, the keyboard, and the URL bar each move the VISUAL viewport inside the
   layout one, and fixed chrome stays glued to the layout viewport. Pinch zoom
   was deliberately re-enabled in this app a fortnight ago — the viewport tag
   carried user-scalable=no, which took magnification away from everyone who
   needs it — so this is the other half of that fix.

   Every check here is on the maths, because a transform that is wrong by a
   sign is a bar in the middle of the screen, which is the bug. */
import { bottomChromeTransform, topChromeTransform, viewportsAgree,
  SCALE_EPSILON, OFFSET_EPSILON } from './src/lib/visualViewportChrome.ts';

let fails = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`);
  if (!ok) fails += 1;
};
const LAYOUT = 844;
const rest = { offsetLeft: 0, offsetTop: 0, height: LAYOUT, scale: 1 };
/* Read the numbers back out of the transform string so the assertions are
   about the geometry and not about how it was spelled. */
const parse = (text) => {
  if (text === 'none') return null;
  const move = text.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/);
  const scale = text.match(/scale\(([\d.]+)\)/);
  return { x: Number(move[1]), y: Number(move[2]), scale: Number(scale[1]) };
};

console.log('\nAt rest it does nothing at all, which is the normal case');
/* This ships to every user on every screen. A transform on the chrome is not
   free — it promotes a layer and creates a containing block — so the path
   taken 99% of the time has to be the empty one. */
check('the two viewports agree', viewportsAgree(rest, LAYOUT));
check('and the transform is the keyword none', bottomChromeTransform(rest, LAYOUT) === 'none',
  bottomChromeTransform(rest, LAYOUT));
check('the header too', topChromeTransform(rest, LAYOUT) === 'none');
/* Some devices report a scale of 1.0000001 sitting still. */
check('a rounding error is not a zoom',
  bottomChromeTransform({ ...rest, scale: 1 + SCALE_EPSILON / 2 }, LAYOUT) === 'none');
check('nor is a sub-pixel offset',
  bottomChromeTransform({ ...rest, offsetTop: OFFSET_EPSILON / 2 }, LAYOUT) === 'none');

console.log('\nZoomed in, the bar comes back to the bottom of what you can see');
/* HIS SCREENSHOT, IN NUMBERS. Pinched to 2x and panned down the FAQ: the
   visible region is 422 tall and sits 300 into an 844-tall layout viewport, so
   the bar — glued to 844 — was 122px BELOW the visible bottom edge of 722,
   which is how it ends up drawn across the middle of the content. */
const zoomed = { offsetLeft: 0, offsetTop: 300, height: 422, scale: 2 };
const bar = parse(bottomChromeTransform(zoomed, LAYOUT));
check('it is moved up, not down', bar.y < 0, String(bar.y));
check('by exactly the gap between the two bottom edges', bar.y === 300 + 422 - 844, String(bar.y));
check('and drawn at half size, so it looks the size it always does', bar.scale === 0.5, String(bar.scale));
/* Scaled by 1/2 about its own top-left, a bar as wide as the 844-tall layout
   viewport renders at half the layout width — which IS the visible width when
   you are zoomed to 2x. No width override, and the first cut of this had one. */
check('its width needs no correction', !/width/.test(bottomChromeTransform(zoomed, LAYOUT)));

console.log('\nAnd it follows a pan sideways as well as down');
const panned = parse(bottomChromeTransform({ ...zoomed, offsetLeft: 90 }, LAYOUT));
check('it tracks the horizontal offset', panned.x === 90, String(panned.x));
check('while the vertical is unchanged', panned.y === bar.y);

console.log('\nThe header is the same problem at the other edge');
const head = parse(topChromeTransform(zoomed, LAYOUT));
check('it moves DOWN to the top of the visible region', head.y === 300, String(head.y));
check('not up, which is where the bottom bar goes', head.y > 0 && bar.y < 0);
check('at the same scale', head.scale === bar.scale);

console.log('\nThe keyboard is the same problem again, with no zoom in it');
/* The keyboard shrinks the visual viewport and leaves the layout viewport
   alone, so a bottom bar sits behind the keyboard at full size. */
const keyboard = { offsetLeft: 0, offsetTop: 0, height: 480, scale: 1 };
const lifted = parse(bottomChromeTransform(keyboard, LAYOUT));
check('the bar lifts clear of it', lifted.y === 480 - 844, String(lifted.y));
check('and is not resized, because nothing is magnified', lifted.scale === 1, String(lifted.scale));

console.log('\nNothing it is handed can make it produce a broken transform');
check('a scale of zero does not divide by zero',
  parse(bottomChromeTransform({ ...zoomed, scale: 0 }, LAYOUT)).scale === 1);
check('a negative scale is not honoured',
  parse(bottomChromeTransform({ ...zoomed, scale: -2 }, LAYOUT)).scale === 1);
check('and every number in it is finite',
  Object.values(parse(bottomChromeTransform(zoomed, LAYOUT))).every(Number.isFinite));

console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
