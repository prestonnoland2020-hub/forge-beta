import { useState } from 'react';
import { DialField } from './NumberDial';
import type { LibraryExercise } from '../features/training/TrainingLibraryProvider';
import type { LoggedTopSet, WorkoutRecord } from '../features/training/WorkoutHistoryProvider';
import { calculateEstimatedOneRepMax } from '../lib/strength';
import { lastCompletedSet } from './LastPerformance';
import { STRENGTH_MUSCLES } from './TopSetSheet';

type Props = {
  sets: LoggedTopSet[];
  onChange: (index: number, change: Partial<LoggedTopSet>) => void;
  onQuickLog: (set: LoggedTopSet) => void;
  onEditLogged: (index: number, original: LoggedTopSet, corrected: LoggedTopSet) => boolean;
  loggedKeys: string[];
  exercises: LibraryExercise[];
  muscles: string[];
  records: WorkoutRecord[];
  date: string;
  unit: string;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onCreateExercise: (name: string, muscles: string[]) => void;
  planLabel?: string;
};

const setKey = (set: LoggedTopSet) => set.id || `${set.muscle}::${set.lift}::${set.weight}::${set.reps}`;


/* A SAVED SET IS A LINE, NOT A CARD. Every set rendered as a full card whether
   it was still being filled in or already logged, so a day with four lifts on
   it was four screens of form for work that was already done, and the one set
   still being entered sat somewhere in the middle of them.

   A set that is saved collapses to what it is — the lift, the load, the max —
   and opens on a tap when it needs correcting. A set still being entered is
   open, because it is the question on the screen. */
export function TopSetCards({ sets, onChange, onQuickLog, onEditLogged, loggedKeys, exercises, muscles, records, date, unit, onAdd, onRemove, onCreateExercise, planLabel }: Props) {
  /* Keyed, not indexed: rows are added and removed under this state. */
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const [closedKeys, setClosedKeys] = useState<string[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<LoggedTopSet | null>(null);
  const [creatingExercise, setCreatingExercise] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState('');
  const [newExerciseMuscles, setNewExerciseMuscles] = useState<string[]>([]);
  const [createError, setCreateError] = useState('');
  const options = exercises.filter(exercise => exercise.enabled && exercise.kind === 'Strength');
  const availableMuscles = Array.from(new Set([...muscles.filter(muscle => STRENGTH_MUSCLES.includes(muscle)), ...STRENGTH_MUSCLES]));
  const inferMuscle = (exerciseName: string, fallback = '') => {
    const exercise = exercises.find(item => item.name === exerciseName);
    return exercise?.muscles.find(muscle => muscles.includes(muscle)) || exercise?.muscles[0] || fallback || 'Primary';
  };
  const startCorrection = (set: LoggedTopSet) => {
    setEditingKey(setKey(set));
    setEditDraft({ ...set });
  };
  const cancelCorrection = () => {
    setEditingKey(null);
    setEditDraft(null);
  };
  const toggleNewMuscle = (muscle: string) => setNewExerciseMuscles(current => current.includes(muscle) ? current.filter(item => item !== muscle) : [...current, muscle]);
  const createExercise = () => {
    const name = newExerciseName.trim();
    if (!name || !newExerciseMuscles.length) return;
    if (exercises.some(exercise => exercise.name.trim().toLowerCase() === name.toLowerCase())) {
      setCreateError('That exercise is already in your library. Choose it from the exercise list.');
      return;
    }
    onCreateExercise(name, newExerciseMuscles);
    setCreatingExercise(false);
    setNewExerciseName('');
    setNewExerciseMuscles([]);
    setCreateError('');
  };

  const isOpen = (set: LoggedTopSet) => {
    const key = setKey(set);
    if (openKeys.includes(key)) return true;
    if (closedKeys.includes(key)) return false;
    /* Default: a saved set is closed, an unfinished one is open. */
    return !(set.lift && loggedKeys.includes(key));
  };
  const toggle = (set: LoggedTopSet) => {
    const key = setKey(set);
    const open = isOpen(set);
    setOpenKeys(current => open ? current.filter(item => item !== key) : [...current, key]);
    setClosedKeys(current => open ? [...current, key] : current.filter(item => item !== key));
  };

  return <section className="top-set-card-stack">
    <header><div><span className="eyebrow">{planLabel || 'TOP SETS'}</span><h2>{sets.length} {sets.length === 1 ? 'top set' : 'top sets'}</h2><p>Tap a saved set to correct it. Anything you add is saved as completed.</p></div><div className="top-set-header-actions"><button type="button" className="button ghost" onClick={onAdd}>＋ Add top set</button></div></header>
    {creatingExercise && <section className="inline-log-exercise" aria-label="Add an exercise to your library">
      <header><div><span className="eyebrow">NEW STRENGTH EXERCISE</span><h3>Add it once. Log it now.</h3><p>The muscle mapping keeps future split recommendations accurate.</p></div><button type="button" className="text-button" onClick={() => setCreatingExercise(false)}>Cancel</button></header>
      <label>Exercise name<input autoFocus value={newExerciseName} onChange={event => { setNewExerciseName(event.target.value); setCreateError(''); }} placeholder="e.g. Dumbbell incline press" /></label>
      <div><span className="field-caption">MUSCLE GROUPS</span><div className="muscle-picker compact-muscle-picker">{availableMuscles.map(muscle => <button type="button" className={newExerciseMuscles.includes(muscle) ? 'muscle-chip active' : 'muscle-chip'} aria-pressed={newExerciseMuscles.includes(muscle)} onClick={() => toggleNewMuscle(muscle)} key={muscle}>{muscle}</button>)}</div></div>
      {createError && <small className="inline-exercise-error">{createError}</small>}
      <footer><small>It will be saved to Exercises and selected in a new top-set card.</small><button type="button" className="button" disabled={!newExerciseName.trim() || !newExerciseMuscles.length} onClick={createExercise}>Save & use exercise</button></footer>
    </section>}
    {sets.map((set, index) => {
      const logged = Boolean(set.lift && loggedKeys.includes(setKey(set)));
      const isCorrecting = logged && editingKey === setKey(set) && editDraft;
      const displayedSet = isCorrecting ? editDraft : set;
      const previous = displayedSet.lift ? lastCompletedSet(records.filter(record => record.date < date), displayedSet.lift) : undefined;
      const max = displayedSet.weight && displayedSet.reps ? calculateEstimatedOneRepMax(displayedSet.weight, displayedSet.reps) : null;
      const changeDisplayedSet = (change: Partial<LoggedTopSet>) => {
        if (isCorrecting) setEditDraft(current => current ? { ...current, ...change } : current);
        else onChange(index, change);
      };
      const chooseExercise = (exerciseName: string) => changeDisplayedSet({
        lift: exerciseName,
        muscle: inferMuscle(exerciseName, displayedSet.muscle),
        ...(exerciseName === displayedSet.lift ? {} : { weight: 0, reps: 0 }),
      });
      const saveCorrection = () => {
        if (!editDraft?.lift || !editDraft.weight || !editDraft.reps) return;
        const corrected = { ...editDraft, muscle: inferMuscle(editDraft.lift, editDraft.muscle) };
        if (onEditLogged(index, set, corrected)) cancelCorrection();
      };

      const open = isOpen(set) || Boolean(isCorrecting);

      /* Saved and closed: the whole set is one line of text. */
      if (logged && !open) return <article className="card top-set-entry logged closed" key={set.id || `set-${index}`}>
        <button type="button" className="top-set-row" aria-expanded="false" onClick={() => toggle(set)}>
          <span className="top-set-row-name">{set.lift}</span>
          <span className="top-set-row-figures">{set.weight} {unit} ×{set.reps}{max ? <small>max {max} {unit}</small> : null}</span>
          <b aria-hidden="true">⌄</b>
        </button>
      </article>;

      return <article className={`card top-set-entry ${logged ? 'logged' : ''}`} key={set.id || `set-${index}`}>
        <div className="top-set-entry-head">
          {logged
            ? <button type="button" className="top-set-entry-toggle" aria-expanded="true" onClick={() => toggle(set)}><span className="eyebrow">TOP SET {index + 1}</span><h3>{displayedSet.lift || 'Select an exercise'}</h3></button>
            : <div><span className="eyebrow">TOP SET {index + 1}</span><h3>{displayedSet.lift || 'Select an exercise'}</h3></div>}
          {logged && !isCorrecting ? <div className="logged-top-set-actions"><strong className="logged-badge">Saved ✓</strong><button type="button" className="text-button" onClick={() => startCorrection(set)}>Edit</button></div> : <button type="button" className="text-button" onClick={isCorrecting ? cancelCorrection : () => onRemove(index)}>{isCorrecting ? 'Cancel' : 'Remove'}</button>}
        </div>
        {logged && !isCorrecting ? <div className="logged-top-set-summary"><strong>{set.weight} {unit} ×{set.reps}</strong><small>Calculated max {max ?? '—'} {unit}</small></div> : <>
          <label className="top-set-exercise-field">Exercise<select value={displayedSet.lift} onChange={event => { if (event.target.value === '__new__') { setCreatingExercise(true); setCreateError(''); return; } chooseExercise(event.target.value); }}><option value="">Choose exercise</option>{options.map(exercise => <option key={exercise.id}>{exercise.name}</option>)}<option value="__new__">＋ Add a new exercise…</option></select></label>
          {displayedSet.lift && <div className="inline-last-set"><span>LAST COMPLETED</span>{previous ? <><strong>{previous.weight} {unit} ×{previous.reps}</strong><small>Calculated max {calculateEstimatedOneRepMax(previous.weight, previous.reps) ?? previous.weight} {unit} · {new Date(`${previous.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</small></> : <small>No earlier completed top set—this result establishes the baseline.</small>}</div>}
          <div className="field-grid dial-grid">
            <DialField label="Weight" kind="weight" unit={unit} value={displayedSet.weight ? String(displayedSet.weight) : ''} onChange={next => changeDisplayedSet({ weight: Number(next) })} />
            <DialField label="Reps" kind="reps" value={displayedSet.reps ? String(displayedSet.reps) : ''} onChange={next => changeDisplayedSet({ reps: Number(next) })} />
          </div>
          {max && <div className="top-set-card-result"><span>CALCULATED MAX</span><strong>{max} {unit}</strong></div>}
          <footer><span>{isCorrecting ? 'This replaces the completed result everywhere it is used.' : 'This exercise supplies its muscle mapping automatically.'}</span><button type="button" className="button" disabled={!displayedSet.lift || !displayedSet.weight || !displayedSet.reps} onClick={isCorrecting ? saveCorrection : () => onQuickLog(set)}>{isCorrecting ? 'Save correction' : 'Save top set'}</button></footer>
        </>}
      </article>;
    })}
  </section>;
}
