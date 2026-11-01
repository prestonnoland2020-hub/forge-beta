import type { ReactNode } from 'react';

/* ONE ICON SET, NO EMOJI. Emoji render as Apple's colour glyphs on the phone
   and as something else everywhere else, and text symbols (✓ → ★) sit at
   the font's weight rather than the interface's. These are the same 24px
   stroke drawings as the tab bar, so every mark in the app reads as one set
   and takes the colour of the text around it. */
const paths: Record<string, ReactNode> = {
  check: <path d="M5 12.5 10 17l9-10" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  down: <path d="M12 5v14M6 13l6 6 6-6" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  left: <path d="m15 5-7 7 7 7" />,
  right: <path d="m9 5 7 7-7 7" />,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4" /></>,
  star: <path d="m12 3.5 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8L12 3.5Z" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.4-4.4" /></>,
  expand: <path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" />,
  collapse: <path d="M4 14h6v6M10 14l-7 7M20 10h-6V4M14 10l7-7" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  external: <path d="M7 17 17 7M9 7h8v8" />,
  circle: <circle cx="12" cy="12" r="7.5" />,
  shield: <><path d="M12 3 5 6v5.5c0 4.4 3 7.9 7 9.5 4-1.6 7-5.1 7-9.5V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></>,
  bell: <><path d="M6 9.5a6 6 0 0 1 12 0c0 5.5 2.5 7.5 2.5 7.5h-17S6 15 6 9.5Z" /><path d="M10.3 20.5a2 2 0 0 0 3.4 0" /></>,
  watch: <><rect x="6.5" y="6.5" width="11" height="11" rx="3" /><path d="M9 6.5 9.5 3h5l.5 3.5M9 17.5l.5 3.5h5l.5-3.5M12 9.5V12l1.5 1.5" /></>,
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 16, stroke = 2.2, className }: { name: IconName; size?: number; stroke?: number; className?: string }) {
  return <svg className={`icon${className ? ` ${className}` : ''}`} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
