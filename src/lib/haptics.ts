/* THE TAP YOU CAN FEEL. A selection that answers with a click under the thumb
   reads as a real app; one that only changes colour reads as a web page.

   Three kinds, matching what iOS itself uses them for:
     tap()     — choosing something (a card, a chip, a toggle)
     success() — finishing something (setup done, a set saved)
     warning() — being stopped (a required field still empty)

   In the iOS shell these go through Capacitor's Haptics plugin to the Taptic
   Engine. The plugin is reached through the bridge rather than imported, so
   the web build carries no native dependency and simply does nothing where
   there is no engine — Android browsers get a short vibration instead.
   Never awaited and never thrown: a missing buzz must not break a button. */
type Bridge = { Plugins?: { Haptics?: {
  impact?: (options: { style: 'LIGHT' | 'MEDIUM' | 'HEAVY' }) => Promise<void>;
  notification?: (options: { type: 'SUCCESS' | 'WARNING' | 'ERROR' }) => Promise<void>;
} } };

const native = () => (globalThis as { Capacitor?: Bridge }).Capacitor?.Plugins?.Haptics;
const buzz = (pattern: number | number[]) => { try { navigator.vibrate?.(pattern); } catch { /* not supported */ } };

export function tap() {
  const haptics = native();
  if (haptics?.impact) { haptics.impact({ style: 'LIGHT' }).catch(() => {}); return; }
  buzz(8);
}

export function success() {
  const haptics = native();
  if (haptics?.notification) { haptics.notification({ type: 'SUCCESS' }).catch(() => {}); return; }
  buzz([12, 60, 18]);
}

export function warning() {
  const haptics = native();
  if (haptics?.notification) { haptics.notification({ type: 'WARNING' }).catch(() => {}); return; }
  buzz([20, 40, 20]);
}
