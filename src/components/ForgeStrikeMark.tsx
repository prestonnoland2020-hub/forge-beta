/* THE FULL FACETED MARK, IN FOUR PIECES, SO IT CAN ASSEMBLE.

   Everywhere else the mark is a one-colour CSS mask (--forge-mark), which is
   right for chrome and wrong for an entrance: a mask is one shape and cannot
   come apart. This is brand/forge-logo.svg split into its four facets — lower
   wedge, upper wedge, middle arm, top arm — minus the hairline slivers the
   trace left behind, which are invisible at any size we draw this.

   Each facet's outer <g> sits OUTSIDE the trace's scale(0.1,-0.1), so a CSS
   translate on it moves in viewBox units, the right way up. Put the class on
   the inner group and every offset shrinks tenfold and flips vertically.

   Fills come from login-strike.css too (a var() in a presentation attribute
   is not reliably honoured), as does all of the motion. This file is only
   the drawing. */
export const TRACE = 'translate(-289,-339) translate(0,1254) scale(0.1,-0.1)';

export const FACETS = [
  { part: 'base', d: 'M5770 5109c-256-26-564-152-770-315-133-107-832-804-1165-1164-59-63-135-144-169-180-64-66-233-277-254-317-7-12-12-27-12-33l0-10 818 2 817 3 59 30c33 16 92 60 132 97l72 68 145 208c494 708 654 939 881 1272 184 270 194 283 261 315 30 15 55 28 55 30 0 5-810-1-870-6z' },
  { part: 'wedge', d: 'M3052 6408c-19-19-14-53 9-74 42-37 434-479 522-588 56-69 67-88 98-176l24-65 5-675 5-675 10 1c14 1 397 521 964 1309 476 661 641 897 641 915 0 9-5 21-12 28l-12 12-1121 0-1121 0-12-12z' },
  { part: 'arm2', d: 'M6250 6746c-26-6-63-22-83-35l-37-22-135-177c-74-97-180-235-235-307-55-71-269-353-476-625-207-272-407-533-444-580-37-47-188-245-336-440-148-195-291-385-319-421-27-36-122-160-209-275-88-115-195-254-239-309-110-137-113-144-21-45 153 165 815 847 951 981 195 191 355 331 449 391 125 80 331 163 507 205l112 26 825 6 825 6 65 23c36 13 97 42 135 64l70 41 96 96 95 96 66 105c35 58 176 283 313 500 384 613 405 647 405 667 0 10-5 24-12 31l-12 12-1155-1-1156 0-45-13z' },
  { part: 'arm1', d: 'M4599 8986c-101-29-204-92-281-170l-63-64-125-193c-323-504-502-780-725-1119-82-124-195-296-252-382-56-87-103-166-103-177 0-11 7-27 16-35l15-16 1063 0 1064 0 33 14c40 17 80 57 104 105 30 59 114 168 162 211 52 46 140 90 229 117l59 18 1505 5 1505 5 63 26c149 63 266 163 365 313 371 558 829 1273 835 1303l4 21-21 21-21 21-2677-1-2678 0-76-23z' },
];

export function ForgeStrikeMark() {
  return (
    <span className="strike-mark" aria-hidden="true">
      {/* The long shadow is the one-colour mask stepped out along 45° by a
          chain of drop-shadows; the filter sits on the wrapper because a
          mask is applied after its own element's filter and would cut the
          shadow off. */}
      <span className="strike-shadow"><i /></span>
      <svg viewBox="0 0 732 620">
        {FACETS.map(({ part, d }) => (
          <g key={part} className={`strike-${part}`}>
            <g transform={TRACE}><path d={d} /></g>
          </g>
        ))}
      </svg>
      <i className="strike-glint" />
    </span>
  );
}

/* THE MARK IN ITS OWN COLOURS, FOR THE HEADER. The one-colour mask read as a
   flat lime stamp, not the logo. This is the same four facets, still and
   coloured as the app icon is — blue arms, grey base, light wedge — with the
   wedge taking the ink colour so it holds on a white header too. Fills live
   in header.css (.forge-mark-*). */
export function ForgeMark() {
  return (
    <svg className="forge-mark-svg" viewBox="0 0 732 620" aria-hidden="true">
      {FACETS.map(({ part, d }) => (
        <g key={part} className={`forge-mark-${part}`}>
          <g transform={TRACE}><path d={d} /></g>
        </g>
      ))}
    </svg>
  );
}
