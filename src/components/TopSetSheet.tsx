import { useEffect, useMemo, useRef, useState } from 'react';
import { DialField } from './NumberDial';
import type { LibraryExercise } from '../features/training/TrainingLibraryProvider';
import { calculateEstimatedOneRepMax } from '../lib/strength';

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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
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

  return <div className="top-set-sheet-backdrop" role="dialog" aria-modal="true" aria-label="Add a top set" onClick={onClose}>
    <div className="top-set-sheet" onClick={event => event.stopPropagation()}>
      <header>
        <div><strong>Add a top set</strong><small>The one heaviest meaningful set. Forge measures progress from it.</small></div>
        <button type="button" className="top-set-sheet-close" aria-label="Close" onClick={onClose}>×</button>
      </header>

      {lift
        ? <div className="top-set-sheet-chosen">
            <div><span className="eyebrow">{isNew ? 'NEW EXERCISE' : 'EXERCISE'}</span><strong>{lift}</strong></div>
            <button type="button" className="text-button" onClick={clearLift}>Change</button>
          </div>
        : <label className="top-set-sheet-search">
            Exercise
            <input ref={search} value={query} onChange={event => setQuery(event.target.value)} placeholder="Type an exercise — e.g. Smith incline bench" autoComplete="off" />
          </label>}

      {!lift && <div className="top-set-sheet-results">
        {offerNew && <button type="button" className="top-set-sheet-new" onClick={startNew}>
          <span>＋</span><div><strong>Use “{typed}”</strong><small>Adds it to your exercise library</small></div>
        </button>}
        {matches.map(exercise => <button type="button" className="top-set-sheet-result" key={exercise.id} onClick={() => pick(exercise)}>
          <div><strong>{exercise.name}</strong><small>{exercise.muscles.join(' · ') || 'Strength'}</small></div>
          {suggested.includes(exercise.name) && <b>TODAY</b>}
        </button>)}
        {!matches.length && !offerNew && <p className="top-set-sheet-empty">Type at least two letters to add an exercise that isn’t in your library yet.</p>}
      </div>}

      {lift && <>
        <div className="top-set-sheet-muscles">
          <span className="field-caption">MUSCLE GROUPS</span>
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
        <button type="button" className="button" disabled={!ready} onClick={() => onSave({ lift, muscles, isNew, weight: Number(weight), reps: Number(reps) })}>Save top set</button>
        <button type="button" className="button ghost" onClick={onClose}>Cancel</button>
      </footer>
    </div>
  </div>;
}
