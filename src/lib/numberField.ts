/* A NUMBER FIELD YOU CAN ACTUALLY TYPE IN.

   The pattern was `value={someNumber}` with `onChange={... Number(e.target.value)}`,
   and it has two failures that together make the field almost unusable:

     THE ZERO CANNOT BE CLEARED. Select it, delete it, and the change handler
     runs Number('') — which is 0 — so the field puts the zero straight back.
     There is no keystroke that empties it.

     AND YOUR NUMBER LANDS BEHIND IT. With a "0" sitting in the box, a tap
     often puts the caret before it rather than after, so typing 45 gives
     "045" — and on the fields where the value is re-parsed it gives 450.
     Preston: "a bunch of numerical inputs wont let you input a numver without
     a 0 before it".

   The fix is to stop pretending the input holds a number. An input holds text;
   the text is turned into a number when it is worth turning. So the field
   keeps a DRAFT string, empties itself when the value is zero and nothing has
   been typed, and drops a leading zero as it is typed over rather than after
   the fact.

   The parsing is here, as a pure function, because "what should this text
   become" is the whole of the bug. */

/* What the athlete may type. Digits, one decimal point, and nothing else —
   a minus sign has no meaning on a weight, a mileage or a rep count, and
   allowing 'e' lets "2e9" through as two billion. */
export const NUMERIC_ENTRY = /[^\d.]/g;

/** Clean a keystroke-by-keystroke entry without fighting the person typing. */
export function normalizeNumericEntry(raw: string, allowDecimal = true): string {
  let text = String(raw ?? '').replace(NUMERIC_ENTRY, '');
  if (!allowDecimal) text = text.replace(/\./g, '');
  /* One decimal point. The second one is a typo, not a number. */
  const first = text.indexOf('.');
  if (first !== -1) text = `${text.slice(0, first + 1)}${text.slice(first + 1).replace(/\./g, '')}`;
  /* LEADING ZEROES GO AS THEY ARE TYPED OVER, not on blur — "045" has to
     become "45" while the caret is still after the 5, or the next keystroke
     makes it "0456". "0" itself stays, and so does "0." on the way to "0.5":
     eating those would make a decimal impossible to type. */
  if (/^0\d/.test(text)) text = text.replace(/^0+(?=\d)/, '');
  return text;
}

/** The number a draft stands for, or null when it stands for nothing yet. */
export function numericValue(text: string): number | null {
  const cleaned = normalizeNumericEntry(text);
  if (!cleaned || cleaned === '.') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/* WHAT AN EXISTING VALUE LOOKS LIKE IN THE BOX. Zero is shown as an empty
   field: a zero mileage is not a fact about the athlete, it is the absence of
   one, and printing it is what put the character in the way. */
export function numericDisplay(value: number | null | undefined, blankZero = true): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  if (value === 0 && blankZero) return '';
  return String(Math.round(value * 1000) / 1000);
}
