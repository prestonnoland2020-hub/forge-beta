import { useMemo, useState } from 'react';
import { openCoachBubble } from '../features/training/coachService';
import { exerciseCategory, useTrainingLibrary, type ExerciseCategory, type LibraryExercise } from '../features/training/TrainingLibraryProvider';

const filters = ['All', 'Strength', 'Cardio', 'HYROX', 'CrossFit'] as const;
const muscles = ['Chest', 'Back', 'Shoulders', 'Quads', 'Glutes', 'Hamstrings', 'Biceps', 'Triceps', 'Forearms', 'Abs', 'Cardio'];

export function ExerciseLibrary() {
  const [filter, setFilter] = useState<(typeof filters)[number]>('All');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ExerciseCategory>('Strength');
  const [selectedMuscles, setSelectedMuscles] = useState<string[]>([]);
  const [defaultUnit, setDefaultUnit] = useState('reps');
  const { exercises, addExercise, updateExercise, removeExercise, toggleExercise } = useTrainingLibrary();
  const section = (item: LibraryExercise) => exerciseCategory(item);
  const canSave = Boolean(name.trim() && selectedMuscles.length);
  const shown = useMemo(() => {
    const term = query.trim().toLowerCase();
    return exercises
      .filter(item => (filter === 'All' || section(item) === filter) && (!term || `${item.name} ${item.kind} ${item.muscles.join(' ')}`.toLowerCase().includes(term)))
      .sort((a, b) => section(a).localeCompare(section(b)) || a.name.localeCompare(b.name));
  }, [exercises, filter, query]);
  const editingExercise = editing ? exercises.find(item => item.id === editing) : undefined;
  const isCardio = editingExercise?.kind === 'Cardio' || /\b(run|jog|row|rowing|bike|cycling|ski\s*erg|skierg|swim|double unders?)\b/i.test(name);

  const open = (exercise?: LibraryExercise) => {
    setEditing(exercise?.id ?? 0);
    setName(exercise?.name || '');
    setCategory(exercise ? section(exercise) : 'Strength');
    setSelectedMuscles(exercise?.muscles || []);
    setDefaultUnit(exercise?.defaultUnit || 'reps');
  };
  const close = () => {
    setEditing(null);
    setName('');
    setCategory('Strength');
    setSelectedMuscles([]);
    setDefaultUnit('reps');
  };
  const toggleMuscle = (muscle: string) => setSelectedMuscles(items => items.includes(muscle) ? items.filter(item => item !== muscle) : [...items, muscle]);
  const save = () => {
    if (!canSave) return;
    const value = { name: name.trim(), kind: isCardio ? 'Cardio' as const : 'Strength' as const, muscles: selectedMuscles, detail: `${category} · ${isCardio ? 'Cardio measurement' : 'Weight + reps'}`, enabled: true, custom: true, ...(isCardio ? { defaultUnit } : {}) };
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
    <section className="simple-library-head">
      <div className="button-row"><button className="button" onClick={() => open()}>＋ Add exercise</button><button className="button ghost" onClick={() => openCoachBubble('Help me create an exercise for my library.')}>Ask Forge</button></div>
    </section>
    {editing !== null && <div className="mobile-editor-backdrop" role="presentation">
      <section className="card custom-exercise" role="dialog" aria-modal="true" aria-label={editing ? 'Edit exercise' : 'Add exercise'}>
        <div className="card-head"><div><span className="eyebrow">{editing ? 'EDIT EXERCISE' : 'NEW EXERCISE'}</span><h3>{editing ? 'Update exercise' : 'Add an exercise'}</h3></div><button className="text-button" onClick={close}>Close</button></div>
        <div className="field-grid"><label>Name<input value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Belt Squat" /></label><label>Category<select value={category} onChange={event => setCategory(event.target.value as typeof category)}><option>Strength</option><option>HYROX</option><option>CrossFit</option></select></label></div>
        {isCardio && <label>Unit of measure<select value={defaultUnit} onChange={event => setDefaultUnit(event.target.value)}><option value="miles">Miles</option><option value="meters">Meters</option><option value="calories">Calories</option><option value="seconds">Seconds</option><option value="minutes">Minutes</option><option value="reps">Reps</option></select></label>}
        <label>Muscle groups · required<div className="muscle-picker">{muscles.map(muscle => <button type="button" className={selectedMuscles.includes(muscle) ? 'muscle-chip active' : 'muscle-chip'} onClick={() => toggleMuscle(muscle)} key={muscle}>{muscle}</button>)}</div></label>
        {!selectedMuscles.length && <small className="required-mapping">Choose at least one muscle group so Forge can place it correctly.</small>}
        <div className="button-row"><button className="button" disabled={!canSave} onClick={save}>Save exercise</button>{Boolean(editing) && <button className="button ghost danger" onClick={() => remove(exercises.find(item => item.id === editing)!)}>Delete</button>}</div>
      </section>
    </div>}
    <section className="card library-table-card">
      <header><div className="library-filters">{filters.map(value => <button className={filter === value ? 'active' : ''} onClick={() => setFilter(value)} key={value}>{value}</button>)}</div><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search exercises" aria-label="Search exercises" /></header>
      <div className="exercise-mobile-list">{shown.map(item => <article className={item.enabled ? 'exercise-mobile-row' : 'exercise-mobile-row disabled'} key={item.id}><button className="exercise-mobile-main" onClick={() => open(item)}><span><strong>{item.name}</strong><small>{section(item)} · {item.muscles.filter(muscle => muscle !== 'Cardio').join(' · ') || 'Needs mapping'}</small></span><b>›</b></button><button aria-label={`${item.enabled ? 'Disable' : 'Enable'} ${item.name}`} className={item.enabled ? 'table-status on' : 'table-status'} onClick={() => toggleExercise(item.id)}>{item.enabled ? 'On' : 'Off'}</button></article>)}</div>
      <div className="library-table-scroll"><table className="library-table exercise-table"><thead><tr><th>Exercise</th><th>Category</th><th>Muscle groups</th><th>Status</th><th>Action</th></tr></thead><tbody>{shown.map(item => <tr className={item.enabled ? '' : 'disabled'} key={item.id}><td><strong>{item.name}</strong><small>{item.detail}{item.kind === 'Cardio' && item.defaultUnit ? ` · Unit ${item.defaultUnit}` : ''}</small></td><td>{section(item)}</td><td>{item.muscles.filter(muscle => muscle !== 'Cardio').join(' · ') || 'Not mapped'}</td><td><button className={item.enabled ? 'table-status on' : 'table-status'} onClick={() => toggleExercise(item.id)}>{item.enabled ? 'Enabled' : 'Disabled'}</button></td><td><button onClick={() => open(item)}>Edit</button><button className="danger" onClick={() => remove(item)}>Delete</button></td></tr>)}</tbody></table></div>
      {!shown.length && <div className="library-table-empty">No exercises match these filters.</div>}
    </section>
  </div>;
}
