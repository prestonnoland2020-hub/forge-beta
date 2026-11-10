import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { DialField } from './NumberDial';
import type { LibraryExercise } from '../features/training/TrainingLibraryProvider';
import { calculateEstimatedOneRepMax } from '../lib/strength';
import { SearchField } from './SearchField';

/* ADDING A TOP SET IS ONE ANSWER, NOT A SCAVENGER HUNT.

   "Add another top set" was a disclosure holding two dependent dropdowns:
   choose a muscle group — from the SPLIT DAY's muscles only — and then choose
   an exercise mapped to it. Both lists came from the day. So on a day whose
   muscles did not cover the lift, or a fresh day with no muscles picked yet,
   the second list was empty and there was no way through: the athlete had done
   a set and the app had no way to hear about it. There was no path at all to a
   lift that was not already in the library, which is exactly when someone
   needs one.

   It is one sheet now, taking over the screen like the rest of Forge's
   answers. Type the exercise. If it is in the library, tap it; if it is not,
   the first row offers to create it, and the muscle chips appear because a new
   exercise needs a mapping — that mapping is what makes future split
   recommendations right. Then the weight, the reps, and save.

   The muscle groups are the athlete's whole list, never the day's. A day's
   mapping is Forge's guess at what someone will train, and a guess must not be
   the reason a real set cannot be logged. */

export const STRENGTH_MUSCLES = ['Chest', 'Back', 'Shoulders', 'Quads', 'Hamstrings', 'Glutes', 'Biceps', 'Triceps', 'Forearms', 'Abs'];

export type TopSetDraft = { lift: string; muscles: string[]; isNew: boolean; weight: number; reps: number };

const norm = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

export function TopSetSheet({ unit, exercises, suggested, dayMuscles, existing, onClose, onSave, blockedReason = '' }: {
  unit: string;
  exercises: LibraryExercise[];
  suggested: string[];
  dayMuscles: string[];
  existing: string[];
  onClose: () => void;
  onSave: (draft: TopSetDraft) => void;
  /* Set when the day has no label yet: a top set has nothing to attach to. */
  blockedReason?: string;
}) {
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<LibraryExercise | null>(null);
  const [newName, setNewName] = useState('');
  const [muscles, setMuscles] = useState<string[]>([]);
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const search = useRef<HTMLInputElement>(null);
  /* OPENS AND CLOSES ON A TRANSITION, NOT A KEYFRAME. A transition can be
     reversed from wherever it is, so a sheet dismissed while it is still
     rising goes straight back down instead of finishing the rise first.
     The parent unmounts it only once it is off screen. */
  const [shown, setShown] = useState(false);
  const closing = useRef(false);
  useEffect(() => { const frame = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(frame); }, []);
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    setShown(false);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(onClose, reduce ? 0 : 360);
  }, [onClose]);
  /* Combobox: the highlighted row, moved with the arrow keys. */
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);
  useEffect(() => { search.current?.focus(); }, []);

  const lift = chosen?.name || newName;
  const isNew = Boolean(newName) && !chosen;
  const typed = query.trim();

  /* The day's own exercises rank first — most sets are one of those — but
     nothing is hidden, because a set that happened is a set that happened. */
  const matches = useMemo(() => {
    const wanted = norm(typed);
    const scored = exercises
      .filter(exercise => !wanted || norm(exercise.name).includes(wanted))
      .sort((a, b) => {
        const suggestedRank = Number(suggested.includes(b.name)) - Number(suggested.includes(a.name));
        if (suggestedRank) return suggestedRank;
        const starts = Number(norm(b.name).startsWith(wanted)) - Number(norm(a.name).startsWith(wanted));
        return starts || a.name.localeCompare(b.name);
      });
    return scored.slice(0, 8);
  }, [exercises, typed, suggested]);

  const exactMatch = exercises.find(exercise => norm(exercise.name) === norm(typed));
  const offerNew = typed.length >= 2 && !exactMatch;
  const alreadyLogged = lift && existing.some(name => norm(name) === norm(lift));

  const pick = (exercise: LibraryExercise) => {
    setChosen(exercise);
    setNewName('');
    setMuscles(exercise.muscles.filter(muscle => STRENGTH_MUSCLES.includes(muscle)));
    setQuery('');
  };
  const startNew = () => {
    setNewName(typed);
    setChosen(null);
    /* The day's muscles are a sensible first guess for something typed on that
       day — a guess the athlete can change, not a gate. */
    setMuscles(dayMuscles.filter(muscle => STRENGTH_MUSCLES.includes(muscle)));
    setQuery('');
  };
  const clearLift = () => { setChosen(null); setNewName(''); setMuscles([]); setQuery(''); window.setTimeout(() => search.current?.focus(), 0); };
  const toggleMuscle = (muscle: string) => setMuscles(current => current.includes(muscle) ? current.filter(item => item !== muscle) : [...current, muscle]);

  const max = Number(weight) && Number(reps) ? calculateEstimatedOneRepMax(Number(weight), Number(reps)) : null;
  const ready = Boolean(lift) && muscles.length > 0 && Number(weight) > 0 && Number(reps) > 0 && !blockedReason;

  /* CLOSE ONLY WHEN THE BACKDROP ITSELF IS CLICKED.

     "Click anywhere outside to close" was implemented as a click handler on
     the backdrop with a stopPropagation guard on the sheet inside it, which is
     the usual pattern and is wrong the moment anything inside the sheet
     unmounts on click. Tapping OK on the weight dial does exactly that: the
     dial closes itself in its own handler, React then walks the rest of the
     bubble path, finds the guard's fiber gone with it, and delivers the click
     to the backdrop — so the sheet shut every time a number was set, and a top
     set could not be logged from a lift row at all.

     Comparing target to currentTarget cannot be undone by an unmount: a click
     that started inside the sheet never reads as a click on the backdrop. */
  const closeOnBackdrop = (event: ReactMouseEvent<HTMLDivElement>) => { if (event.target === event.currentTarget) close(); };

  /* The rows the combobox moves through, in the order they are drawn. */
  const options: string[] = [...(offerNew ? ['new'] : []), ...matches.map(exercise => String(exercise.id))];
  const activeIndex = Math.min(active, Math.max(0, options.length - 1));
  const optionId = (key: string) => `ts-option-${key}`;
  const onSearchKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!options.length) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((activeIndex + 1) % options.length); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((activeIndex - 1 + options.length) % options.length); }
    else if (event.key === 'Enter') {
      event.preventDefault();
      const key = options[activeIndex];
      if (key === 'new') startNew();
      else { const exercise = matches.find(item => String(item.id) === key); if (exercise) pick(exercise); }
    }
  };

  return <div className="top-set-sheet-backdrop" data-state={shown ? 'open' : 'closed'} role="dialog" aria-modal="true" aria-label="Add a top set" onClick={closeOnBackdrop}>
    <div className="top-set-sheet">
      <header>
        <div><strong>Add a top set</strong><small>The one heaviest meaningful set. Forge measures progress from it.</small></div>
        <button type="button" className="top-set-sheet-close" aria-label="Close" onClick={close}>×</button>
      </header>

      {lift
        ? <div className="top-set-sheet-chosen">
            <div><span className="eyebrow">{isNew ? 'NEW EXERCISE' : 'EXERCISE'}</span><strong>{lift}</strong></div>
            <button type="button" className="text-button" onClick={clearLift}>Change</button>
          </div>
        : <label className="top-set-sheet-search">
            Exercise
            <SearchField ref={search} value={query} onChange={value => { setQuery(value); setActive(0); }} placeholder="Search exercises, e.g. Smith incline bench"
              role="combobox" aria-expanded={options.length > 0} aria-controls="ts-results" aria-autocomplete="list"
              aria-activedescendant={options.length ? optionId(options[activeIndex]) : undefined} onKeyDown={onSearchKey} />
          </label>}

      {!lift && <div className={typed ? 'top-set-sheet-results typing' : 'top-set-sheet-results'} id="ts-results" role="listbox" aria-label="Exercises">
        {offerNew && <button type="button" className="top-set-sheet-new" id={optionId('new')} role="option" aria-selected={options[activeIndex] === 'new'} tabIndex={-1} onClick={startNew}>
          <span>＋</span><div><strong>Use “{typed}”</strong><small>Adds it to your exercise library</small></div>
        </button>}
        {matches.map(exercise => <button type="button" className="top-set-sheet-result" key={exercise.id} id={optionId(String(exercise.id))} role="option" aria-selected={options[activeIndex] === String(exercise.id)} tabIndex={-1} onClick={() => pick(exercise)}>
          <div><strong>{exercise.name}</strong><small>{exercise.muscles.join(' · ') || 'Strength'}</small></div>
          {suggested.includes(exercise.name) && <b>Today</b>}
        </button>)}
        {!matches.length && !offerNew && <p className="top-set-sheet-empty">Type at least two letters to add an exercise that isn’t in your library yet.</p>}
      </div>}

      {lift && <>
        <div className="top-set-sheet-muscles">
          <span className="field-caption">Muscle groups</span>
          {isNew && <small>A new exercise needs its mapping — it decides what this set counts toward.</small>}
          <div className="muscle-picker compact-muscle-picker">
            {STRENGTH_MUSCLES.map(muscle => <button type="button" key={muscle} className={muscles.includes(muscle) ? 'muscle-chip active' : 'muscle-chip'} aria-pressed={muscles.includes(muscle)} onClick={() => toggleMuscle(muscle)}>{muscle}</button>)}
          </div>
        </div>
        <div className="field-grid dial-grid">
          <DialField label="Weight" kind="weight" unit={unit} value={weight} onChange={setWeight} />
          <DialField label="Reps" kind="reps" value={reps} onChange={setReps} />
        </div>
        {max ? <div className="top-set-card-result"><span>{Number(reps) === 1 ? 'REAL 1RM' : 'CALCULATED MAX'}</span><strong>{max} {unit}</strong></div> : null}
        {alreadyLogged ? <small className="top-set-sheet-warning">{lift} is already on today’s log — saving this adds a second set of it.</small> : null}
      </>}

      {blockedReason ? <p className="top-set-sheet-warning">{blockedReason}</p> : null}
      <footer>
        <button type="button" className="button" disabled={!ready} onClick={() => { onSave({ lift, muscles, isNew, weight: Number(weight), reps: Number(reps) }); close(); }}>Save top set</button>
        <button type="button" className="button ghost" onClick={close}>Cancel</button>
      </footer>
    </div>
  </div>;
}
