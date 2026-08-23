import { useState } from 'react';
import type { LibraryExercise } from '../features/training/TrainingLibraryProvider';
import type { LoggedTopSet, WorkoutRecord } from '../features/training/WorkoutHistoryProvider';
import { calculateEstimatedOneRepMax } from '../lib/strength';
import { lastCompletedSet } from './LastPerformance';

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
};

const setKey = (set: LoggedTopSet) => set.id || `${set.muscle}::${set.lift}::${set.weight}::${set.reps}`;

const strengthMuscles = ['Chest','Back','Shoulders','Quads','Hamstrings','Glutes','Biceps','Triceps','Forearms','Abs'];

export function TopSetCards({ sets, onChange, onQuickLog, onEditLogged, loggedKeys, exercises, muscles, records, date, unit, onAdd, onRemove, onCreateExercise }: Props) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<LoggedTopSet | null>(null);
  const [creatingExercise, setCreatingExercise] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState('');
  const [newExerciseMuscles, setNewExerciseMuscles] = useState<string[]>([]);
  const [createError, setCreateError] = useState('');
  const options = exercises.filter(exercise => exercise.enabled && exercise.kind === 'Strength');
  const availableMuscles = Array.from(new Set([...muscles.filter(muscle => strengthMuscles.includes(muscle)), ...strengthMuscles]));
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

  return <section className="top-set-card-stack">
    <header><div><span className="eyebrow">TOP SETS</span><h2>{sets.length} {sets.length === 1 ? 'top set' : 'top sets'}</h2><p>Choose an exercise, then record the weight and reps you completed.</p></div><div className="top-set-header-actions"><button type="button" className="button ghost" onClick={onAdd}>＋ Add top set</button></div></header>
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

      return <article className={`card top-set-entry ${logged ? 'logged' : ''}`} key={set.id || `set-${index}`}>
        <div className="top-set-entry-head">
          <div><span className="eyebrow">TOP SET {index + 1}</span><h3>{displayedSet.lift || 'Select an exercise'}</h3></div>
          {logged && !isCorrecting ? <div className="logged-top-set-actions"><strong className="logged-badge">Logged ✓</strong><button type="button" className="text-button" onClick={() => startCorrection(set)}>Edit</button></div> : <button type="button" className="text-button" onClick={isCorrecting ? cancelCorrection : () => onRemove(index)}>{isCorrecting ? 'Cancel' : 'Remove'}</button>}
        </div>
        {logged && !isCorrecting ? <div className="logged-top-set-summary"><strong>{set.weight} {unit} ×{set.reps}</strong><small>Calculated max {max ?? '—'} {unit}</small></div> : <>
          <label className="top-set-exercise-field">Exercise<select value={displayedSet.lift} onChange={event => { if (event.target.value === '__new__') { setCreatingExercise(true); setCreateError(''); return; } chooseExercise(event.target.value); }}><option value="">Choose exercise</option>{options.map(exercise => <option key={exercise.id}>{exercise.name}</option>)}<option value="__new__">＋ Add a new exercise…</option></select></label>
          {displayedSet.lift && <div className="inline-last-set"><span>LAST COMPLETED</span>{previous ? <><strong>{previous.weight} {unit} ×{previous.reps}</strong><small>Calculated max {calculateEstimatedOneRepMax(previous.weight, previous.reps) ?? previous.weight} {unit} · {new Date(`${previous.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</small></> : <small>No earlier completed top set—this result establishes the baseline.</small>}</div>}
          <div className="field-grid"><label>Weight ({unit})<input value={displayedSet.weight || ''} onChange={event => changeDisplayedSet({ weight: Number(event.target.value) })} inputMode="decimal" placeholder="0" /></label><label>Reps<input value={displayedSet.reps || ''} onChange={event => changeDisplayedSet({ reps: Number(event.target.value) })} inputMode="numeric" placeholder="0" /></label></div>
          {max && <div className="top-set-card-result"><span>CALCULATED MAX</span><strong>{max} {unit}</strong></div>}
          <footer><span>{isCorrecting ? 'This replaces the completed result everywhere it is used.' : 'This exercise supplies its muscle mapping automatically.'}</span><button type="button" className="button" disabled={!displayedSet.lift || !displayedSet.weight || !displayedSet.reps} onClick={isCorrecting ? saveCorrection : () => onQuickLog(set)}>{isCorrecting ? 'Save correction' : 'Log top set now'}</button></footer>
        </>}
      </article>;
    })}
  </section>;
}
