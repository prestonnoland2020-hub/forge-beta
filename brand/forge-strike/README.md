# Forge Strike

The Forge logo assembling itself. The two blue arms fly in along the 45° cut, the white wedge drops, the grey wedge rises, the long shadow falls and a glint crosses the tile. It's the same motion as the sign-in screen, packaged for loading screens.

| File | What it is |
| --- | --- |
| `forge-strike.css` | All the drawing and all the motion. Always include it. |
| `ForgeStrike.tsx` | React component. |
| `forge-strike.js` | `<forge-strike>` web component, for any page with no framework. |
| `demo.html` | Every mode side by side. Serve the folder and open it. |

## Modes

| `mode` | Use it for | What it does |
| --- | --- | --- |
| `once` (default) | Sign-in, splash | Assembles in about 1.1s, then holds still. |
| `loop` | Loading screens | Assembles once, then a glint crosses the tile every 1.8s. |
| `cycle` | Long waits | Assembles, holds and comes apart again every 2.6s. |

Other options:
- `size`: a px number or any CSS length, 96 by default. Everything scales from it.
- `wordmark`: `none`, `below` or `right`.
- `label`: what a screen reader hears. In `loop` and `cycle` the element is a polite live region that announces the label. In `once` the label is the logo's name.

## React

```tsx
import './forge-strike.css';
import { ForgeStrike } from './ForgeStrike';

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <ForgeStrike mode="loop" size={96} label="Loading your plan" />
    </div>
  );
}
```

To replay it, change the component's `key`.

## Plain HTML

```html
<link rel="stylesheet" href="forge-strike.css">
<script type="module" src="forge-strike.js"></script>

<forge-strike mode="loop" size="96" label="Loading"></forge-strike>
```

To replay it, call `document.querySelector('forge-strike').replay()`.

## Colours

Inside the Forge app, every colour comes from the theme tokens: `--accent`, `--mark-tile`, `--mark-face`, `--mark-shade`, `--mark-shadow` and `--ink`. Anywhere else, it falls back to the logo's own colours, so it needs no setup.

To override one spot, set the `--fs-*` versions on any parent element: `--fs-accent`, `--fs-tile`, `--fs-face`, `--fs-shade`, `--fs-shadow` or `--fs-ink`.

## Rules (from the motion spec)

- **On sign-in, play it once.** Use `loop` or `cycle` only while something is actually loading.
- **Never make anyone wait for the animation.** When the content is ready, swap it in, even mid-animation. A 150–200ms fade out of the loader is enough.
- **Reduced motion is handled.** Under `prefers-reduced-motion: reduce`, the finished mark shows, still.
- **Keep everything moving along the logo's own lines,** 45° and vertical. Don't spin it or bounce it.
