import { useEffect, useMemo, useRef, useState } from 'react';
import { tap } from '../lib/haptics';

/* NUMBERS ARE PICKED, NOT TYPED. A keyboard for a barbell load is the wrong
   instrument: it covers half the screen, offers 40 characters when 12 are
   plausible, and invites the typo that turns 225 into 2250 — a number Forge
   would then treat as a calculated max and program from.

   A wheel offers only real values. It knows a barbell moves in fives, that
   reps are whole numbers, that a run is measured to a tenth of a mile, and
   that a rep count of 400 does not exist. The athlete spins to the value and
   confirms; nothing else can be entered.

   One dial, used everywhere a number is entered. Each caller states what kind
   of number it wants and the dial does the rest. */

export type DialKind = 'weight' | 'bodyweight' | 'reps' | 'distance' | 'minutes' | 'seconds' | 'clock' | 'days' | 'count';

type Column = { values: number[]; suffix?: string; label?: string };

/* The plausible range and step for each kind of number Forge asks for.
   Deliberately generous at the top — an athlete pulling 700 exists; a
   700-rep set does not. */
const COLUMNS: Record<DialKind, (unit?: string) => Column[]> = {
  /* A WEIGHT IS TWO WHEELS, NOT ONE LONG ONE. Nought to nine hundred in fives
     is a hundred and eighty values — reaching 315 meant a spin long enough to
     be worse than typing. Hundreds on the left, the remainder on the right,
     so any load in the range is two short flicks: 3, then 15. */
  /* ONE WHEEL, IN PLATE STEPS. Two wheels (hundreds + remainder) with
     nudge buttons and preset chips was four controls for one number; the
     wheel opens on the current value, so the load is a short flick away. */
  weight: unit => [{ values: range(0, unit === 'kg' ? 400 : 900, unit === 'kg' ? 2.5 : 5), suffix: unit || 'lb' }],
  /* A body weight moves by ones, not fives — 187 is a real weigh-in and the
     barbell's five-pound plates have nothing to do with it. */
  bodyweight: unit => [{ values: range(unit === 'kg' ? 30 : 60, unit === 'kg' ? 300 : 600, 1), suffix: unit || 'lb' }],
  reps: () => [{ values: range(1, 50, 1), suffix: 'reps' }],
  /* Miles to a hundredth: the whole part and the fraction are separate
     wheels, exactly as a distance is read aloud. */
  distance: unit => isShortUnit(unit)
    /* Metres and yards are counted in whole steps — a 2000 m row, a 400 m
       rep — and never had a place on a 0–100 wheel with decimals. */
    ? [{ values: range(0, 10000, 25) }, { values: [] }, { values: [], suffix: unit }]
    : [
      { values: range(0, 100, 1) },
      { values: range(0, 99, 1), label: 'decimal' },
      { values: [], suffix: unit || 'mi' },
    ],
  minutes: () => [{ values: range(0, 300, 1), suffix: 'min' }],
  /* A duration is read as mm:ss, so it is picked as mm:ss. */
  clock: () => [{ values: range(0, 359, 1) }, { values: range(0, 59, 1), label: 'seconds' }],
  seconds: () => [{ values: range(0, 59, 1), suffix: 'sec' }],
  days: () => [{ values: range(1, 7, 1), suffix: 'days' }],
  count: () => [{ values: range(0, 100, 1) }],
};

const isShortUnit = (unit?: string) => /^(m|meters|metres|yd|yards)$/i.test(String(unit || ''));
function range(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let value = from; value <= to + 1e-9; value += step) out.push(Math.round(value * 100) / 100);
  return out;
}

/* Every size in the wheel derives from this one number, in CSS as well
   (--dial-item), so the band, the pads and the snap points cannot drift
   apart — they did: the band sat a few pixels off the selected value. */
const ITEM_HEIGHT = 52;

/* One spinning column. Scroll snapping does the physics; the browser is far
   better at inertial scrolling than any hand-rolled drag handler. */
function Wheel({ values, selected, onSelect, format }: {
  values: number[]; selected: number; onSelect: (value: number) => void; format?: (value: number) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<number>(0);
  const index = Math.max(0, values.indexOf(selected));

  /* Open on the current value rather than at zero — and follow it after
     that, so a tap on +5 or a preset turns the wheel to the new value instead
     of leaving it showing the old one. */
  const mounted = useRef(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const target = index * ITEM_HEIGHT;
    if (!mounted.current) { node.scrollTop = target; mounted.current = true; return; }
    if (Math.abs(node.scrollTop - target) > 2) node.scrollTo({ top: target, behavior: 'smooth' });
  }, [index]);

  const onScroll = () => {
    const node = ref.current;
    if (!node) return;
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      const nearest = Math.round(node.scrollTop / ITEM_HEIGHT);
      const value = values[Math.max(0, Math.min(values.length - 1, nearest))];
      /* A click under the thumb for each value the wheel lands on, the way
         an iOS picker ticks. */
      if (value !== undefined && value !== selected) { tap(); onSelect(value); }
    }, 90);
  };

  return <div className="dial-wheel" ref={ref} onScroll={onScroll} role="listbox" tabIndex={0}>
    <div className="dial-pad" />
    {values.map(value => <button
      type="button"
      key={value}
      className={value === selected ? 'dial-value active' : 'dial-value'}
      role="option"
      aria-selected={value === selected}
      onClick={() => { onSelect(value); ref.current?.scrollTo({ top: values.indexOf(value) * ITEM_HEIGHT, behavior: 'smooth' }); }}
    >{format ? format(value) : value}</button>)}
    <div className="dial-pad" />
  </div>;
}

/* THE DIAL OPENS WHERE THE FIELD IS. Seeded in an effect, the wheels mounted
   at zero and scrolled there before the real value arrived — so a 190 lb
   body weight opened the wheel at 0 with "190 lb" written above it. The sheet
   is a separate component now, mounted fresh each time it opens, with its
   starting position computed BEFORE the wheels render. */
export function NumberDial({ open, kind, unit, title, value, onCancel, onConfirm }: {
  open: boolean; kind: DialKind; unit?: string; title: string; value: string;
  onCancel: () => void; onConfirm: (value: string) => void;
}) {
  if (!open) return null;
  return <DialSheet kind={kind} unit={unit} title={title} value={value} onCancel={onCancel} onConfirm={onConfirm} />;
}

function DialSheet({ kind, unit, title, value, onCancel, onConfirm }: {
  kind: DialKind; unit?: string; title: string; value: string;
  onCancel: () => void; onConfirm: (value: string) => void;
}) {
  const columns = useMemo(() => COLUMNS[kind](unit), [kind, unit]);
  /* An empty field opens somewhere a person actually is — an empty body
     weight opened the wheel at its 60 lb floor, an empty load at an empty bar. */
  const emptyStart: Partial<Record<DialKind, number>> = unit === 'kg' ? { weight: 60, bodyweight: 80, reps: 5 } : { weight: 135, bodyweight: 180, reps: 5 };
  const numeric = Number(value) || (value ? 0 : emptyStart[kind] || 0);
  const [whole, setWhole] = useState(() => {
    if (kind === 'distance' && isShortUnit(unit)) return Math.round(numeric / 25) * 25;
    if (kind === 'distance') return Math.floor(numeric);
    if (kind === 'clock') return Number(String(value || '').split(':')[0]) || 0;
    const values = COLUMNS[kind](unit)[0].values;
    /* Snap an existing odd value to the nearest offered one, so a 227 lb
       import does not open the wheel at zero. */
    return values.reduce((closest, item) => Math.abs(item - numeric) < Math.abs(closest - numeric) ? item : closest, values[0]);
  });
  const [fraction, setFraction] = useState(() => {
    if (kind === 'distance') return isShortUnit(unit) ? 0 : Math.round((numeric - Math.floor(numeric)) * 100);
    if (kind === 'clock') return Number(String(value || '').split(':')[1]) || 0;
    return 0;
  });

  const shown = kind === 'distance' ? (isShortUnit(unit) ? String(whole) : `${whole}.${String(fraction).padStart(2, '0')}`)
    : kind === 'clock' ? `${whole}:${String(fraction).padStart(2, '0')}`
    : String(whole);
  const confirm = () => onConfirm(kind === 'distance' ? String(Number(shown)) : shown);
  const suffix = kind === 'clock' ? 'min : sec' : kind === 'distance' ? (unit || 'mi') : kind === 'reps' ? (whole === 1 ? 'rep' : 'reps') : columns[0].suffix || unit || '';

  /* THE DIAL IS A PICKER, NOTHING ELSE. Cancel and Done where iOS puts them,
     the wheels, and the unit beside the selected value. The big readout,
     the plate nudges and the preset chips all said or did what the wheel
     already does. */
  /* Same rule as every other backdrop in the app: a click that started inside
     the sheet is never a click on the backdrop, whatever unmounts along the
     way. See the note in TopSetSheet for what the stopPropagation version
     costs. */
  return <div className="dial-backdrop" role="dialog" aria-modal="true" aria-label={title}
    onClick={event => { if (event.target === event.currentTarget) onCancel(); }}>
    <div className="dial-sheet dial-pro dial-simple">
      <span className="dial-grabber" aria-hidden="true" />
      <header className="dial-head">
        <button type="button" className="dial-cancel" onClick={onCancel}>Cancel</button>
        <strong>{title}</strong>
        <button type="button" className="dial-ok" onClick={() => { tap(); confirm(); }}>Done</button>
      </header>
      <div className="dial-columns" aria-live="polite">
        {/* The highlighted band is the selection, exactly as a picker reads. */}
        <div className="dial-band" aria-hidden="true" />
        {kind === 'clock'
          ? <>
              <Wheel values={columns[0].values} selected={whole} onSelect={setWhole} />
              <span className="dial-point">:</span>
              <Wheel values={columns[1].values} selected={fraction} onSelect={setFraction} format={item => String(item).padStart(2, '0')} />
            </>
          : kind === 'distance' && columns[1].values.length > 0
          ? <>
              <Wheel values={columns[0].values} selected={whole} onSelect={setWhole} />
              <span className="dial-point">.</span>
              <Wheel values={columns[1].values} selected={fraction} onSelect={setFraction} format={item => String(item).padStart(2, '0')} />
            </>
          : <Wheel values={columns[0].values} selected={whole} onSelect={setWhole} />}
        {suffix && <span className="dial-suffix">{suffix}</span>}
      </div>
    </div>
  </div>;
}

/* The field a caller places in a form: it shows the value, opens the dial on
   tap, and never raises a keyboard. */
/* An empty dial reads "Add", not 0: a grey zero in a field looks like a value
   someone entered, and nobody weighs 0 lb. */
export function DialField({ label, kind, unit, value, onChange, placeholder = 'Add', hint }: {
  label: string; kind: DialKind; unit?: string; value: string; onChange: (value: string) => void;
  placeholder?: string; hint?: string;
}) {
  const [open, setOpen] = useState(false);
  return <div className="dial-field">
    <span className="dial-field-label">{label}</span>
    <button type="button" className={value ? 'dial-field-button set' : 'dial-field-button'} onClick={() => setOpen(true)}>
      <b>{value || placeholder}</b>
      {unit ? <small>{unit}</small> : null}
    </button>
    {hint ? <small className="dial-field-hint">{hint}</small> : null}
    <NumberDial open={open} kind={kind} unit={unit} title={label} value={value}
      onCancel={() => setOpen(false)}
      onConfirm={next => { onChange(next); setOpen(false); }} />
  </div>;
}
