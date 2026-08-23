import { useEffect, useMemo, useState } from 'react';
import { useTrainingLibrary } from '../features/training/TrainingLibraryProvider';
import type { CardioLogDraft } from '../lib/cardioSession';

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

const unitFor = (type: string) => {
  const value = type.trim().toLowerCase();
  if (/row|ski/.test(value)) return 'meters';
  if (/swim/.test(value)) return 'yards';
  if (/elliptical|jump rope|stair/.test(value)) return 'minutes';
  return 'miles';
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
    unit: String(row.unit || row.distanceUnit || 'miles'),
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
  const { exercises } = useTrainingLibrary();
  const [savedEntries, setSavedEntries] = useState<CardioLogDraft[]>(initialEntries);
  const [open, setOpen] = useState(initialOpen);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [lines, setLines] = useState<CardioLine[]>([blankLine(1)]);
  const [note, setNote] = useState('');

  useEffect(() => onEntriesChange?.(savedEntries.length > 0, savedEntries), [savedEntries, onEntriesChange]);

  const typeOptions = useMemo(() => {
    const fromLibrary = exercises.filter(exercise => exercise.enabled && exercise.kind === 'Cardio').map(exercise => exercise.name);
    return Array.from(new Set([...STAPLE_TYPES, ...fromLibrary]));
  }, [exercises]);

  const updateLine = (id: number, change: Partial<CardioLine>) => setLines(current => current.map(line => line.id === id ? { ...line, ...change } : line));
  const changeType = (id: number, cardioType: string) => setLines(current => current.map(line => line.id === id ? { ...line, cardioType, unit: unitFor(cardioType) } : line));
  const addLine = () => setLines(current => {
    const last = current[current.length - 1];
    return [...current, { id: Date.now(), cardioType: last?.cardioType || 'Run', unit: last?.unit || 'miles', distance: last?.distance || '', time: '' }];
  });
  const removeLine = (id: number) => setLines(current => current.length > 1 ? current.filter(line => line.id !== id) : current);

  const reset = () => { setLines([blankLine(1)]); setNote(''); setEditingId(null); setOpen(false); };
  const startNew = () => { setLines([blankLine(1)]); setNote(''); setEditingId(null); setOpen(true); };

  const editEntry = (entry: CardioLogDraft) => {
    setLines(linesFromDraft(entry));
    setNote(String(entry.prescription.note || ''));
    setEditingId(entry.id);
    setOpen(true);
  };

  const summary = summarize(lines);

  const save = () => {
    const filled = lines.filter(line => Number(line.distance) > 0 || clockToMinutes(line.time) > 0);
    if (!filled.length) return;
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
      prescription: { legacyIntervals, distanceUnit: legacyIntervals[0].unit, note: note.trim() || undefined },
    };
    setSavedEntries(items => editingId ? items.map(item => item.id === editingId ? draft : item) : [...items, draft]);
    reset();
  };

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
    {!open && <button type="button" className="button secondary wide" onClick={startNew}>＋ {savedEntries.length ? 'Add another cardio entry' : 'Add cardio'}</button>}

    {open && <div className="cardio-log-composer">
      <datalist id="cardio-type-options">{typeOptions.map(option => <option value={option} key={option} />)}</datalist>

      <div className="cardio-log-lines">
        {lines.map((line, index) => <div className="cardio-log-line" key={line.id}>
          <label className="cardio-log-type"><span className="cardio-log-label">Type</span>
            <input list="cardio-type-options" value={line.cardioType} onChange={event => changeType(line.id, event.target.value)} placeholder="Run" />
          </label>
          <label className="cardio-log-distance"><span className="cardio-log-label">Distance</span>
            <input type="number" inputMode="decimal" min="0" step="0.01" value={line.distance} onChange={event => updateLine(line.id, { distance: event.target.value })} placeholder="0" />
          </label>
          <label className="cardio-log-unit"><span className="cardio-log-label">Unit</span>
            <select value={line.unit} onChange={event => updateLine(line.id, { unit: event.target.value })}>
              {ALL_UNITS.map(unit => <option value={unit} key={unit}>{unit}</option>)}
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

      <div className="cardio-log-actions">
        <button type="button" className="button" disabled={!summary} onClick={save}>{editingId ? 'Save changes' : 'Save cardio'}</button>
        <button type="button" className="button ghost" onClick={reset}>Cancel</button>
      </div>
    </div>}
  </section>;
}
