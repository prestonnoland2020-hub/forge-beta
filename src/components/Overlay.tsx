import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/* EVERY POP-UP RENDERS INTO <body>. A transform, filter, backdrop-filter or
   will-change on any card above a position:fixed sheet makes the sheet fixed
   to that card instead of the screen; on iPhone it then lands below the page
   and only its blurred backdrop shows. popupportal.mjs fails the build if a
   dialog skips this. */
export function Overlay({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}
