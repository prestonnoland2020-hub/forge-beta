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
   If the app is running standalone AND the inset came back as nothing, the
   strip is there and unreported, and 34px — the iPhone home indicator — is put
   under the floor for that case only. Every other case keeps the 12px floor:
   Safari reports its inset correctly, Android reports its own, a desktop has
   no strip to clear. A fixed 34px everywhere would have been a lie on three
   platforms to fix one. */

export const HOME_INDICATOR = 34;
export const FALLBACK_VARIABLE = '--safe-b-fallback';

export const isStandalone = (win: Window = window) =>
  Boolean(win.matchMedia?.('(display-mode: standalone)').matches
    || (win.navigator as Navigator & { standalone?: boolean }).standalone === true);

/* The probe is the only way to read a resolved env() value: it is not exposed
   to script, and getComputedStyle on a property that uses it gives the
   unresolved text back. */
export function measuredBottomInset(doc: Document = document): number {
  const probe = doc.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;visibility:hidden;pointer-events:none;height:env(safe-area-inset-bottom,0px)';
  doc.body.appendChild(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  return height;
}

/* THE RULE, ON ITS OWN, so it can be tested without a browser: a fallback is
   warranted only when the app is standalone and the inset it was given is
   nothing. A reported inset always wins, however small, because a device that
   answers is a device that knows. */
export const fallbackFor = (standalone: boolean, reportedInset: number) =>
  standalone && reportedInset < 1 ? HOME_INDICATOR : 0;

export function applyHomeIndicatorFallback(win: Window = window): void {
  const root = win.document.documentElement;
  const fallback = fallbackFor(isStandalone(win), measuredBottomInset(win.document));
  if (fallback) root.style.setProperty(FALLBACK_VARIABLE, `${fallback}px`);
  else root.style.removeProperty(FALLBACK_VARIABLE);
}
