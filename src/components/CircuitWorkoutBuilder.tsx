import { useEffect, useMemo, useState } from 'react';
import { useGoals } from '../features/goals/GoalsProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { requestForgeCoach } from '../features/training/coachService';
import { type LibraryExercise } from '../features/training/TrainingLibraryProvider';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { type CircuitStation, type PlannedCardio } from './CardioPlanBuilder';
import { Icon } from './Icon';
import { SearchField } from './SearchField';

type BuilderMode = 'manual' | 'forge';

/* THE WORKOUT READS LIKE A WORKOUT.

   The old builder was a form: every station a grid of dropdowns and boxes
   labelled Station, Unit, Distance / target, Rest after (sec). On a phone the
   grid squeezed the one thing that mattered — which exercise — down to an
   empty dropdown arrow, so a circuit Forge had just written looked like six
   blank cards with numbers in them. Nobody could say what the workout was.

   Now the circuit is a list of plain lines — "400 m Run", "20 m Sled Push @
   102 kg · 30 s rest" — read top to bottom like a whiteboard. Tapping a line
   opens just that line to edit. The format is one row of chips and two
   numbers. Adding a movement is a search over the whole library, not only the
   HYROX/CrossFit corner of it. */

const UNITS = ['meters', 'kilometers', 'miles', 'calories', 'reps', 'seconds', 'minutes'] as const;
const UNIT_SHORT: Record<string, string> = { meters: 'm', kilometers: 'km', km: 'km', miles: 'mi', yards: 'yd', calories: 'cal', reps: '', seconds: 's', minutes: 'min' };
const FORMATS: Array<NonNullable<PlannedCardio['circuitFormat']>> = ['Rounds', 'AMRAP', 'EMOM', 'For time'];

const unitFor = (exercise?: Pick<LibraryExercise, 'defaultUnit' | 'kind'>) => exercise?.defaultUnit || (exercise?.kind === 'Cardio' ? 'meters' : 'reps');
const seconds = (value?: string) => Math.max(0, Math.round(Number(value) || 0));
const restText = (value?: string) => { const total = seconds(value); return !total ? '' : total >= 60 && total % 60 === 0 ? `${total / 60} min rest` : `${total} s rest`; };

/* "400 m Run", "15 Wall Balls", "20 m Sled Push @ 102 kg". */
export const stationLine = (station: Pick<CircuitStation, 'name' | 'target' | 'unit' | 'load'>) => {
  if (!String(station.target || '').trim()) return station.name;
  const short = UNIT_SHORT[station.unit] ?? station.unit;
  const amount = station.unit === 'reps' ? `${station.target}` : `${station.target}${short ? ` ${short}` : ''}`;
  return `${amount} ${station.name}${station.load ? ` @ ${station.load}` : ''}`;
};
/* "3 rounds · 60 s between", "20-min AMRAP". */
export const formatLine = (format: PlannedCardio['circuitFormat'], rounds: string, roundRest: string) => {
  const count = Math.max(1, Number(rounds) || 1);
  if (format === 'AMRAP' || format === 'EMOM') return `${count}-min ${format}`;
  const rest = seconds(roundRest);
  const between = count > 1 && rest ? ` · ${rest >= 60 && rest % 60 === 0 ? `${rest / 60} min` : `${rest} s`} between` : '';
  return format === 'For time' ? `${count > 1 ? `${count} rounds ` : ''}for time${between}` : `${count} round${count === 1 ? '' : 's'}${between}`;
};

export function CircuitWorkoutBuilder({ mode, initial, exercises, onClose, onSave, onDelete }: {
  mode: BuilderMode;
  initial?: PlannedCardio;
  exercises: LibraryExercise[];
  onClose: () => void;
  onSave: (plan: PlannedCardio) => void;
  onDelete?: () => void;
}) {
  const { goals } = useGoals();
  const { setup } = useProfileSetup();
  const { records } = useWorkoutHistory();
  /* The whole library, conditioning moves first — a circuit can hold a run,
     a row, a kettlebell swing or a push-up. */
  const options = useMemo(() => {
    const enabled = exercises.filter(exercise => exercise.enabled);
    const conditioning = (exercise: LibraryExercise) => /HYROX|CrossFit/i.test(exercise.detail) || exercise.kind === 'Cardio';
    return [...enabled.filter(conditioning), ...enabled.filter(exercise => !conditioning(exercise))];
  }, [exercises]);
  const [name, setName] = useState(initial?.activity || (mode === 'forge' ? 'Forge circuit' : 'New circuit'));
  const [format, setFormat] = useState<PlannedCardio['circuitFormat']>(initial?.circuitFormat || 'Rounds');
  const [rounds, setRounds] = useState(initial?.rounds || '3');
  const [roundRest, setRoundRest] = useState(initial?.roundRest || '60');
  const [totalTime, setTotalTime] = useState(initial?.duration || '');
  const [stationTime, setStationTime] = useState(initial?.stationTime || '');
  const [timeSource, setTimeSource] = useState<'total' | 'station'>(initial?.duration ? 'total' : 'station');
  const [stations, setStations] = useState<CircuitStation[]>(initial?.stationEntries || []);
  const [openId, setOpenId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [prompt, setPrompt] = useState('');
  const [askOpen, setAskOpen] = useState(mode === 'forge' && !(initial?.stationEntries?.length));
  const [built, setBuilt] = useState(Boolean(initial?.stationEntries?.length));
  const [working, setWorking] = useState(false);
  const [forgeMessage, setForgeMessage] = useState('');
  const [forgeError, setForgeError] = useState('');
  const visibleOptions = options.filter(exercise => `${exercise.name} ${exercise.detail}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 40);
  const timed = format === 'AMRAP' || format === 'EMOM';

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

  const updateStation = (id: number, change: Partial<CircuitStation>) => setStations(items => items.map(item => item.id === id ? { ...item, ...change } : item));
  const addMovement = (exercise: LibraryExercise) => {
    const id = Date.now();
    setStations(items => [...items, { id, kind: exercise.kind, name: exercise.name, target: exercise.defaultTarget || '', unit: unitFor(exercise), rest: '0' }]);
    setAdding(false);
    setSearch('');
    setOpenId(id);
  };
  const moveStation = (index: number, direction: -1 | 1) => setStations(items => {
    const destination = index + direction;
    if (destination < 0 || destination >= items.length) return items;
    const next = [...items];
    [next[index], next[destination]] = [next[destination], next[index]];
    return next;
  });
  const removeStation = (id: number) => { setStations(items => items.filter(item => item.id !== id)); setOpenId(null); };

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
          /* Movements the athlete put in before asking are ones they want kept. */
          selectedCircuitMovements: built ? [] : stations.map(station => station.name),
          currentDraft: built ? stations.map(stationLine) : null,
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
      /* Every movement Forge wrote is kept under its own name — dropping the
         ones outside a filtered list is how a Run vanished from the circuit. */
      const generatedStations = response.workout.stations.map((station, index): CircuitStation => {
        const exercise = libraryByName.get(station.name.toLowerCase());
        return {
          id: Date.now() + index,
          kind: exercise?.kind || 'Cardio',
          name: exercise?.name || station.name,
          target: station.target,
          unit: station.unit || unitFor(exercise),
          rest: String(station.restSeconds || 0),
        };
      });
      setName(response.workout.title);
      setRounds(String(response.workout.rounds));
      setRoundRest(String(response.workout.roundRestSeconds));
      setStations(generatedStations);
      setForgeMessage(response.answer);
      setBuilt(true);
      setAskOpen(false);
      setOpenId(null);
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
  const missing = stations.filter(station => !String(station.target || '').trim()).length;

  return <div className="cardio-plan-backdrop" role="dialog" aria-modal="true" aria-label="Circuit builder">
    <section className="cardio-plan-modal cb-modal">
      <header className="cb-head">
        <input className="cb-name" value={name} onChange={event => setName(event.target.value)} aria-label="Workout name" placeholder="Name this circuit" />
        <button type="button" className="cb-close" onClick={onClose} aria-label="Close">×</button>
      </header>

      {/* ASK FORGE: a box when there is nothing yet, a one-line button once there is. */}
      {mode === 'forge' && (askOpen
        ? <section className="cb-ask">
            <textarea rows={2} value={prompt} onChange={event => setPrompt(event.target.value)} placeholder={built ? 'What should change? e.g. "shorter", "no running", "more sled work"' : 'What should it be? e.g. "30-min HYROX circuit, no jumping"'} aria-label="What should Forge build?" />
            <button type="button" className="button" disabled={working} onClick={() => void askForge()}>{working ? 'Building…' : built ? 'Rebuild' : 'Build it'}</button>
            {forgeError && <p className="builder-error">{forgeError}</p>}
          </section>
        : <button type="button" className="cb-ask-again" onClick={() => setAskOpen(true)}><Icon name="star" /> Ask Forge to change it</button>)}
      {forgeMessage && !askOpen && <p className="cb-forge-note">{forgeMessage}</p>}

      {/* THE FORMAT, IN ONE ROW. */}
      <section className="cb-format" aria-label="Format">
        <div className="cb-chips" role="radiogroup">{FORMATS.map(item => <button type="button" role="radio" aria-checked={format === item} key={item} className={format === item ? 'cb-chip on' : 'cb-chip'} onClick={() => setFormat(item)}>{item}</button>)}</div>
        <div className="cb-numbers">
          <label><span>{timed ? 'Minutes' : 'Rounds'}</span><input inputMode="numeric" value={rounds} onChange={event => setRounds(event.target.value.replace(/[^\d]/g, ''))} /></label>
          {!timed && <label><span>Rest between rounds</span><span className="cb-with-unit"><input inputMode="numeric" value={roundRest} onChange={event => setRoundRest(event.target.value.replace(/[^\d]/g, ''))} /><em>sec</em></span></label>}
          {format === 'For time' && <label><span>Target time</span><span className="cb-with-unit"><input inputMode="decimal" value={totalTime} onChange={event => { setTimeSource('total'); setTotalTime(event.target.value); }} /><em>min</em></span></label>}
        </div>
      </section>

      {/* THE WORKOUT. */}
      <section className="cb-workout" aria-label="The workout">
        <p className="cb-shape">{formatLine(format, rounds, roundRest)}{stations.length ? ` · ${stations.length} movement${stations.length === 1 ? '' : 's'}` : ''}</p>
        {stations.length === 0 && <p className="cb-empty">{mode === 'forge' ? 'Tell Forge what you want above, or add movements yourself.' : 'Add the first movement.'}</p>}
        <ol className="cb-list">
          {stations.map((station, index) => {
            const open = openId === station.id;
            const rest = restText(station.rest);
            return <li key={station.id} className={open ? 'cb-item open' : 'cb-item'}>
              <button type="button" className="cb-line" aria-expanded={open} onClick={() => setOpenId(open ? null : station.id)}>
                <b className="cb-num">{index + 1}</b>
                <span className="cb-what"><strong>{stationLine(station)}</strong>{!String(station.target || '').trim() ? <small className="cb-needs">Set the amount</small> : rest ? <small>{rest}</small> : null}</span>
                <Icon name="chevron" />
              </button>
              {open && <div className="cb-edit">
                <label className="cb-field cb-wide"><span>Movement</span>
                  <select value={station.name} onChange={event => { const exercise = options.find(item => item.name === event.target.value); updateStation(station.id, exercise ? { name: exercise.name, kind: exercise.kind, unit: unitFor(exercise) } : { name: event.target.value }); }}>
                    {!options.some(exercise => exercise.name === station.name) && <option>{station.name}</option>}
                    {options.map(exercise => <option key={exercise.id}>{exercise.name}</option>)}
                  </select>
                </label>
                <label className="cb-field"><span>Amount</span><input inputMode="decimal" value={station.target} placeholder="e.g. 400" onChange={event => updateStation(station.id, { target: event.target.value })} /></label>
                <label className="cb-field"><span>Unit</span>
                  <select value={station.unit} onChange={event => updateStation(station.id, { unit: event.target.value })}>
                    {!UNITS.includes(station.unit as typeof UNITS[number]) && <option>{station.unit}</option>}
                    {UNITS.map(unit => <option key={unit}>{unit}</option>)}
                  </select>
                </label>
                <label className="cb-field"><span>Load</span><input value={station.load || ''} placeholder="None" onChange={event => updateStation(station.id, { load: event.target.value || undefined })} /></label>
                <label className="cb-field"><span>Rest after</span><span className="cb-with-unit"><input inputMode="numeric" value={station.rest || ''} placeholder="0" onChange={event => updateStation(station.id, { rest: event.target.value.replace(/[^\d]/g, '') })} /><em>sec</em></span></label>
                <div className="cb-edit-actions">
                  <button type="button" onClick={() => moveStation(index, -1)} disabled={index === 0} aria-label="Move up"><Icon name="up" /></button>
                  <button type="button" onClick={() => moveStation(index, 1)} disabled={index === stations.length - 1} aria-label="Move down"><Icon name="down" /></button>
                  <button type="button" className="cb-remove" onClick={() => removeStation(station.id)}>Remove</button>
                  <button type="button" className="cb-done" onClick={() => setOpenId(null)}>Done</button>
                </div>
              </div>}
            </li>;
          })}
        </ol>
        {adding
          ? <div className="cb-add-panel">
              <SearchField value={search} onChange={setSearch} placeholder="Search your exercises" aria-label="Search your exercises" autoFocus />
              <div className="cb-add-list">{visibleOptions.map(exercise => <button type="button" key={exercise.id} onClick={() => addMovement(exercise)}><strong>{exercise.name}</strong><small>{exercise.detail}</small></button>)}{!visibleOptions.length && <p className="cb-empty">Nothing matches — add it under Exercises first.</p>}</div>
              <button type="button" className="text-button" onClick={() => { setAdding(false); setSearch(''); }}>Cancel</button>
            </div>
          : <button type="button" className="cb-add" onClick={() => { setAdding(true); setOpenId(null); }}>＋ Add movement</button>}
      </section>

      <footer className="cb-foot">
        {onDelete && <button type="button" className="button ghost danger" onClick={onDelete}>Delete</button>}
        {missing > 0 && <small className="cb-needs">{missing === 1 ? '1 movement needs' : `${missing} movements need`} an amount</small>}
        <button type="button" className="button" disabled={!name.trim() || !stations.length} onClick={() => onSave(plan)}>Save circuit</button>
      </footer>
    </section>
  </div>;
}
