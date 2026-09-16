/* "NAVIGATION BAR STILL CHOPPED" — after the band came off and the pin held.

   The whole bottom bar is measured from one number, env(safe-area-inset-bottom),
   and the layout is right for every value of it except the wrong one. An
   iPhone running this from the home screen puts the home-indicator strip
   inside the layout viewport and is supposed to report it; in standalone mode
   with a translucent status bar — this app's exact configuration — it can
   report nothing, and then the 12px floor is all the lift there is and the
   bottom of a 50px capsule hangs off the screen.

   The visual viewport cannot tell us: it agrees with the layout viewport here,
   which is why pinChrome correctly does nothing. CSS cannot tell us either,
   because the inset IS the signal. So the app measures it and falls back only
   in the one case that warrants it. These checks are that rule, and the
   guarantee that it stays confined to that case. */
import { fallbackFor, HOME_INDICATOR, FALLBACK_VARIABLE } from './src/lib/homeIndicatorFallback.ts';
const insets = (top, bottom) => ({ top, bottom });
import { readFileSync } from 'node:fs';

let fails = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`);
  if (!ok) fails += 1;
};

console.log('\nA reported bottom inset always wins');
check('34 reported, standalone: believe it', fallbackFor(true, insets(47, 34)) === 0);
check('34 reported, browser tab: believe it', fallbackFor(false, insets(47, 34)) === 0);
check('even 8, because a device that answers knows', fallbackFor(true, insets(47, 8)) === 0);

console.log('\nA top inset with no bottom inset is a strip left unmentioned');
/* THE GATE THAT FAILED. The first version asked only whether the app was
   standalone. Preston's phone reported it was not - whatever shell he launches
   from answers to neither display-mode nor navigator.standalone - so the gate
   never opened and the bar stayed off the bottom of the screen. A device with
   a home indicator also has a notch, and reports a top inset for it. */
check('notched and silent about the bottom: stand in for the strip',
  fallbackFor(false, insets(47, 0)) === HOME_INDICATOR);
check('and it does not need the standalone flag to do it',
  fallbackFor(false, insets(59, 0)) === HOME_INDICATOR);
check('standalone still triggers it on its own',
  fallbackFor(true, insets(0, 0)) === HOME_INDICATOR);
check('a sub-pixel bottom counts as silence',
  fallbackFor(false, insets(47, 0.4)) === HOME_INDICATOR);

console.log('\nA device with no safe areas at all has no strip to clear');
check('no insets, no standalone: the 12px floor is right',
  fallbackFor(false, insets(0, 0)) === 0);
check('and the stand-in is the iPhone home indicator', HOME_INDICATOR === 34);

console.log('\nThe CSS asks for it the same way');
const theme = readFileSync('./src/forge-theme.css', 'utf8');
check('the floor reads the fallback variable',
  /--safe-b: max\(env\(safe-area-inset-bottom\), var\(--safe-b-fallback, 12px\)\);/.test(theme));
check('and the variable name matches the one script sets', FALLBACK_VARIABLE === '--safe-b-fallback');
check('a reported inset still wins, because max() takes the larger',
  /max\(env\(safe-area-inset-bottom\),/.test(theme));

console.log('\nIt is measured at startup and again when the phone turns');
const pin = readFileSync('./src/features/shell/pinChrome.ts', 'utf8');
check('measured before anything else', /if \(typeof window !== 'undefined'\) applyHomeIndicatorFallback\(\);/.test(pin));
const lib = readFileSync('./src/lib/homeIndicatorFallback.ts', 'utf8');
check('both insets are measured, from one probe', /probe\.style\.height = 'env\(safe-area-inset-bottom,0px\)';/.test(lib));
check('and the top one is read first', lib.indexOf('safe-area-inset-top') < lib.indexOf("probe.style.height = 'env(safe-area-inset-bottom"));
check('and re-measured on a rotation, because the strip moves',
  /const remeasure = \(\) => \{ applyHomeIndicatorFallback\(\); schedule\(\); \};/.test(pin)
  && /addEventListener\('orientationchange', remeasure\)/.test(pin));
check('and the listener is removed with the rest', /removeEventListener\('orientationchange', remeasure\)/.test(pin));
check('it does not ride on visualViewport existing',
  pin.indexOf('applyHomeIndicatorFallback()') < pin.indexOf('if (!viewport) return'));

console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
