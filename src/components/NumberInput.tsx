import { useEffect, useState } from 'react';
import { normalizeNumericEntry, numericValue, numericDisplay } from '../lib/numberField';

/* THE FIELD THAT HOLDS TEXT AND REPORTS A NUMBER.

   Every numeric input in the app that was bound straight to a number had the
   same two bugs — a zero that cannot be deleted, and a typed number that
   lands behind it. See lib/numberField for both. This is the one place that
   behaviour lives, so the next numeric field somebody adds is right by
   default rather than right if they remember.

   It reports on every keystroke, like the inputs it replaces, so nothing
   downstream has to learn about blur. What it never reports is a number the
   athlete did not type: an emptied field is `null`, not zero, and the caller
   decides what an empty one means. */
export function NumberInput({ value, onChange, allowDecimal = true, blankZero = true, ...rest }: {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  allowDecimal?: boolean;
  /* Off for a field where zero is a real answer someone might mean. */
  blankZero?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  const [draft, setDraft] = useState(() => numericDisplay(value, blankZero));
  /* The draft follows the value when it is changed from OUTSIDE — a reset, a
     load from the server — but never re-formats what is being typed: "0."
     mid-decimal would be rewritten to "0" and the point could never be
     reached. A draft that already means the incoming value is left alone. */
  useEffect(() => {
    if (numericValue(draft) === (value ?? null)) return;
    setDraft(numericDisplay(value, blankZero));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <input
    {...rest}
    type="text"
    inputMode={allowDecimal ? 'decimal' : 'numeric'}
    value={draft}
    onChange={event => {
      const next = normalizeNumericEntry(event.target.value, allowDecimal);
      setDraft(next);
      onChange(numericValue(next));
    }}
  />;
}
