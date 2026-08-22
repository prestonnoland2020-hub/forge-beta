import { useEffect, useMemo, useState } from 'react';
import { useGoals } from '../features/goals/GoalsProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { requestForgeCoach } from '../features/training/coachService';
import { type LibraryExercise } from '../features/training/TrainingLibraryProvider';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { type CircuitStation, type PlannedCardio } from './CardioPlanBuilder';

type BuilderMode = 'manual' | 'forge';

const unitFor = (exercise?: LibraryExercise) => exercise?.defaultUnit || (exercise?.kind === 'Cardio' ? 'meters' : 'reps');

export function CircuitWorkoutBuilder({ mode, initial, exercises, onClose, onSave }: {
  mode: BuilderMode;
  initial?: PlannedCardio;
  exercises: LibraryExercise[];
  onClose: () => void;
  onSave: (plan: PlannedCardio) => void;
}) {
  const { goals } = useGoals();
  const { setup } = useProfileSetup();
  const { records } = useWorkoutHistory();
  const options = useMemo(() => exercises.filter(exercise => exercise.enabled && /HYROX|CrossFit/i.test(exercise.detail)), [exercises]);
  const [name, setName] = useState(initial?.activity || (mode === 'forge' ? 'Forge circuit' : 'New circuit'));
  const [format, setFormat] = useState<PlannedCardio['circuitFormat']>(initial?.circuitFormat || 'Rounds');
  const [rounds, setRounds] = useState(initial?.rounds || '3');
  const [roundRest, setRoundRest] = useState(initial?.roundRest || '60');
  const [totalTime, setTotalTime] = useState(initial?.duration || '');
  const [stationTime, setStationTime] = useState(initial?.stationTime || '');
  const [timeSource, setTimeSource] = useState<'total' | 'station'>(initial?.duration ? 'total' : 'station');
  const [stations, setStations] = useState<CircuitStation[]>(initial?.stationEntries || []);
  const [requiredNames, setRequiredNames] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [prompt, setPrompt] = useState('');
  const [working, setWorking] = useState(false);
  const [forgeMessage, setForgeMessage] = useState('');
  const [forgeError, setForgeError] = useState('');
  const visibleOptions = options.filter(exercise => `${exercise.name} ${exercise.detail}`.toLowerCase().includes(search.trim().toLowerCase()));

  useEffect(() => {
    if (format !== 'For time' || !stations.length) return;
    const roundCount = Math.max(1, Number(rounds) || 1);
    const efforts = stations.length * roundCount;
    const stationRestSeconds = stations.reduce((sum, station) => sum + Math.max(0, Number(station.rest) || 0), 0) * roundCount;
    const roundRestSeconds = Math.max(0, Number(roundRest) || 0) * Math.max(0, roundCount - 1);
    if (timeSource === 'total') {
      const totalSeconds = Math.max(0, Number(totalTime) || 0) * 60;
      const calculated = totalSeconds ? Math.max(0, Math.round((totalSeconds - stationRestSeconds - roundRestSeconds) / efforts)) : 0;
      setStationTime(calculated ? String(calculated) : '');
      return;
    }
    const workSeconds = Math.max(0, Number(stationTime) || 0) * efforts;
    const calculated = workSeconds ? Math.round(((workSeconds + stationRestSeconds + roundRestSeconds) / 60) * 10) / 10 : 0;
    setTotalTime(calculated ? String(calculated) : '');
  }, [format, rounds, roundRest, stations, totalTime, stationTime, timeSource]);

  const stationFrom = (exercise: LibraryExercise, id = Date.now()): CircuitStation => ({
    id,
    kind: exercise.kind,
    name: exercise.name,
    target: '',
    unit: unitFor(exercise),
    rest: '20',
  });

  const toggleRequired = (exercise: LibraryExercise) => {
    const selected = requiredNames.includes(exercise.name);
    setRequiredNames(items => selected ? items.filter(item => item !== exercise.name) : [...items, exercise.name]);
    if (mode === 'manual') {
      setStations(items => selected ? items.filter(item => item.name !== exercise.name) : [...items, stationFrom(exercise, Date.now() + items.length)]);
    }
  };

  const updateStation = (id: number, change: Partial<CircuitStation>) => setStations(items => items.map(item => item.id === id ? { ...item, ...change } : item));
  const changeMovement = (id: number, movementName: string) => {
    const exercise = options.find(item => item.name === movementName);
    if (exercise) updateStation(id, { name: exercise.name, kind: exercise.kind, unit: unitFor(exercise), target: '' });
  };
  const addStation = () => {
    const exercise = options[0];
    if (exercise) setStations(items => [...items, stationFrom(exercise, Date.now())]);
  };
  const moveStation = (index: number, direction: -1 | 1) => setStations(items => {
    const destination = index + direction;
    if (destination < 0 || destination >= items.length) return items;
    const next = [...items];
    [next[index], next[destination]] = [next[destination], next[index]];
    return next;
  });

  const askForge = async () => {
    setWorking(true);
    setForgeError('');
    setForgeMessage('');
    const response = await requestForgeCoach({
      scope: 'workout',
      question: prompt.trim() || 'Build a balanced cardio and conditioning circuit that supports my current goals.',
      context: {
        request: {
          sessionType: 'Circuit',
          format,
          requestedRounds: rounds || null,
          requestedRoundRestSeconds: roundRest || null,
          instructions: prompt.trim() || null,
          selectedCircuitMovements: requiredNames,
        },
        goals,
        profile: setup ? {
          primaryFocus: setup.primaryFocus,
          strengthExperience: setup.strengthExperience,
          runningExperience: setup.runningExperience,
          weeklyMileage: setup.weeklyMileage,
          equipment: setup.equipment,
          limitations: setup.limitationNotes,
          split: setup.splitDays,
        } : null,
        recentTraining: records.slice(0, 45).map(record => ({
          date: record.date,
          muscles: record.muscles,
          effort: record.effort,
          notes: record.notes,
          strength: record.topSets?.map(set => ({ exercise: set.lift, weight: set.weight, reps: set.reps })),
          cardio: record.cardioSessions?.map(session => ({ activity: session.activity, summary: session.summary })),
        })),
        availableLibrary: options.map(exercise => ({ name: exercise.name, category: exercise.detail, unit: unitFor(exercise) })),
      },
    }, 'Forge could not reach the AI service. Your current draft has not been changed.');
    if (response.workout) {
      const libraryByName = new Map(options.map(exercise => [exercise.name.toLowerCase(), exercise]));
      const generatedStations = response.workout.stations.flatMap((station, index) => {
        const exercise = libraryByName.get(station.name.toLowerCase());
        return exercise ? [{
          id: Date.now() + index,
          kind: exercise.kind,
          name: exercise.name,
          target: station.target,
          unit: unitFor(exercise),
          rest: String(station.restSeconds),
        } satisfies CircuitStation] : [];
      });
      setName(response.workout.title);
      setRounds(String(response.workout.rounds));
      setRoundRest(String(response.workout.roundRestSeconds));
      setStations(generatedStations);
      setForgeMessage(response.answer);
    } else {
      setForgeError(response.error || response.answer);
    }
    setWorking(false);
  };

  const plan: PlannedCardio = {
    id: initial?.id || Date.now(),
    activity: name.trim() || 'Circuit',
    structure: 'Circuit',
    targetSource: mode === 'forge' ? 'Goal generated' : 'Manual plan',
    circuitFormat: format,
    rounds,
    roundRest,
    duration: format === 'For time' ? totalTime : undefined,
    stationTime: format === 'For time' ? stationTime : undefined,
    stationEntries: stations,
  };

  return <div className="cardio-plan-backdrop" role="dialog" aria-modal="true">
    <section className="cardio-plan-modal circuit-workout-modal">
      <header>
        <div><span className="eyebrow">{mode === 'forge' ? 'BUILD WITH FORGE' : 'BUILD MANUALLY'}</span><h2>Cardio & circuit builder</h2><p>{mode === 'forge' ? 'Describe it, optionally require movements, then edit anything Forge creates.' : 'Build an editable circuit from your saved movement library.'}</p></div>
        <button onClick={onClose}>×</button>
      </header>

      {mode === 'forge' && <section className="circuit-forge-assist">
        <label>What should Forge build?<textarea rows={3} value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Example: Build a 30-minute HYROX circuit that supports my running and squat goals. No jumping today." /></label>
        <button className="button" disabled={working} onClick={() => void askForge()}>{working ? 'Forge is building…' : stations.length ? 'Rebuild with Forge' : 'Build with Forge'}</button>
        {forgeMessage && <p><strong>Forge:</strong> {forgeMessage}</p>}
        {forgeError && <p className="builder-error">{forgeError}</p>}
      </section>}

      <label className="circuit-name">Workout name<input value={name} onChange={event => setName(event.target.value)} /></label>
      <div className={`circuit-builder-header-fields ${format === 'For time' ? 'for-time' : ''}`}>
        <label>Format<select value={format} onChange={event => setFormat(event.target.value as PlannedCardio['circuitFormat'])}><option>Rounds</option><option>AMRAP</option><option>EMOM</option><option>For time</option></select></label>
        <label>{format === 'AMRAP' || format === 'EMOM' ? 'Duration (min)' : 'Rounds'}<input inputMode="numeric" value={rounds} onChange={event => setRounds(event.target.value)} /></label>
        {format === 'For time' && <label>Total time (min)<input inputMode="decimal" value={totalTime} onChange={event => { setTimeSource('total'); setTotalTime(event.target.value); }} /><small>Includes all programmed rest</small></label>}
        {format === 'For time' && <label>Time per station (sec)<input inputMode="numeric" value={stationTime} onChange={event => { setTimeSource('station'); setStationTime(event.target.value); }} /><small>Average work time</small></label>}
        <label>Rest between rounds (sec)<input inputMode="numeric" value={roundRest} onChange={event => setRoundRest(event.target.value)} /></label>
      </div>

      <details className="movement-multiselect">
        <summary><span>Movement options</span><small>{requiredNames.length ? `${requiredNames.length} required` : mode === 'forge' ? 'Optional · let Forge choose' : 'Search and select movements'}</small><b>⌄</b></summary>
        <div className="movement-dropdown-panel">
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search movements" autoFocus />
          <div className="movement-dropdown-list">{visibleOptions.map(exercise => <label key={exercise.name}><input type="checkbox" checked={requiredNames.includes(exercise.name)} onChange={() => toggleRequired(exercise)} /><span><strong>{exercise.name}</strong><small>{exercise.detail}</small></span></label>)}</div>
        </div>
      </details>

      <section className="simple-circuit-stations">
        <header><div><span className="eyebrow">STATIONS</span><h3>{stations.length ? `${stations.length} movements` : 'No movements yet'}</h3></div>{mode === 'manual' && <button className="button ghost add-station-button" onClick={addStation}>＋ Add station</button>}</header>
        {stations.length === 0 && <div className="empty-stations">{mode === 'forge' ? 'Ask Forge to build the circuit, or choose required movements above.' : 'Choose movements above or add a station.'}</div>}
        {stations.map((station, index) => <article key={station.id}>
          <div className="station-order"><b>{index + 1}</b><button onClick={() => moveStation(index, -1)} disabled={index === 0}>↑</button><button onClick={() => moveStation(index, 1)} disabled={index === stations.length - 1}>↓</button></div>
          <label>Station<select value={station.name} onChange={event => changeMovement(station.id, event.target.value)}>{options.map(exercise => <option key={exercise.name}>{exercise.name}</option>)}</select></label>
          <label>Unit<span className="station-unit-readout">{station.unit}</span></label>
          <label>Distance / target<input value={station.target} onChange={event => updateStation(station.id, { target: event.target.value })} placeholder="Enter target" /></label>
          <label>Rest after (sec)<input inputMode="numeric" value={station.rest || ''} onChange={event => updateStation(station.id, { rest: event.target.value })} /></label>
          <button className="remove-station" onClick={() => setStations(items => items.filter(item => item.id !== station.id))}>Remove</button>
        </article>)}
      </section>

      <footer><button className="button ghost" onClick={onClose}>Cancel</button><button className="button" disabled={!name.trim() || !stations.length} onClick={() => onSave(plan)}>Save circuit</button></footer>
    </section>
  </div>;
}
