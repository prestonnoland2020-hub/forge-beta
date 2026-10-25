import { useRef, useState } from 'react';
import { DialField } from './NumberDial';
import type { LibraryExercise } from '../features/training/TrainingLibraryProvider';
import type { LoggedTopSet, WorkoutRecord } from '../features/training/WorkoutHistoryProvider';
import { calculateEstimatedOneRepMax } from '../lib/strength';
import { lastCompletedSet } from './LastPerformance';
import { STRENGTH_MUSCLES } from './TopSetSheet';
import { tap } from '../lib/haptics';

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
  /* THE SECTIONS ARE NUMBERED, and this one was not — so a day with sets
     prescribed read "TOP SETS", "02 CARDIO", "03 SESSION DETAILS" and looked
     like something was missing above it. */
  onRemove: (index: number) => void;
  /* Deleting a set that is already SAVED is a different act from dropping an
     unfinished row: it has to come back out of the training day, History and
     Insights. The parent owns that; this component only asks. */
  onDeleteLogged: (index: number, set: LoggedTopSet) => void;
  onCreateExercise: (name: string, muscles: string[]) => void;
  planLabel?: string;
  /* Set when the day has no label yet: a top set has nothing to attach to. */
  blockedReason?: string;
};

const setKey = (set: LoggedTopSet) => set.id || `${set.muscle}::${set.lift}::${set.weight}::${set.reps}`;

/* WHICH ROW IS OPEN CANNOT DEPEND ON WHAT IS TYPED INTO IT.

   setKey identifies a SET — lift, weight and reps — which is right for asking
   "has this exact set been logged" and catastrophic for remembering which row
   the athlete has open. A planned set arrives with no id, so its key was the
   values; the moment a weight was chosen the key changed, the open-row list no
   longer matched anything, and the row collapsed mid-entry. Tapping a lift and
   setting a number closed the editor every single time — a top set could not
   be logged from the day screen at all.

   A ROW is identified by where it sits and what lift is on it, which is stable
   while its numbers are being filled in. */
const rowKey = (set: LoggedTopSet, index: number) => set.id || `${set.muscle}::${set.lift}::${index}`;


/* A SAVED SET IS A LINE, NOT A CARD. Every set rendered as a full card whether
   it was still being filled in or already logged, so a day with four lifts on
   it was four screens of form for work that was already done, and the one set
   still being entered sat somewhere in the middle of them.

   A set that is saved collapses to what it is — the lift, the load, the max —
   and opens on a tap when it needs correcting. A set still being entered is
   open, because it is the question on the screen. */
export function TopSetCards({ sets, onChange, onQuickLog, onEditLogged, loggedKeys, exercises, muscles, records, date, unit, onAdd, onRemove, onDeleteLogged, onCreateExercise, planLabel, blockedReason = '' }: Props) {
  /* Keyed, not indexed: rows are added and removed under this state. */
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const [closedKeys, setClosedKeys] = useState<string[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<LoggedTopSet | null>(null);
  /* SWIPE TO DELETE. A logged set could be corrected but never removed — a
     mis-tapped lift or a set logged on the wrong day was permanent. Dragging a
     row left reveals Delete; the delete itself is a deliberate second tap,
     because this is training history and a thumb brushing a list should not be
     able to erase it. Everything here also has a plain button in the open card
     for anyone not on a touchscreen. */
  const [swipedKey, setSwipedKey] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const swipeStart = useRef<{ key: string; x: number; y: number } | null>(null);
  const REVEAL = 84;
  const beginSwipe = (key: string, touch: { clientX: number; clientY: number }) => { swipeStart.current = { key, x: touch.clientX, y: touch.clientY }; };
  const moveSwipe = (key: string, touch: { clientX: number; clientY: number }) => {
    const start = swipeStart.current;
    if (!start || start.key !== key) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    /* A vertical scroll is not a swipe — let the page have it. */
    if (Math.abs(dy) > Math.abs(dx)) { swipeStart.current = null; setSwipeOffset(0); return; }
    setSwipedKey(key);
    setSwipeOffset(Math.max(-REVEAL, Math.min(0, dx)));
  };
  const endSwipe = () => {
    if (!swipeStart.current) return;
    swipeStart.current = null;
    setSwipeOffset(current => (current < -REVEAL / 2 ? -REVEAL : 0));
  };
  const closeSwipe = () => { setSwipedKey(null); setSwipeOffset(0); };
  const [creatingExercise, setCreatingExercise] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState('');
  const [newExerciseMuscles, setNewExerciseMuscles] = useState<string[]>([]);
  const [createError, setCreateError] = useState('');
  /* The exercise picker is a "Swap" away, not a dropdown above every set:
     the plan already chose the lift, and the dropdown only repeated its name. */
  const [swapKey, setSwapKey] = useState<string | null>(null);
  const options = exercises.filter(exercise => exercise.enabled && exercise.kind === 'Strength');
  const availableMuscles = Array.from(new Set([...muscles.filter(muscle => STRENGTH_MUSCLES.includes(muscle)), ...STRENGTH_MUSCLES]));
  const inferMuscle = (exerciseName: string, fallback = '') => {
    const exercise = exercises.find(item => item.name === exerciseName);
    return exercise?.muscles.find(muscle => muscles.includes(muscle)) || exercise?.muscles[0] || fallback || 'Primary';
  };
  const startCorrection = (set: LoggedTopSet, index: number) => {
    setEditingKey(rowKey(set, index));
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

  const isOpen = (set: LoggedTopSet, index: number) => {
    const key = rowKey(set, index);
    if (openKeys.includes(key)) return true;
    if (closedKeys.includes(key)) return false;
    /* Default: EVERY named set is a closed one-line row — the screen stays
       linear and small, and tapping a row opens just that set. Only a set
       with no lift yet opens, because a blank line has nothing to show. */
    return !set.lift;
  };
  const toggle = (set: LoggedTopSet, index: number) => {
    const key = rowKey(set, index);
    const open = isOpen(set, index);
    setOpenKeys(current => open ? current.filter(item => item !== key) : [...current, key]);
    setClosedKeys(current => open ? [...current, key] : current.filter(item => item !== key));
  };

  return <section className="top-set-card-stack">
    <header><div><h2>Lifts</h2>{sets.length > 0 && <small className="top-set-progress">{sets.filter(set => set.lift && loggedKeys.includes(setKey(set))).length} of {sets.length} done</small>}</div></header>
    {creatingExercise && <section className="inline-log-exercise" aria-label="Add an exercise to your library">
      <header><div><span className="eyebrow">NEW STRENGTH EXERCISE</span><h3>Add it once. Log it now.</h3><p>The muscle mapping keeps future split recommendations accurate.</p></div><button type="button" className="text-button" onClick={() => setCreatingExercise(false)}>Cancel</button></header>
      <label>Exercise name<input autoFocus value={newExerciseName} onChange={event => { setNewExerciseName(event.target.value); setCreateError(''); }} placeholder="e.g. Dumbbell incline press" /></label>
      <div><span className="field-caption">MUSCLE GROUPS</span><div className="muscle-picker compact-muscle-picker">{availableMuscles.map(muscle => <button type="button" className={newExerciseMuscles.includes(muscle) ? 'muscle-chip active' : 'muscle-chip'} aria-pressed={newExerciseMuscles.includes(muscle)} onClick={() => toggleNewMuscle(muscle)} key={muscle}>{muscle}</button>)}</div></div>
      {createError && <small className="inline-exercise-error">{createError}</small>}
      <footer><small>It will be saved to Exercises and selected in a new top-set card.</small><button type="button" className="button" disabled={!newExerciseName.trim() || !newExerciseMuscles.length} onClick={createExercise}>Save & use exercise</button></footer>
    </section>}
    {sets.map((set, index) => {
      const logged = Boolean(set.lift && loggedKeys.includes(setKey(set)));
      const isCorrecting = logged && editingKey === rowKey(set, index) && editDraft;
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

      const open = isOpen(set, index) || Boolean(isCorrecting);

      /* WHAT THE PLAN ASKED FOR IS PRINTED, NOT PRE-TYPED. The weight dial
         opens empty on an unlogged set; the ask reads as an ask. */
      const askReps = logged ? 0 : displayedSet.prescribedReps || 0;
      const askWeight = logged ? 0 : displayedSet.prescribedWeight || 0;
      const askText = askReps ? (askWeight ? `${askWeight} ${unit} ×${askReps}` : `×${askReps}`) : '';

      /* Closed: the whole set is one line of text — saved sets read as their
         result, still-to-log sets read as the prescription with LOG waiting. */
      if (!open && set.lift) {
        const key = setKey(set);
        const offset = swipedKey === key ? swipeOffset : 0;
        const deleteSet = () => { closeSwipe(); if (logged) onDeleteLogged(index, set); else onRemove(index); };
        return <article className={`card top-set-entry closed swipeable${logged ? ' logged' : ' pending'}${offset ? ' swiped' : ''}`} key={set.id || `set-${index}`}>
          <button type="button" className="top-set-delete" onClick={deleteSet} tabIndex={offset ? 0 : -1} aria-hidden={offset ? undefined : true}>Delete</button>
          <div className="top-set-swipe" style={{ transform: `translateX(${offset}px)` }}
            onTouchStart={event => beginSwipe(key, event.touches[0])}
            onTouchMove={event => moveSwipe(key, event.touches[0])}
            onTouchEnd={endSwipe}>
            {/* A CHECKLIST LINE. A circle that fills when the set is saved, the
                lift, and either the result or one clear action — the day reads
                as how much is left, at a glance. */}
            <button type="button" className="top-set-row" aria-expanded="false" onClick={() => { if (offset) { closeSwipe(); return; } tap(); toggle(set, index); }}>
              <span className={logged ? 'top-set-check done' : 'top-set-check'} aria-hidden="true">{logged && <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5 10 17l9-10" /></svg>}</span>
              <span className="top-set-row-name">{set.lift}{!logged && askText && <small>Today {askText}</small>}</span>
              {logged
                ? <span className="top-set-row-figures">{set.weight} {unit} × {set.reps}</span>
                : <span className="top-set-row-log">Log</span>}
            </button>
          </div>
        </article>;
      }

      return <article className={`card top-set-entry ${logged ? 'logged' : ''}`} key={set.id || `set-${index}`}>
        <div className="top-set-entry-head">
          <button type="button" className="top-set-entry-toggle" aria-expanded="true" onClick={() => { if (isCorrecting) { cancelCorrection(); return; } tap(); toggle(set, index); }}><h3>{displayedSet.lift || 'Choose a lift'}</h3></button>
          {logged && !isCorrecting ? <div className="logged-top-set-actions"><button type="button" className="text-button" onClick={() => startCorrection(set, index)}>Edit</button><button type="button" className="text-button danger" onClick={() => onDeleteLogged(index, set)}>Delete</button></div> : isCorrecting ? <button type="button" className="text-button" onClick={cancelCorrection}>Cancel</button> : null}
        </div>
        {logged && !isCorrecting ? <div className="logged-top-set-summary"><strong>{set.weight} {unit} × {set.reps}</strong>{max ? <small>About {max} {unit} for one rep</small> : null}</div> : <>
          {(!displayedSet.lift || swapKey === rowKey(set, index)) && <label className="top-set-exercise-field">Lift<select value={displayedSet.lift} onChange={event => { if (event.target.value === '__new__') { setCreatingExercise(true); setCreateError(''); return; } chooseExercise(event.target.value); }}><option value="">Choose exercise</option>{options.map(exercise => <option key={exercise.id}>{exercise.name}</option>)}<option value="__new__">＋ Add a new exercise…</option></select></label>}
          {/* ONE LINE OF CONTEXT, not two labelled boxes: what the plan asks
              for today, else what you did last time, else that this is the
              first one. */}
          {displayedSet.lift && <p className="top-set-hint">{askText
            ? <>Today: <strong>{askText}</strong>{previous ? <> · last time {previous.weight} × {previous.reps}</> : null}. Log what you actually lifted.</>
            : previous
              ? <>Last time: <strong>{previous.weight} {unit} × {previous.reps}</strong> · {new Date(`${previous.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>
              : <>First time — pick a weight you can lift with good form for your heaviest set.</>}</p>}
          <div className="field-grid dial-grid">
            <DialField label="Weight" kind="weight" unit={unit} value={displayedSet.weight ? String(displayedSet.weight) : ''} onChange={next => changeDisplayedSet({ weight: Number(next) })} />
            <DialField label="Reps" kind="reps" value={displayedSet.reps ? String(displayedSet.reps) : ''} onChange={next => changeDisplayedSet({ reps: Number(next) })} />
          </div>
          {/* A FOOTER IS FOR WHAT THE ATHLETE NEEDS TO KNOW BEFORE TAPPING SAVE.
              "This exercise supplies its muscle mapping automatically" is how
              the record gets built, and it sat under every open card for
              nobody: it asks for nothing, warns of nothing, and was the widest
              thing in the row. A correction genuinely needs its warning, and a
              blocked save genuinely needs its reason. Otherwise the footer is
              just the button. */}
          <footer className={isCorrecting || blockedReason ? undefined : 'bare'}><span>{isCorrecting ? 'This replaces the completed result everywhere it is used.' : blockedReason}</span><button type="button" className="button top-set-save" disabled={!displayedSet.lift || !displayedSet.weight || !displayedSet.reps || Boolean(blockedReason && !isCorrecting)} onClick={() => { tap(); if (isCorrecting) { saveCorrection(); return; } onQuickLog(set); /* Saved, it folds back to its checklist line so the next lift is the next thing on screen. */ const key = rowKey(set, index); setOpenKeys(current => current.filter(item => item !== key)); setClosedKeys(current => [...current.filter(item => item !== key), key]); }}>{isCorrecting ? 'Save correction' : 'Save set'}</button></footer>
          {!isCorrecting && !logged && <div className="top-set-minor">{displayedSet.lift && <button type="button" className="text-button" onClick={() => setSwapKey(key => key === rowKey(set, index) ? null : rowKey(set, index))}>{swapKey === rowKey(set, index) ? 'Keep this lift' : 'Swap lift'}</button>}<button type="button" className="text-button danger" onClick={() => onRemove(index)}>Remove</button></div>}
        </>}
      </article>;
    })}
    <button type="button" className="top-set-add" onClick={() => { tap(); onAdd(); }}>＋ Add a lift</button>
  </section>;
}
