import { bottomChromeTransform, topChromeTransform } from '../../lib/visualViewportChrome';

/* KEEP THE CHROME ON THE PART OF THE PAGE THE ATHLETE CAN SEE.

   The maths and the reasoning are in lib/visualViewportChrome. This is the
   thirty lines that feed it the live viewport and write the answer into two
   custom properties, so the CSS stays declarative.

   Everything is guarded: no visualViewport — every desktop browser before
   2019, and some embedded webviews — means no listeners and no transforms, and
   the app behaves exactly as it did. */
export function pinChromeToVisualViewport(): () => void {
  const viewport = typeof window !== 'undefined' ? window.visualViewport : undefined;
  if (!viewport) return () => undefined;
  const root = document.documentElement;
  let queued = 0;

  const apply = () => {
    queued = 0;
    const layoutHeight = root.clientHeight;
    const shape = {
      offsetLeft: viewport.offsetLeft, offsetTop: viewport.offsetTop,
      height: viewport.height, scale: viewport.scale,
    };
    const bottom = bottomChromeTransform(shape, layoutHeight);
    root.style.setProperty('--chrome-pin-bottom', bottom);
    root.style.setProperty('--chrome-pin-top', topChromeTransform(shape, layoutHeight));
    /* A class as well as the variables, so a rule can do more than translate:
       a hairline on a bar scaled to 0.4 needs to stop being a hairline. */
    root.classList.toggle('chrome-unpinned', bottom !== 'none');
  };
  /* ONE WRITE PER FRAME. visualViewport fires scroll on every pixel of a pinch,
     and a transform written from the event handler is a transform written
     mid-gesture — which is how this kind of code becomes the jank it fixed. */
  const schedule = () => { if (!queued) queued = requestAnimationFrame(apply); };

  viewport.addEventListener('resize', schedule);
  viewport.addEventListener('scroll', schedule);
  window.addEventListener('orientationchange', schedule);
  apply();
  return () => {
    viewport.removeEventListener('resize', schedule);
    viewport.removeEventListener('scroll', schedule);
    window.removeEventListener('orientationchange', schedule);
    if (queued) cancelAnimationFrame(queued);
    root.style.removeProperty('--chrome-pin-bottom');
    root.style.removeProperty('--chrome-pin-top');
    root.classList.remove('chrome-unpinned');
  };
}
