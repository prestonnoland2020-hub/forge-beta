import { useEffect, useMemo, useRef, useState } from 'react';
import { useTrainingLibrary } from '../features/training/TrainingLibraryProvider';
import type { CardioLogDraft } from '../lib/cardioSession';
import { parseCardioDescription } from '../lib/cardioParse';
import { requestCardioParse } from '../features/training/coachService';

/* Cardio logging is manual, the way the original Apps Script CardioLog tab was:
   one row per line — type, distance, unit, time — and intervals are just more
   rows. Everything is stored as `prescription.legacyIntervals`, the same shape
   the legacy Sheets import already writes, so miles, pace, and the endurance
   insights read new entries and imported history through one code path. */

export type CardioLine = { id: number; cardioType: string; unit: string; distance: string; time: string };

const DISTANCE_UNITS = ['miles', 'km', 'meters', 'yards'];
const OTHER_UNITS = ['minutes', 'calories', 'reps', 'floors'];
const ALL_UNITS = [...DISTANCE_UNITS, ...OTHER_UNITS];
const STAPLE_TYPES = ['Run', 'Walk', 'Bike', 'Rowing', 'Swimming', 'Elliptical', 'Stair Climber', 'Jump Rope'];

const isDistanceUnit = (unit: string) => DISTANCE_UNITS.includes(String(unit || '').trim().toLowerCase());
/* A distance measured in "minutes" converts to ZERO miles — it counts for
   nothing in weekly mileage, pace, or an endurance goal, while still looking
   logged. The pairing is impossible, so it is never stored: entering a
   distance against a time or count unit moves the unit to that activity's
   distance unit. */
/* A DEFAULT UNIT IS NOT A REPAIR UNIT. This returned 'minutes' for an
   elliptical or a stair climber, and it is also the function called to FIX a
   distance sitting on a time unit — so "3" on an elliptical was "repaired"
   from minutes to minutes, the distance silently became zero miles, and the
   select still displayed "miles" because the options list filters to distance
   units once a distance is typed. The athlete read three miles and the app
   stored none. `distanceUnitFor` never returns a time unit; `unitFor` keeps
   the sensible empty-line default. */
const distanceUnitFor = (type: string) => {
  const value = type.trim().toLowerCase();
  if (/row|ski|erg/.test(value)) return 'meters';
  if (/swim/.test(value)) return 'yards';
  return 'miles';
};
const unitFor = (type: string) => {
  const value = type.trim().toLowerCase();
  if (/elliptical|jump rope|stair/.test(value)) return 'minutes';
  return distanceUnitFor(type);
};

const toMiles = (distance: number, unit: string) => {
  const value = unit.trim().toLowerCase();
  if (value.startsWith('km') || value.includes('kilometer')) return distance / 1.609344;
  if (value.startsWith('meter')) return distance / 1609.344;
  if (value.startsWith('yard')) return distance / 1760;
  return value.startsWith('mile') ? distance : 0;
};

/* Accepts 28, 28:30, or 1:05:00 and returns decimal minutes — the unit the
   legacy rows and every downstream total already use. */
export const clockToMinutes = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const parts = trimmed.split(':').map(part => Number(part.trim()));
  if (parts.some(part => !Number.isFinite(part))) return 0;
  if (parts.length === 1) return Math.max(0, parts[0]);
  if (parts.length === 2) return Math.max(0, parts[0] + parts[1] / 60);
  return Math.max(0, parts[0] * 60 + parts[1] + parts[2] / 60);
};

const minutesToClock = (minutes: number) => {
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  const total = Math.round(minutes * 60);
  const hours = Math.floor(total / 3600);
  const rest = total % 3600;
  const body = `${Math.floor(rest / 60)}:${String(rest % 60).padStart(2, '0')}`;
  return hours ? `${hours}:${body.padStart(5, '0')}` : body;
};

const linePace = (line: CardioLine) => {
  const miles = toMiles(Number(line.distance) || 0, line.unit);
  const minutes = clockToMinutes(line.time);
  return miles > 0 && minutes > 0 ? `${minutesToClock(minutes / miles)}\u00a0/mi` : '';
};

const blankLine = (id: number, type = 'Run'): CardioLine => ({ id, cardioType: type, unit: unitFor(type), distance: '', time: '' });

const linesFromDraft = (draft: CardioLogDraft): CardioLine[] => {
  const rows = Array.isArray(draft.prescription.legacyIntervals) ? draft.prescription.legacyIntervals as Array<Record<string, unknown>> : [];
  if (!rows.length) return [blankLine(1, draft.activity || 'Run')];
  return rows.map((row, index) => ({
    id: index + 1,
    cardioType: String(row.cardioType || row.activity || draft.activity || 'Run'),
    unit: (() => { const stored = String(row.unit || row.distanceUnit || 'miles'); return Number(row.distance) > 0 && !isDistanceUnit(stored) ? distanceUnitFor(String(row.cardioType || row.activity || draft.activity || 'Run')) : stored; })(),
    distance: row.distance ? String(row.distance) : '',
    time: minutesToClock(Number(row.time) || 0),
  }));
};

const summarize = (lines: CardioLine[]) => {
  const filled = lines.filter(line => Number(line.distance) > 0 || clockToMinutes(line.time) > 0);
  if (!filled.length) return '';
  const minutes = filled.reduce((total, line) => total + clockToMinutes(line.time), 0);
  const distances = new Map<string, number>();
  filled.forEach(line => {
    const distance = Number(line.distance) || 0;
    if (distance) distances.set(line.unit, (distances.get(line.unit) || 0) + distance);
  });
  const types = Array.from(new Set(filled.map(line => line.cardioType.trim()).filter(Boolean)));
  const distanceText = [...distances].map(([unit, distance]) => `${Number(distance.toFixed(2))}\u00a0${Math.abs(distance) === 1 ? unit.replace(/s$/, '') : unit}`).join(' + ');
  const totalMiles = filled.reduce((total, line) => total + toMiles(Number(line.distance) || 0, line.unit), 0);
  const pace = totalMiles > 0 && minutes > 0 ? `${minutesToClock(minutes / totalMiles)}\u00a0/mi` : '';
  const count = filled.length > 1 ? `${filled.length} lines` : '';
  return [types.join(' + '), distanceText, minutes ? minutesToClock(minutes) : '', pace, count].filter(Boolean).join(' · ');
};

export function CardioBuilder({ sectionNumber = '01', onEntriesChange, initialOpen = false, initialEntries = [], plannedSummary }: {
  sectionNumber?: string;
  onEntriesChange?: (hasEntries: boolean, entries: CardioLogDraft[]) => void;
  initialOpen?: boolean;
  initialEntries?: CardioLogDraft[];
  plannedSummary?: string;
} = {}) {
  const { exercises, workouts } = useTrainingLibrary();
  const [savedEntries, setSavedEntries] = useState<CardioLogDraft[]>(initialEntries);
  /* Circuits and saved cardio workouts log in one tap: the library template
     becomes a completed entry (stations preserved), editable like any other. */
  const savedTemplates = useMemo(() => workouts.filter(workout => workout.kind === 'Circuit' || (workout.kind === 'Cardio' && workout.plan)), [workouts]);
  const logTemplate = (workout: typeof workouts[number]) => {
    const plan = workout.plan as { stationEntries?: Array<{ name: string; target: string; unit: string }> } | undefined;
    setSavedEntries(items => [...items, {
      id: crypto.randomUUID(),
      structure: workout.kind === 'Circuit' ? 'circuit' : 'steady',
      activity: workout.name,
      summary: workout.summary || workout.name,
      prescription: {},
      circuitStations: plan?.stationEntries?.map(station => ({ name: station.name, value: station.target, unit: station.unit })),
    }]);
  };
  const [open, setOpen] = useState(initialOpen);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [lines, setLines] = useState<CardioLine[]>([blankLine(1)]);
  const [note, setNote] = useState('');
  const [aiText, setAiText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiReflection, setAiReflection] = useState('');
  const [aiSource, setAiSource] = useState<'ai' | 'local' | ''>('');

  /* History loads asynchronously, so the day's saved sessions can arrive after
     this mounts. Adopt them once rather than sitting empty over a day that
     already has cardio on it. */
  const adopted = useRef(false);
  useEffect(() => {
    if (adopted.current || !initialEntries.length) return;
    adopted.current = true;
    setSavedEntries(current => current.length ? current : initialEntries);
  }, [initialEntries]);
  useEffect(() => onEntriesChange?.(savedEntries.length > 0, savedEntries), [savedEntries, onEntriesChange]);

  const typeOptions = useMemo(() => {
    const fromLibrary = exercises.filter(exercise => exercise.enabled && exercise.kind === 'Cardio').map(exercise => exercise.name);
    return Array.from(new Set([...STAPLE_TYPES, ...fromLibrary]));
  }, [exercises]);

  const updateLine = (id: number, change: Partial<CardioLine>) => setLines(current => current.map(line => line.id === id ? { ...line, ...change } : line));
  /* Correcting the activity on a line that already has a distance keeps that
     distance measurable: it moves to the new activity's DISTANCE unit, never
     to a time unit. Retyping "Run" as "Stair Climber" used to turn 3 miles
     into nothing, with no warning. */
  const changeType = (id: number, cardioType: string) => setLines(current => current.map(line => line.id === id
    ? { ...line, cardioType, unit: Number(line.distance) > 0 ? distanceUnitFor(cardioType) : unitFor(cardioType) }
    : line));
  const addLine = () => setLines(current => {
    const last = current[current.length - 1];
    return [...current, { id: Date.now(), cardioType: last?.cardioType || 'Run', unit: last?.unit || 'miles', distance: last?.distance || '', time: '' }];
  });
  const removeLine = (id: number) => setLines(current => current.length > 1 ? current.filter(line => line.id !== id) : current);

  const reset = () => { setLines([blankLine(1)]); setNote(''); setEditingId(null); setOpen(false); setAiText(''); setAiReflection(''); setAiSource(''); };
  const startNew = () => { setLines([blankLine(1)]); setNote(''); setEditingId(null); setOpen(true); setAiText(''); setAiReflection(''); setAiSource(''); };

  /* The AI box: describe the workout, Forge reads it back as editable rows. */
  const logWithAi = async () => {
    const description = aiText.trim();
    if (!description || aiBusy) return;
    setAiBusy(true); setAiReflection('');
    const local = parseCardioDescription(description);
    const parsed = await requestCardioParse(description, { savedCardioTypes: typeOptions, plannedToday: plannedSummary || null }, local);
    if (!parsed.rows.length) { setAiReflection(parsed.reflection || 'Could not read a workout from that.'); setAiSource(parsed.source); setAiBusy(false); return; }
    /* THE MODEL MAY NOT DELETE A DISTANCE THE ATHLETE TYPED. It returned
       "Run · 20:00" with distance 0 for a run that was 2.1 miles — a run worth
       zero miles to mileage, pace and every race goal. The local regex parser
       reads the same sentence deterministically, so when it finds distance and
       the model returned none, the model is overruled rather than trusted. */
    const aiDistance = parsed.rows.reduce((total, row) => total + (Number(row.distance) || 0), 0);
    const localDistance = local.rows.reduce((total, row) => total + (Number(row.distance) || 0), 0);
    const recoveredDistance = aiDistance === 0 && localDistance > 0;
    const sourceRows = recoveredDistance && local.rows.length === parsed.rows.length
      ? parsed.rows.map((row, index) => ({ ...row, distance: local.rows[index].distance, unit: local.rows[index].unit }))
      : recoveredDistance ? local.rows : parsed.rows;
    /* The AI logger may return a distance against a time unit ("2.1 minutes").
       Its unit is a suggestion, not a fact — a stated distance always lands on
       a distance unit so the miles are real. */
    const rows = sourceRows.map((row, index) => ({ id: Date.now() + index, cardioType: row.cardioType, unit: Number(row.distance) > 0 && !isDistanceUnit(row.unit) ? distanceUnitFor(row.cardioType) : row.unit, distance: row.distance ? String(row.distance) : '', time: minutesToClock(row.timeMinutes) }));
    const noteText = parsed.note && !note ? parsed.note : note;
    /* "Log it" logs it. The rows used to land in the composer for a second
       confirming tap, and a session that never got that tap was thrown away
       on save. It commits straight to the day now and stays editable in the
       list above. */
    const reflection = recoveredDistance ? `${parsed.reflection} (Distance read from your words — the logger had left it blank.)`.trim() : parsed.reflection;
    if (commit(rows, noteText)) { reset(); setAiReflection(reflection); setAiSource(parsed.source); setAiBusy(false); return; }
    setLines(rows);
    if (parsed.note && !note) setNote(parsed.note);
    setAiReflection(reflection);
    setAiSource(parsed.source);
    setAiBusy(false);
  };

  const editEntry = (entry: CardioLogDraft) => {
    setLines(linesFromDraft(entry));
    setNote(String(entry.prescription.note || ''));
    setEditingId(entry.id);
    setOpen(true);
  };

  const summary = summarize(lines);
  /* A run with a time but no distance is worth zero miles to weekly mileage,
     pace, and every endurance goal — and it looks logged. The AI logger did
     exactly this ("Run · 20:00"), so the gap is named rather than left to be
     discovered in a mileage total that quietly stops moving. */
  const milelessRuns = lines.filter(line => /run|jog|walk/i.test(line.cardioType) && clockToMinutes(line.time) > 0 && !(Number(line.distance) > 0)).length;

  /* One commit path for every way a session gets logged — typed rows, the AI
     box, a library template. Logging IS saving: the entry lands in the day
     immediately rather than waiting on a second button, which is how a
     session got typed in and then silently dropped. */
  const commit = (sourceLines: CardioLine[], noteText: string) => {
    const filled = sourceLines.filter(line => Number(line.distance) > 0 || clockToMinutes(line.time) > 0);
    if (!filled.length) return false;
    const legacyIntervals = filled.map(line => ({
      cardioType: line.cardioType.trim() || 'Cardio',
      unit: line.unit,
      distance: Number(line.distance) || 0,
      time: clockToMinutes(line.time),
    }));
    const draft: CardioLogDraft = {
      id: editingId || crypto.randomUUID(),
      structure: 'steady',
      activity: legacyIntervals[0].cardioType,
      summary: summarize(filled),
      prescription: { legacyIntervals, distanceUnit: legacyIntervals[0].unit, note: noteText.trim() || undefined },
    };
    setSavedEntries(items => editingId ? items.map(item => item.id === editingId ? draft : item) : [...items, draft]);
    return true;
  };
  const save = () => { if (commit(lines, note)) reset(); };

  return <section className="card form-card cardio-log">
    <div className="section-title compact-title">
      <span>{sectionNumber}</span>
      <div><h3>Cardio</h3><p>Log what you actually did. Add a line for each interval.</p></div>
    </div>

    {savedEntries.length > 0 && <div className="cardio-log-saved">
      {savedEntries.map((entry, index) => <div key={entry.id}>
        <span>{String(index + 1).padStart(2, '0')}</span>
        <div><strong>{entry.summary}</strong>{entry.prescription.note ? <small>{String(entry.prescription.note)}</small> : null}</div>
        <button type="button" onClick={() => editEntry(entry)}>Edit</button>
        <button type="button" onClick={() => setSavedEntries(items => items.filter(item => item.id !== entry.id))}>Remove</button>
      </div>)}
    </div>}

    {!open && plannedSummary && <p className="cardio-log-planned"><span>PLANNED</span>{plannedSummary}</p>}
    {!open && savedTemplates.length > 0 && <div className="cardio-template-row"><span className="field-caption">ONE-TAP FROM LIBRARY</span><div>{savedTemplates.slice(0, 6).map(workout => <button type="button" key={workout.id} onClick={() => logTemplate(workout)}>{workout.name}</button>)}</div></div>}
    {!open && <button type="button" className="button secondary wide" onClick={startNew}>＋ {savedEntries.length ? 'Add another cardio entry' : 'Add cardio'}</button>}

    {open && <div className="cardio-log-composer">
      <div className="cardio-ai-box">
        <span className="cardio-ai-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/><circle cx="12" cy="12" r="4"/></svg>Describe it — Forge logs it</span>
        <textarea rows={2} value={aiText} onChange={event => setAiText(event.target.value)} placeholder="“4 mile run in 32:10, last mile hard” or “6x400m at 90s with 2 min jog, 1 mile warmup”" />
        <div className="cardio-ai-actions">
          <button type="button" className="button small-button" disabled={aiBusy || !aiText.trim()} onClick={logWithAi}>{aiBusy ? 'Reading…' : 'Log it'}</button>
          <small>Logs straight to today — edit it above if anything is off.</small>
        </div>
        {aiReflection && <p className={`cardio-ai-reflection${aiSource === 'local' ? ' local' : ''}`}><b>{aiSource === 'ai' ? 'FORGE' : 'QUICK PARSE'}</b>{aiReflection}</p>}
      </div>
      <datalist id="cardio-type-options">{typeOptions.map(option => <option value={option} key={option} />)}</datalist>

      <div className="cardio-log-lines">
        {lines.map((line, index) => <div className="cardio-log-line" key={line.id}>
          <label className="cardio-log-type"><span className="cardio-log-label">Type</span>
            <input list="cardio-type-options" value={line.cardioType} onChange={event => changeType(line.id, event.target.value)} placeholder="Run" />
          </label>
          <label className="cardio-log-distance"><span className="cardio-log-label">Distance</span>
            <input type="number" inputMode="decimal" min="0" step="0.01" value={line.distance} onChange={event => updateLine(line.id, Number(event.target.value) > 0 && !isDistanceUnit(line.unit) ? { distance: event.target.value, unit: distanceUnitFor(line.cardioType) } : { distance: event.target.value })} placeholder="0" />
          </label>
          <label className="cardio-log-unit"><span className="cardio-log-label">Unit</span>
            <select value={line.unit} onChange={event => updateLine(line.id, { unit: event.target.value })}>
              {(Number(line.distance) > 0 ? DISTANCE_UNITS : ALL_UNITS).map(unit => <option value={unit} key={unit}>{unit}</option>)}
            </select>
          </label>
          <label className="cardio-log-time"><span className="cardio-log-label">Time</span>
            <input inputMode="numeric" value={line.time} onChange={event => updateLine(line.id, { time: event.target.value })} placeholder="mm:ss" />
          </label>
          {(linePace(line) || lines.length > 1) && <div className="cardio-log-line-end">
            {linePace(line) && <em>{linePace(line)}</em>}
            {lines.length > 1 && <button type="button" onClick={() => removeLine(line.id)} aria-label={`Remove line ${index + 1}`}>×</button>}
          </div>}
        </div>)}
      </div>

      <button type="button" className="cardio-log-add-line" onClick={addLine}>＋ Add line</button>

      <label className="cardio-log-note"><span className="field-caption">NOTE</span>
        <input value={note} onChange={event => setNote(event.target.value)} placeholder="Optional — how it felt, route, treadmill, weather" />
      </label>

      {summary && <p className="cardio-log-summary">{summary}</p>}
      {milelessRuns > 0 && <p className="cardio-log-warning" role="status">Add a distance — without one {milelessRuns > 1 ? 'these runs count' : 'this run counts'} as 0 miles toward your weekly mileage, pace, and race goals.</p>}

      <div className="cardio-log-actions">
        <button type="button" className="button" disabled={!summary} onClick={save}>{editingId ? 'Save changes' : 'Save cardio'}</button>
        <button type="button" className="button ghost" onClick={reset}>Cancel</button>
      </div>
    </div>}
  </section>;
}
