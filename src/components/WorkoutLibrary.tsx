import { useMemo, useState } from 'react';
import { cardioPlanSummary } from './CardioPlanBuilder';
import { CircuitWorkoutBuilder } from './CircuitWorkoutBuilder';
import { useTrainingLibrary, type LibraryWorkout } from '../features/training/TrainingLibraryProvider';

type SplitChoice = { name: string; dayType: string; cardioIds: number[] };
type BuilderMode = 'manual' | 'forge';

export function WorkoutLibrary({ splitDays = [], onAttach }: {
  splitDays?: SplitChoice[];
  onAttach?: (workout: LibraryWorkout, dayIndexes: number[]) => void;
}) {
  const [builderMode, setBuilderMode] = useState<BuilderMode | null>(null);
  const [editing, setEditing] = useState<LibraryWorkout | null>(null);
  const [query, setQuery] = useState('');
  const [attaching, setAttaching] = useState<LibraryWorkout | null>(null);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const { workouts, exercises, addWorkout, updateWorkout, removeWorkout } = useTrainingLibrary();
  const cardioWorkouts = useMemo(() => workouts.filter(workout => workout.kind === 'Cardio' || workout.kind === 'Circuit'), [workouts]);
  const shown = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? cardioWorkouts.filter(workout => `${workout.name} ${workout.kind} ${workout.source} ${workout.summary}`.toLowerCase().includes(term)) : cardioWorkouts;
  }, [query, cardioWorkouts]);

  const openBuilder = (mode: BuilderMode, workout: LibraryWorkout | null = null) => {
    setEditing(workout);
    setBuilderMode(mode);
  };
  const closeBuilder = () => {
    setEditing(null);
    setBuilderMode(null);
  };
  const saveCircuit = (plan: NonNullable<LibraryWorkout['plan']>) => {
    const workout = {
      name: plan.activity,
      kind: 'Circuit' as const,
      source: builderMode === 'forge' ? 'Forge' as const : 'User' as const,
      summary: cardioPlanSummary(plan),
      plan,
    };
    if (editing) updateWorkout(editing.id, workout);
    else addWorkout(workout);
    closeBuilder();
  };
  const remove = (workout: LibraryWorkout) => {
    if (window.confirm(`Delete “${workout.name}”? Completed history will not be removed.`)) removeWorkout(workout.id);
  };
  const openAttach = (workout: LibraryWorkout) => {
    setAttaching(workout);
    setSelectedDays([]);
  };
  const toggleDay = (index: number) => setSelectedDays(items => items.includes(index) ? items.filter(item => item !== index) : [...items, index]);
  const applyAttach = () => {
    if (!attaching || !selectedDays.length || !onAttach) return;
    onAttach(attaching, selectedDays);
    setAttaching(null);
    setSelectedDays([]);
  };

  return <div className="workout-library stack-lg">
    {builderMode && <CircuitWorkoutBuilder mode={builderMode} initial={editing?.plan} exercises={exercises} onClose={closeBuilder} onSave={saveCircuit} />}

    <section className="workout-library-command simplified">
      <div><span className="eyebrow">CARDIO & CIRCUITS</span><h2>Reusable workouts</h2><p>Create an editable circuit yourself or let Forge assemble one inside the same builder.</p></div>
      <div className="workout-create-actions"><button className="button" onClick={() => openBuilder('forge')}>Create with Forge</button><button className="button ghost" onClick={() => openBuilder('manual')}>Build manually</button></div>
    </section>

    <section className="card library-table-card">
      <header><span>{shown.length} saved workout{shown.length === 1 ? '' : 's'}</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search cardio and circuits" aria-label="Search cardio and circuits" /></header>
      <div className="library-table-scroll"><table className="library-table workout-table"><thead><tr><th>Workout</th><th>Format</th><th>Prescription</th><th>Actions</th></tr></thead><tbody>{shown.map(workout => <tr key={workout.id}><td><strong>{workout.name}</strong><small>{workout.source === 'Forge' ? 'Built with Forge' : 'Built manually'}</small></td><td>{workout.plan?.circuitFormat || workout.kind}</td><td>{workout.summary}</td><td>{onAttach && <button onClick={() => openAttach(workout)}>Add to Split</button>}<button onClick={() => openBuilder(workout.source === 'Forge' ? 'forge' : 'manual', workout)}>Edit</button><button className="danger" onClick={() => remove(workout)}>Delete</button></td></tr>)}</tbody></table>{!shown.length && <div className="library-table-empty">No cardio or circuit workouts yet.</div>}</div>
    </section>

    {attaching && onAttach && <section className="card split-attach-panel"><header><div><span className="eyebrow">ADD TO SPLIT</span><h3>{attaching.name}</h3><p>Choose each day where this workout should be available.</p></div><button className="text-button" onClick={() => setAttaching(null)}>Cancel</button></header><div className="split-attach-days">{splitDays.map((day, index) => { const selected = selectedDays.includes(index); const already = day.cardioIds.includes(attaching.plan?.id || -1); return <button className={selected ? 'selected' : ''} disabled={already} onClick={() => toggleDay(index)} key={`${day.name}-${index}`}><span>{selected || already ? '✓' : ''}</span><div><strong>{day.name}</strong><small>{already ? 'Already attached' : 'Available as an option'}</small></div></button>; })}</div><footer><span>{selectedDays.length} selected</span><button className="button" disabled={!selectedDays.length} onClick={applyAttach}>Add to selected days</button></footer></section>}
  </div>;
}
