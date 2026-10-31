import { applyHomeIndicatorFallback } from '../../lib/homeIndicatorFallback';

/* THE CHROME BEHAVES LIKE AN APP'S, NOT A WEB PAGE'S.

   This replaces pinChrome, which re-positioned the tab bar and header every
   frame from the visual viewport so they would survive a pinch. On iOS that
   rectangle also moves during the scroll bounce and while the keyboard opens
   — and the shell resizes the page for the keyboard as well — so the bar was
   moved twice and stayed where the last frame left it: a third of the way up
   the screen, with a black strip under it. Preston's "it freezes and sticks".

   A native app does neither thing. Its tab bar is fixed to the bottom of the
   screen, full stop, and it steps out of the way while the keyboard is up.
   So that is all this does:

     keyboard  — html.keyboard-open while a text field has focus (and between
                 Capacitor's keyboardWillShow/Hide on a device), which the tab
                 bar and the floating coach button read to slide away.
     status    — the status bar's text follows the theme, so the clock is dark
                 on a light screen and light on a dark one. In the web build
                 there is no status bar to set and this is a no-op.
     inset     — the home-indicator fallback pinChrome used to apply. */
type StatusBarBridge = { setStyle?: (options: { style: 'DARK' | 'LIGHT' }) => Promise<void> };
const statusBar = () => (globalThis as { Capacitor?: { Plugins?: { StatusBar?: StatusBarBridge } } }).Capacitor?.Plugins?.StatusBar;

const isTextEntry = (element: EventTarget | null) => {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return true;
  if (!(element instanceof HTMLInputElement)) return false;
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image'].includes(element.type);
};

/* The keyboard is up only while a text field really has focus. Called on
   every screen change, because a focused field that is removed from the page
   never fires focusout and the class would otherwise stay on — the tab bar
   hidden and untappable until the app was restarted. */
export function syncKeyboardState(): void {
  if (typeof document === 'undefined') return;
  if (!isTextEntry(document.activeElement)) document.documentElement.classList.remove('keyboard-open');
}

export function startNativeChrome(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  applyHomeIndicatorFallback();
  const root = document.documentElement;

  /* Focus leaves one field for the next on every "next" key; the class must
     not flicker off and back on between them, or the bar bobs. */
  let blurTimer = 0;
  const setKeyboard = (open: boolean) => { window.clearTimeout(blurTimer); root.classList.toggle('keyboard-open', open); };
  const onFocusIn = (event: FocusEvent) => { if (isTextEntry(event.target)) setKeyboard(true); };
  const onFocusOut = () => { blurTimer = window.setTimeout(() => { if (!isTextEntry(document.activeElement)) setKeyboard(false); }, 120); };
  const onShow = () => setKeyboard(true);
  const onHide = () => setKeyboard(false);
  /* Same check on any touch while the class is on: a sheet with a field in it
     can close without a screen change, and the next touch brings the bar back. */
  const onTouch = () => { if (root.classList.contains('keyboard-open')) syncKeyboardState(); };

  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  const syncStatusBar = () => {
    const theme = root.dataset.theme;
    const dark = theme ? theme === 'dark' : Boolean(media?.matches);
    /* Capacitor names the style by the BACKGROUND it suits: DARK is light
       text for a dark screen. */
    statusBar()?.setStyle?.({ style: dark ? 'DARK' : 'LIGHT' }).catch(() => {});
  };
  const themeObserver = new MutationObserver(syncStatusBar);
  themeObserver.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  media?.addEventListener?.('change', syncStatusBar);
  syncStatusBar();

  const remeasure = () => applyHomeIndicatorFallback();
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);
  document.addEventListener('touchstart', onTouch, { passive: true });
  window.addEventListener('keyboardWillShow', onShow);
  window.addEventListener('keyboardWillHide', onHide);
  window.addEventListener('orientationchange', remeasure);
  return () => {
    window.clearTimeout(blurTimer);
    themeObserver.disconnect();
    media?.removeEventListener?.('change', syncStatusBar);
    document.removeEventListener('focusin', onFocusIn);
    document.removeEventListener('focusout', onFocusOut);
    document.removeEventListener('touchstart', onTouch);
    window.removeEventListener('keyboardWillShow', onShow);
    window.removeEventListener('keyboardWillHide', onHide);
    window.removeEventListener('orientationchange', remeasure);
    root.classList.remove('keyboard-open');
  };
}
