/* "NAVIGATION BAR STILL CHOPPED."

   The capsule's bottom edge is off the bottom of the screen on Preston's
   phone, with the band gone and the pin working. Everything about the bar is
   measured from one number — env(safe-area-inset-bottom) — and the layout is
   correct for every value of it except the wrong one.

   A fixed element sits on the LAYOUT viewport, and on an iPhone running a web
   app from the home screen that viewport is the whole window, home-indicator
   strip included. The strip is not part of what you can usefully see; iOS is
   supposed to tell the page how much to keep clear, and the whole bottom bar
   is built on being told. When the answer comes back 0 — a long-standing iOS
   bug in standalone mode with a translucent status bar, which is exactly this
   app's configuration — a 12px floor is all the lift there is, and about
   twenty pixels of a fifty-pixel capsule hang off the bottom of the screen.

   The visual viewport cannot help: it agrees with the layout viewport here, so
   pinChrome is right to do nothing. Nothing in CSS can tell the difference
   either, because the only signal IS the inset.

   So measure it. Render a probe whose height is the inset and read it back.

   THE FIRST VERSION OF THIS ASKED THE WRONG QUESTION. It gated the fallback on
   the app running standalone, read from `display-mode: standalone` and
   `navigator.standalone`. Preston's phone shipped it and nothing changed —
   whatever shell he launches from does not answer to either, so the gate never
   opened and the bar stayed off the bottom of the screen. Guessing at the
   display mode was a guess, and it was wrong.

   The device evidences itself instead. A phone with a home-indicator strip
   also has a notch or an island, and reports a TOP inset for it. So a top
   inset above zero with a bottom inset of zero is not a device without a
   strip — it is a device with a strip it declined to mention. That pairing is
   the whole test, it needs no display-mode guess, and it is exactly the state
   Preston is in: his header clears the status bar, so the top inset is being
   reported and honoured.

   In that case 34px — the iPhone home indicator — goes under the floor. Every
   other case keeps the 12px floor: a phone that reports its bottom inset keeps
   its own number, and a device that reports no insets at all has no strip to
   clear. A fixed 34px everywhere would have been a lie on three platforms to
   fix one. */

export const HOME_INDICATOR = 34;
export const FALLBACK_VARIABLE = '--safe-b-fallback';

export const isStandalone = (win: Window = window) =>
  Boolean(win.matchMedia?.('(display-mode: standalone)').matches
    || (win.navigator as Navigator & { standalone?: boolean }).standalone === true);

/* The probe is the only way to read a resolved env() value: it is not exposed
   to script, and getComputedStyle on a property that uses it gives the
   unresolved text back. */
export type Insets = { top: number; bottom: number };

export function measuredInsets(doc: Document = document): Insets {
  const probe = doc.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:1px;visibility:hidden;pointer-events:none;height:env(safe-area-inset-top,0px)';
  doc.body.appendChild(probe);
  const top = probe.getBoundingClientRect().height;
  probe.style.height = 'env(safe-area-inset-bottom,0px)';
  const bottom = probe.getBoundingClientRect().height;
  probe.remove();
  return { top, bottom };
}

/* THE RULE, ON ITS OWN, so it can be tested without a browser.

   A reported bottom inset always wins, however small, because a device that
   answers is a device that knows. Otherwise the strip is assumed present when
   EITHER the device reported a top inset (it has safe areas, so a zero bottom
   is not credible) or the app is running standalone by a display mode we can
   actually read. The second is now a bonus rather than the gate. */
export const fallbackFor = (standalone: boolean, insets: Insets) =>
  insets.bottom < 1 && (insets.top > 0 || standalone) ? HOME_INDICATOR : 0;

export function applyHomeIndicatorFallback(win: Window = window): void {
  const root = win.document.documentElement;
  const fallback = fallbackFor(isStandalone(win), measuredInsets(win.document));
  if (fallback) root.style.setProperty(FALLBACK_VARIABLE, `${fallback}px`);
  else root.style.removeProperty(FALLBACK_VARIABLE);
}
