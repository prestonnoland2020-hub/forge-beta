/* <ForgeStrike /> — the Forge mark assembling, for sign-in and loading screens.

   Needs forge-strike.css imported once anywhere in the app.

     <ForgeStrike />                                   sign-in entrance, plays once
     <ForgeStrike mode="loop" label="Loading your plan" />   loading screen
     <ForgeStrike mode="cycle" size={160} wordmark="below" />  long wait / splash

   To play it again, change its React `key`. */
import type { CSSProperties } from 'react';

export type ForgeStrikeMode = 'once' | 'loop' | 'cycle';

type Props = {
  mode?: ForgeStrikeMode;
  /** Tile size: a number is px, a string is any CSS length. Default 96. */
  size?: number | string;
  wordmark?: 'none' | 'below' | 'right';
  /** What a screen reader hears. Loading modes announce it; 'once' names the logo with it. */
  label?: string;
  className?: string;
};

const TRACE = 'translate(-289,-339) translate(0,1254) scale(0.1,-0.1)';

/* brand/forge-logo.svg in its four facets, back to front. */
const FACETS = [
  { part: 'base', d: 'M5770 5109c-256-26-564-152-770-315-133-107-832-804-1165-1164-59-63-135-144-169-180-64-66-233-277-254-317-7-12-12-27-12-33l0-10 818 2 817 3 59 30c33 16 92 60 132 97l72 68 145 208c494 708 654 939 881 1272 184 270 194 283 261 315 30 15 55 28 55 30 0 5-810-1-870-6z' },
  { part: 'wedge', d: 'M3052 6408c-19-19-14-53 9-74 42-37 434-479 522-588 56-69 67-88 98-176l24-65 5-675 5-675 10 1c14 1 397 521 964 1309 476 661 641 897 641 915 0 9-5 21-12 28l-12 12-1121 0-1121 0-12-12z' },
  { part: 'arm2', d: 'M6250 6746c-26-6-63-22-83-35l-37-22-135-177c-74-97-180-235-235-307-55-71-269-353-476-625-207-272-407-533-444-580-37-47-188-245-336-440-148-195-291-385-319-421-27-36-122-160-209-275-88-115-195-254-239-309-110-137-113-144-21-45 153 165 815 847 951 981 195 191 355 331 449 391 125 80 331 163 507 205l112 26 825 6 825 6 65 23c36 13 97 42 135 64l70 41 96 96 95 96 66 105c35 58 176 283 313 500 384 613 405 647 405 667 0 10-5 24-12 31l-12 12-1155-1-1156 0-45-13z' },
  { part: 'arm1', d: 'M4599 8986c-101-29-204-92-281-170l-63-64-125-193c-323-504-502-780-725-1119-82-124-195-296-252-382-56-87-103-166-103-177 0-11 7-27 16-35l15-16 1063 0 1064 0 33 14c40 17 80 57 104 105 30 59 114 168 162 211 52 46 140 90 229 117l59 18 1505 5 1505 5 63 26c149 63 266 163 365 313 371 558 829 1273 835 1303l4 21-21 21-21 21-2677-1-2678 0-76-23z' },
];

export function ForgeStrike({ mode = 'once', size = 96, wordmark = 'none', label, className }: Props) {
  const loading = mode !== 'once';
  const name = label ?? (loading ? 'Loading' : 'Forge');
  const style = { '--fs-size': typeof size === 'number' ? `${size}px` : size } as CSSProperties;

  return (
    <div
      className={className ? `fs ${className}` : 'fs'}
      data-mode={mode}
      data-wordmark={wordmark}
      style={style}
      {...(loading ? { role: 'status', 'aria-live': 'polite' as const } : { role: 'img', 'aria-label': name })}
    >
      <span className="fs-tile" aria-hidden="true">
        <svg className="fs-shadow" viewBox="0 0 732 620">
          <g transform={TRACE}>{FACETS.map(({ part, d }) => <path key={part} d={d} />)}</g>
        </svg>
        <svg viewBox="0 0 732 620">
          {FACETS.map(({ part, d }) => (
            <g key={part} className={`fs-${part}`}>
              <g transform={TRACE}><path d={d} /></g>
            </g>
          ))}
        </svg>
        <i className="fs-glint" />
      </span>
      <span className="fs-word" aria-hidden="true">
        <span>F</span><span>O</span><span>R</span><span>G</span><span>E</span>
      </span>
      {loading && <span className="fs-label">{name}</span>}
    </div>
  );
}
