import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  /* ARRIVING FROM THE COACH. "See it in Saved circuits" lands here with
     ?show=circuits (and the circuit's id): the list is scrolled into view and
     the one just saved is marked, so the athlete sees exactly where it went
     instead of hunting below the exercise list for it. */
  const [params] = useSearchParams();
  const showCircuits = params.get('show') === 'circuits';
  const justSaved = Number(params.get('circuit')) || 0;
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!showCircuits) return;
    const timer = window.setTimeout(() => {
      const row = justSaved ? document.getElementById(`circuit-${justSaved}`) : null;
      (row || sectionRef.current)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [showCircuits, justSaved]);

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

  return <section className="exercise-group" id="saved-circuits" ref={sectionRef}>
    {builderMode && <CircuitWorkoutBuilder mode={builderMode} initial={editing?.plan} exercises={exercises} onClose={closeBuilder} onSave={saveCircuit} onDelete={editing ? () => remove(editing) : undefined} />}
    {/* Making one comes first: the actions sit at the top of the tab. */}
    <div className="exercise-circuit-actions top"><button className="button" onClick={() => openBuilder('manual')}>＋ New circuit</button><button className="button secondary" onClick={() => openBuilder('forge')}>Let Forge build one</button></div>
    <span className="eyebrow">Saved circuits</span>
    {saved.length ? <div className="simple-settings-list">{saved.map(workout => <button type="button" id={`circuit-${workout.id}`} className={workout.id === justSaved ? 'just-saved' : undefined} onClick={() => openBuilder(workout.source === 'Forge' ? 'forge' : 'manual', workout)} key={workout.id}><div><strong>{workout.name}{workout.id === justSaved && <em className="just-saved-tag">Just saved</em>}</strong><span>{workout.summary}</span></div><b>›</b></button>)}</div>
      : <p className="library-table-empty">No saved circuits yet. Save one here and it logs in a tap from any workout.</p>}
  </section>;
}
