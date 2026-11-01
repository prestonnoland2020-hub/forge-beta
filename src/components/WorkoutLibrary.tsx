import { useState } from 'react';
import { cardioPlanSummary } from './CardioPlanBuilder';
import { CircuitWorkoutBuilder } from './CircuitWorkoutBuilder';
import { useTrainingLibrary, type LibraryWorkout } from '../features/training/TrainingLibraryProvider';

type BuilderMode = 'manual' | 'forge';

/* SAVED CIRCUITS. A short list under the exercises: each one logs in a tap
   from a workout, so all this needs is a way to make, open and drop one. */
export function WorkoutLibrary() {
  const [builderMode, setBuilderMode] = useState<BuilderMode | null>(null);
  const [editing, setEditing] = useState<LibraryWorkout | null>(null);
  const { workouts, exercises, addWorkout, updateWorkout, removeWorkout } = useTrainingLibrary();
  const saved = workouts.filter(workout => workout.kind === 'Cardio' || workout.kind === 'Circuit');

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
    if (!window.confirm(`Delete “${workout.name}”? Completed history will not be removed.`)) return;
    removeWorkout(workout.id);
    closeBuilder();
  };

  return <section className="exercise-group">
    {builderMode && <CircuitWorkoutBuilder mode={builderMode} initial={editing?.plan} exercises={exercises} onClose={closeBuilder} onSave={saveCircuit} onDelete={editing ? () => remove(editing) : undefined} />}
    <span className="eyebrow">Saved circuits</span>
    {saved.length ? <div className="simple-settings-list">{saved.map(workout => <button type="button" onClick={() => openBuilder(workout.source === 'Forge' ? 'forge' : 'manual', workout)} key={workout.id}><div><strong>{workout.name}</strong><span>{workout.summary}</span></div><b>›</b></button>)}</div>
      : <p className="library-table-empty">No saved circuits yet. Save one here and it logs in a tap from any workout.</p>}
    <div className="exercise-circuit-actions"><button className="button ghost" onClick={() => openBuilder('manual')}>New circuit</button><button className="text-button" onClick={() => openBuilder('forge')}>or let Forge build one</button></div>
  </section>;
}
