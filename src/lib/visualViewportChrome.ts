/* THE CHROME CAME OFF ITS RAIL, AND `position: fixed` WAS DOING WHAT IT SAYS.

   Preston screenshotted the FAQ with the bottom bar floating two thirds of the
   way up the screen, content running on beneath it, and the status bar sitting
   on the prose with no header in sight. Both pieces of chrome had stopped
   tracking the screen at the same moment, which is the tell: nothing was wrong
   with either one's own CSS.

   A fixed element is positioned against the LAYOUT viewport. On a desktop that
   is the window and the distinction never comes up. On a phone there are two
   viewports: the layout viewport, which is the page's idea of the window, and
   the VISUAL viewport, which is the part of it you can actually see. They are
   the same until something moves one of them — and on iOS three ordinary
   things do:

     PINCH OR DOUBLE-TAP ZOOM. The visual viewport becomes a window onto a
     larger layout viewport, and it pans inside it. Fixed chrome stays glued to
     the layout viewport, so it lands wherever that happens to be — which is
     exactly the screenshot, and it is the likeliest cause here because pinch
     zoom was deliberately RE-ENABLED in this app a fortnight ago (the viewport
     tag carried user-scalable=no, which took magnification away from everyone
     who needs it). The accessibility fix is right and stays; this is the other
     half of it.

     THE KEYBOARD. It shrinks the visual viewport and leaves the layout
     viewport alone, so a fixed bottom bar sits behind the keyboard.

     THE URL BAR collapsing and expanding, mid-scroll, on every scroll.

   So the chrome is re-anchored to the visual viewport when the two differ, and
   left completely alone when they do not — which is almost always, and is why
   this can be added without touching the normal case. The maths is here, as a
   pure function, because a transform that is wrong by a sign is a bar in the
   middle of the screen and that is the bug we are fixing. */

export type ViewportShape = {
  /* window.visualViewport: where the visible region sits inside the layout
     viewport, how big it is, and how far it is magnified. */
  offsetLeft: number;
  offsetTop: number;
  height: number;
  scale: number;
};

/* Below this the two viewports are the same to within a rounding error and no
   transform is applied at all. Sub-pixel scale drift is reported on some
   devices at rest, and a transform on the chrome is not free — it promotes a
   layer and creates a containing block. */
export const SCALE_EPSILON = 0.01;
export const OFFSET_EPSILON = 0.5;

export const viewportsAgree = (viewport: ViewportShape, layoutHeight: number) =>
  Math.abs(viewport.scale - 1) < SCALE_EPSILON
  && Math.abs(viewport.offsetLeft) < OFFSET_EPSILON
  && Math.abs(viewport.offsetTop) < OFFSET_EPSILON
  && Math.abs(viewport.height - layoutHeight) < 1;

/* WHAT TO ADD TO A BOTTOM-ANCHORED FIXED ELEMENT so it sits on the bottom edge
   of what the athlete can see, at the size they would see it unzoomed.

   The element's own box is at the foot of the layout viewport and as wide as
   it. Scaling by 1/scale about its top-left corner makes it the size it should
   appear at; the translation then carries that corner to the bottom-left of
   the visible region. Both are expressed in the element's own untransformed
   coordinates, which is why the scale divides into the offsets. */
/* AND IT MAY NEVER PUSH THE BAR DOWN. This clamp is the whole bug.

   The correction is offsetTop + height - layoutHeight, which is negative in
   every case it was written for: a zoomed or keyboard-shrunk visual viewport
   is SHORTER than the layout viewport, so the bar moves up to meet it. On
   Preston's phone it came out POSITIVE. A home-screen web app on iOS reports a
   documentElement.clientHeight that excludes the home-indicator strip while
   visualViewport.height includes the whole window, so the two disagree by the
   height of the strip in the other direction — and this function dutifully
   translated the tab bar DOWN by exactly that much, off the bottom of the
   screen.

   Which is why every fix failed. The capsule was chopped, and so was the
   full-bleed bar that replaced it, and so was every value of the safe-area
   floor: none of them were wrong, they were all being moved down afterwards.
   It also explains the one clue that made no sense — zoom in and the bar is
   right, because zooming makes the term negative again.

   A downward correction on bottom chrome is never right. The bar's job is to
   sit on the bottom edge of what the athlete can see; moving it further down
   than where CSS already put it can only hide it. So the correction may pull
   the bar up and may leave it alone, and that is all. */
export function bottomChromeTransform(viewport: ViewportShape, layoutHeight: number): string {
  if (viewportsAgree(viewport, layoutHeight)) return 'none';
  const scale = viewport.scale > 0 ? viewport.scale : 1;
  const x = viewport.offsetLeft;
  const y = Math.min(0, viewport.offsetTop + viewport.height - layoutHeight);
  if (y === 0 && Math.abs(x) < OFFSET_EPSILON && Math.abs(scale - 1) < SCALE_EPSILON) return 'none';
  return `translate(${round(x)}px, ${round(y)}px) scale(${round(1 / scale, 4)})`;
}

/* And for a top-anchored one — the header — which needs the top edge of the
   visible region rather than the bottom. */
export function topChromeTransform(viewport: ViewportShape, layoutHeight: number): string {
  if (viewportsAgree(viewport, layoutHeight)) return 'none';
  const scale = viewport.scale > 0 ? viewport.scale : 1;
  return `translate(${round(viewport.offsetLeft)}px, ${round(viewport.offsetTop)}px) scale(${round(1 / scale, 4)})`;
}

/* NO WIDTH OVERRIDE IS NEEDED, which is worth saying because the first cut of
   this had one and it was wrong. The bar is already as wide as the layout
   viewport; scaled by 1/scale it renders at layoutWidth / scale, and that is
   the visual viewport's width by definition. */

const round = (value: number, places = 2) => Math.round(value * 10 ** places) / 10 ** places;
