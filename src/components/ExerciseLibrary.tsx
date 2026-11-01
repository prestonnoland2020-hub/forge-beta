import { useMemo, useState } from 'react';
import { exerciseCategory, useTrainingLibrary, type ExerciseCategory, type LibraryExercise } from '../features/training/TrainingLibraryProvider';
import { SearchField } from './SearchField';

/* STRENGTH FIRST. Most athletes come here for a lift, so lifts head the page;
   the event and conditioning movements follow. */
const groups: ExerciseCategory[] = ['Strength', 'HYROX', 'CrossFit', 'Cardio'];
const muscles = ['Chest', 'Back', 'Shoulders', 'Quads', 'Glutes', 'Hamstrings', 'Calves', 'Biceps', 'Triceps', 'Forearms', 'Abs', 'Cardio'];

export function ExerciseLibrary() {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ExerciseCategory>('Strength');
  const [selectedMuscles, setSelectedMuscles] = useState<string[]>([]);
  const [defaultUnit, setDefaultUnit] = useState('reps');
  const [enabled, setEnabled] = useState(true);
  const { exercises, addExercise, updateExercise, removeExercise } = useTrainingLibrary();
  const canSave = Boolean(name.trim() && selectedMuscles.length);
  /* ONE LIST, GROUPED. Headings replace the old filter pills: each movement
     sits under the category it claims first, and search reaches the rest. */
  const shown = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matches = exercises.filter(item => !term || `${item.name} ${exerciseCategory(item)} ${item.muscles.join(' ')}`.toLowerCase().includes(term));
    return groups.map(group => ({ group, items: matches.filter(item => exerciseCategory(item) === group).sort((a, b) => a.name.localeCompare(b.name)) })).filter(({ items }) => items.length);
  }, [exercises, query]);
  const editingExercise = editing ? exercises.find(item => item.id === editing) : undefined;
  const isCardio = category === 'Cardio' || editingExercise?.kind === 'Cardio' || /\b(run|jog|row|rowing|bike|cycling|ski\s*erg|skierg|swim|double unders?)\b/i.test(name);

  const open = (exercise?: LibraryExercise) => {
    setEditing(exercise?.id ?? 0);
    setName(exercise?.name || '');
    setCategory(exercise ? exerciseCategory(exercise) : 'Strength');
    setSelectedMuscles(exercise?.muscles || []);
    setDefaultUnit(exercise?.defaultUnit || 'reps');
    setEnabled(exercise?.enabled ?? true);
  };
  const close = () => setEditing(null);
  const toggleMuscle = (muscle: string) => setSelectedMuscles(items => items.includes(muscle) ? items.filter(item => item !== muscle) : [...items, muscle]);
  const save = () => {
    if (!canSave) return;
    /* Choosing a category in the editor makes that the movement's only one —
       an explicit choice replaces a multi-category tag rather than silently
       keeping it. */
    const value = { name: name.trim(), kind: isCardio ? 'Cardio' as const : 'Strength' as const, muscles: selectedMuscles, detail: `${category} · ${isCardio ? 'Cardio measurement' : 'Weight + reps'}`, categories: [category], enabled, custom: true, ...(isCardio ? { defaultUnit } : {}) };
    if (editing) updateExercise(editing, value); else addExercise(value);
    close();
  };
  const remove = (exercise: LibraryExercise) => {
    if (window.confirm(`Delete “${exercise.name}”? Existing workout history will not change.`)) {
      removeExercise(exercise.id);
      close();
    }
  };

  return <div className="exercise-library stack-lg">
    <div className="exercise-library-head"><SearchField value={query} onChange={setQuery} placeholder="Search exercises" aria-label="Search exercises" /><button className="button" onClick={() => open()}>＋ Add exercise</button></div>
    {editing !== null && <div className="mobile-editor-backdrop" role="presentation">
      <section className="card custom-exercise" role="dialog" aria-modal="true" aria-label={editing ? 'Edit exercise' : 'Add exercise'}>
        <div className="card-head"><div><span className="eyebrow">{editing ? 'EDIT EXERCISE' : 'NEW EXERCISE'}</span><h3>{editing ? editingExercise?.name : 'Add an exercise'}</h3></div><button className="text-button" onClick={close}>Close</button></div>
        <div className="field-grid"><label>Name<input value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Belt Squat" /></label><label>Category<select value={category} onChange={event => setCategory(event.target.value as ExerciseCategory)}>{groups.map(group => <option key={group}>{group}</option>)}</select></label></div>
        {isCardio && <label>Unit of measure<select value={defaultUnit} onChange={event => setDefaultUnit(event.target.value)}><option value="miles">Miles</option><option value="meters">Meters</option><option value="calories">Calories</option><option value="seconds">Seconds</option><option value="minutes">Minutes</option><option value="reps">Reps</option></select></label>}
        <label>Muscle groups<div className="muscle-picker">{muscles.map(muscle => <button type="button" className={selectedMuscles.includes(muscle) ? 'muscle-chip active' : 'muscle-chip'} onClick={() => toggleMuscle(muscle)} key={muscle}>{muscle}</button>)}</div></label>
        {!selectedMuscles.length && <small className="required-mapping">Pick at least one muscle.</small>}
        <div className="exercise-use-row"><div><strong>Use in my plans</strong><small>Off keeps it out of anything Forge programs for you.</small></div><button type="button" role="switch" aria-checked={enabled} aria-label="Use in my plans" className={enabled ? 'table-status on' : 'table-status'} onClick={() => setEnabled(value => !value)} /></div>
        <div className="button-row"><button className="button" disabled={!canSave} onClick={save}>Save exercise</button>{editingExercise && <button className="button ghost danger" onClick={() => remove(editingExercise)}>Delete</button>}</div>
      </section>
    </div>}
    {shown.map(({ group, items }) => <section className="exercise-group" key={group}>
      <span className="eyebrow">{group}</span>
      <div className="simple-settings-list">{items.map(item => <button type="button" className={item.enabled ? '' : 'off'} onClick={() => open(item)} key={item.id}><div><strong>{item.name}</strong><span>{item.enabled ? '' : 'Off · '}{item.muscles.filter(muscle => muscle !== 'Cardio').join(' · ') || 'Needs a muscle group'}</span></div><b>›</b></button>)}</div>
    </section>)}
    {!shown.length && <p className="library-table-empty">Nothing matches “{query.trim()}”.</p>}
  </div>;
}
