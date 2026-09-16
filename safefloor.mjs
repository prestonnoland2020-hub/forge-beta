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
import { readFileSync } from 'node:fs';

let fails = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`);
  if (!ok) fails += 1;
};

console.log('\nThe fallback applies to one case and no other');
check('standalone, and told nothing: stand in for the strip', fallbackFor(true, 0) === HOME_INDICATOR);
check('standalone, and told something: believe it', fallbackFor(true, 34) === 0);
check('even something small, because a device that answers knows', fallbackFor(true, 8) === 0);
check('in a browser tab, told nothing: the 12px floor is right', fallbackFor(false, 0) === 0);
check('in a browser tab, told something: also right', fallbackFor(false, 34) === 0);
check('a sub-pixel answer counts as nothing', fallbackFor(true, 0.4) === HOME_INDICATOR);
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
check('and re-measured on a rotation, because the strip moves',
  /const remeasure = \(\) => \{ applyHomeIndicatorFallback\(\); schedule\(\); \};/.test(pin)
  && /addEventListener\('orientationchange', remeasure\)/.test(pin));
check('and the listener is removed with the rest', /removeEventListener\('orientationchange', remeasure\)/.test(pin));
check('it does not ride on visualViewport existing',
  pin.indexOf('applyHomeIndicatorFallback()') < pin.indexOf('if (!viewport) return'));

console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
